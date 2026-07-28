import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
} from '@affiliate-tracker/database';

import type { EncryptedEmailPayload } from './email-payload-cipher.js';
import type { InvitationRepositoryContext } from './company-invitations.types.js';

type NotificationIdRow =
  Readonly<{
    id: string;
  }> &
  Record<string, unknown>;

export interface EnqueueInvitationEmailInput {
  readonly invitationId: string;
  readonly companyId: string;
  readonly recipientEmail: string;
  readonly recipientName: string | null;
  readonly subject: string;
  readonly encryptedPayload: EncryptedEmailPayload;
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly maxAttempts: number;
}

export interface InvitationEmailOutboxRepository {
  enqueue(
    context: InvitationRepositoryContext,
    input: EnqueueInvitationEmailInput,
  ): Promise<string>;

  cancelPending(
    context: InvitationRepositoryContext,
    invitationId: string,
  ): Promise<void>;
}

function createSessionContext(
  context: InvitationRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId === undefined ? {} : { companyId: context.companyId }),
  };
}

function validateMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('Email notification maxAttempts must be between 1 and 20.');
  }

  return value;
}

export function createInvitationEmailOutboxRepository(
  database: DatabaseRuntime,
): InvitationEmailOutboxRepository {
  return Object.freeze<InvitationEmailOutboxRepository>({
    async enqueue(
      context: InvitationRepositoryContext,
      input: EnqueueInvitationEmailInput,
    ): Promise<string> {
      const maxAttempts = validateMaxAttempts(input.maxAttempts);

      return database.transaction(
        async (transaction): Promise<string> => {
          const invitationResult = await transaction.query({
            name: 'invitation-email-outbox-bind-user',
            text: `
              update public.company_invitations
              set
                user_id = $3,
                delivery_status = 'pending',
                last_delivery_error_code = null
              where id = $1
                and company_id = $2
                and status = 'pending'
            `,
            values: [
              input.invitationId,
              input.companyId,
              input.userId,
            ],
          });

          if (invitationResult.rowCount !== 1) {
            throw new Error(
              'The invitation changed before its email notification could be queued.',
            );
          }

          const insertResult = await transaction.query<NotificationIdRow>({
            name: 'invitation-email-outbox-insert',
            text: `
              insert into public.email_notifications (
                company_id,
                invitation_id,
                notification_type,
                provider,
                recipient_email,
                recipient_name,
                subject,
                template_code,
                payload_ciphertext,
                payload_iv,
                payload_auth_tag,
                idempotency_key,
                status,
                available_at,
                max_attempts
              ) values (
                $1,
                $2,
                'company_invitation',
                'brevo',
                $3,
                $4,
                $5,
                'company_invitation_v1',
                $6,
                $7,
                $8,
                $9,
                'pending',
                now(),
                $10
              )
              on conflict (idempotency_key) do nothing
              returning id
            `,
            values: [
              input.companyId,
              input.invitationId,
              input.recipientEmail,
              input.recipientName,
              input.subject,
              input.encryptedPayload.ciphertext,
              input.encryptedPayload.iv,
              input.encryptedPayload.authTag,
              input.idempotencyKey,
              maxAttempts,
            ],
          });

          let notificationId = insertResult.rows[0]?.id;

          if (notificationId === undefined) {
            const existingResult = await transaction.query<NotificationIdRow>({
              name: 'invitation-email-outbox-get-existing',
              text: `
                select id
                from public.email_notifications
                where idempotency_key = $1
                limit 1
              `,
              values: [input.idempotencyKey],
            });

            notificationId = existingResult.rows[0]?.id;
          }

          if (notificationId === undefined) {
            throw new Error('The email notification could not be persisted.');
          }

          await transaction.query({
            name: 'invitation-email-outbox-cancel-older',
            text: `
              update public.email_notifications
              set
                status = 'cancelled',
                cancelled_at = now()
              where invitation_id = $1
                and id <> $2
                and status in (
                  'pending',
                  'queued',
                  'retry_scheduled'
                )
            `,
            values: [
              input.invitationId,
              notificationId,
            ],
          });

          return notificationId;
        },
        {
          sessionContext: createSessionContext(context),
        },
      );
    },

    async cancelPending(
      context: InvitationRepositoryContext,
      invitationId: string,
    ): Promise<void> {
      await database.transaction(
        async (transaction): Promise<void> => {
          await transaction.query({
            name: 'invitation-email-outbox-cancel-pending',
            text: `
              update public.email_notifications
              set
                status = 'cancelled',
                cancelled_at = now()
              where invitation_id = $1
                and status in (
                  'pending',
                  'queued',
                  'retry_scheduled'
                )
            `,
            values: [invitationId],
          });
        },
        {
          sessionContext: createSessionContext(context),
        },
      );
    },
  });
}
