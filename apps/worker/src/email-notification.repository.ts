import type {
  DatabaseRuntime,
  DatabaseTransaction,
} from '@affiliate-tracker/database';

import type { EncryptedEmailPayload } from './email-notification.types.js';

const STALE_PROCESSING_MS = 30_000;

type NotificationRow =
  Readonly<{
    id: string;
    company_id: string;
    invitation_id: string | null;
    notification_type: string;
    recipient_email: string;
    recipient_name: string | null;
    subject: string;
    template_code: string;
    payload_ciphertext: string;
    payload_iv: string;
    payload_auth_tag: string;
    status: string;
    processing_started_at: Date | string | null;
    attempt_count: number;
    max_attempts: number;
    invitation_status: string | null;
    invitation_expires_at: Date | string | null;
  }> &
  Record<string, unknown>;

type InvitationRow =
  Readonly<{
    invitation_id: string | null;
  }> &
  Record<string, unknown>;

export interface ClaimedNotification {
  readonly id: string;
  readonly companyId: string;
  readonly invitationId: string | null;
  readonly notificationType: string;
  readonly recipientEmail: string;
  readonly recipientName: string | null;
  readonly subject: string;
  readonly templateCode: string;
  readonly encryptedPayload: EncryptedEmailPayload;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}

export type ClaimResult =
  | Readonly<{
      kind: 'claimed';
      notification: ClaimedNotification;
    }>
  | Readonly<{
      kind: 'skipped';
      reason:
        | 'not_found'
        | 'terminal'
        | 'processing'
        | 'cancelled'
        | 'attempts_exhausted';
    }>;

export interface MarkFailedInput {
  readonly notificationId: string;
  readonly attemptNumber: number;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryScheduled: boolean;
  readonly retryDelayMs: number;
}

export interface EmailNotificationRepository {
  claim(notificationId: string): Promise<ClaimResult>;

  markSent(
    notificationId: string,
    attemptNumber: number,
    messageId: string,
  ): Promise<void>;

  markFailed(input: MarkFailedInput): Promise<void>;
}

function timestamp(value: Date | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (Number.isNaN(parsed)) {
    throw new Error('Database returned an invalid notification timestamp.');
  }

  return parsed;
}

function mapNotification(
  row: NotificationRow,
  attemptNumber: number,
): ClaimedNotification {
  return Object.freeze({
    id: row.id,
    companyId: row.company_id,
    invitationId: row.invitation_id,
    notificationType: row.notification_type,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    subject: row.subject,
    templateCode: row.template_code,
    encryptedPayload: Object.freeze({
      ciphertext: row.payload_ciphertext,
      iv: row.payload_iv,
      authTag: row.payload_auth_tag,
    }),
    attemptNumber,
    maxAttempts: row.max_attempts,
  });
}

async function cancelNotification(
  transaction: DatabaseTransaction,
  notificationId: string,
): Promise<void> {
  await transaction.query({
    name: 'email-notification-cancel',
    text: `
      update public.email_notifications
      set
        status = 'cancelled',
        cancelled_at = now(),
        processing_started_at = null
      where id = $1
        and status not in ('sent', 'failed', 'cancelled')
    `,
    values: [notificationId],
  });
}

async function recoverStaleAttempt(
  transaction: DatabaseTransaction,
  row: NotificationRow,
): Promise<void> {
  await transaction.query({
    name: 'email-notification-recover-stale-attempt',
    text: `
      update public.email_delivery_attempts
      set
        status = 'failed',
        completed_at = now(),
        error_code = 'STALE_PROCESSING_RECOVERED',
        error_message = 'A stale processing attempt was recovered.'
      where notification_id = $1
        and attempt_number = $2
        and status = 'processing'
    `,
    values: [row.id, row.attempt_count],
  });

  await transaction.query({
    name: 'email-notification-recover-stale-record',
    text: `
      update public.email_notifications
      set
        status = 'retry_scheduled',
        processing_started_at = null,
        available_at = now(),
        last_error_code = 'STALE_PROCESSING_RECOVERED',
        last_error_message = 'A stale processing attempt was recovered.'
      where id = $1
        and status = 'processing'
    `,
    values: [row.id],
  });
}

async function exhaustAttempts(
  transaction: DatabaseTransaction,
  row: NotificationRow,
): Promise<void> {
  await transaction.query({
    name: 'email-notification-exhaust-attempts',
    text: `
      update public.email_notifications
      set
        status = 'failed',
        failed_at = now(),
        processing_started_at = null,
        last_error_code = 'EMAIL_MAX_ATTEMPTS_EXHAUSTED',
        last_error_message = 'Maximum email delivery attempts reached.'
      where id = $1
        and status not in ('sent', 'failed', 'cancelled')
    `,
    values: [row.id],
  });

  if (row.invitation_id !== null) {
    await transaction.query({
      name: 'email-invitation-exhaust-attempts',
      text: `
        update public.company_invitations
        set
          delivery_status = 'failed',
          last_delivery_error_code = 'EMAIL_MAX_ATTEMPTS_EXHAUSTED'
        where id = $1
          and status = 'pending'
      `,
      values: [row.invitation_id],
    });
  }
}

export function createEmailNotificationRepository(
  database: DatabaseRuntime,
): EmailNotificationRepository {
  return Object.freeze<EmailNotificationRepository>({
    async claim(notificationId: string): Promise<ClaimResult> {
      return database.transaction(
        async (transaction): Promise<ClaimResult> => {
          const result = await transaction.query<NotificationRow>({
            name: 'email-notification-lock',
            text: `
              select
                notification.id,
                notification.company_id,
                notification.invitation_id,
                notification.notification_type,
                notification.recipient_email,
                notification.recipient_name,
                notification.subject,
                notification.template_code,
                notification.payload_ciphertext,
                notification.payload_iv,
                notification.payload_auth_tag,
                notification.status,
                notification.processing_started_at,
                notification.attempt_count,
                notification.max_attempts,
                invitation.status as invitation_status,
                invitation.expires_at as invitation_expires_at
              from public.email_notifications as notification
              left join public.company_invitations as invitation
                on invitation.id = notification.invitation_id
              where notification.id = $1
              limit 1
              for update of notification
            `,
            values: [notificationId],
          });

          const row = result.rows[0];

          if (row === undefined) {
            return Object.freeze({ kind: 'skipped', reason: 'not_found' });
          }

          if (
            row.status === 'sent' ||
            row.status === 'failed' ||
            row.status === 'cancelled'
          ) {
            return Object.freeze({ kind: 'skipped', reason: 'terminal' });
          }

          if (row.status === 'processing') {
            const processingStarted = timestamp(row.processing_started_at);
            const processingAge =
              processingStarted === null
                ? Number.POSITIVE_INFINITY
                : Date.now() - processingStarted;

            if (processingAge < STALE_PROCESSING_MS) {
              return Object.freeze({ kind: 'skipped', reason: 'processing' });
            }

            await recoverStaleAttempt(transaction, row);
          }

          if (row.invitation_id !== null) {
            const expiresAt = timestamp(row.invitation_expires_at);

            if (
              row.invitation_status !== 'pending' ||
              expiresAt === null ||
              expiresAt <= Date.now()
            ) {
              await cancelNotification(transaction, row.id);
              return Object.freeze({ kind: 'skipped', reason: 'cancelled' });
            }
          }

          if (row.attempt_count >= row.max_attempts) {
            await exhaustAttempts(transaction, row);
            return Object.freeze({
              kind: 'skipped',
              reason: 'attempts_exhausted',
            });
          }

          const attemptNumber = row.attempt_count + 1;
          const claimedResult = await transaction.query<NotificationRow>({
            name: 'email-notification-claim',
            text: `
              update public.email_notifications
              set
                status = 'processing',
                queued_at = coalesce(queued_at, now()),
                processing_started_at = now(),
                attempt_count = $2,
                last_error_code = null,
                last_error_message = null
              where id = $1
                and status in ('pending', 'queued', 'retry_scheduled')
              returning
                id,
                company_id,
                invitation_id,
                notification_type,
                recipient_email,
                recipient_name,
                subject,
                template_code,
                payload_ciphertext,
                payload_iv,
                payload_auth_tag,
                status,
                processing_started_at,
                attempt_count,
                max_attempts,
                null::text as invitation_status,
                null::timestamptz as invitation_expires_at
            `,
            values: [row.id, attemptNumber],
          });

          const claimedRow = claimedResult.rows[0];

          if (claimedRow === undefined) {
            return Object.freeze({ kind: 'skipped', reason: 'processing' });
          }

          await transaction.query({
            name: 'email-notification-create-attempt',
            text: `
              insert into public.email_delivery_attempts (
                notification_id,
                attempt_number,
                provider,
                status
              ) values ($1, $2, 'brevo', 'processing')
            `,
            values: [row.id, attemptNumber],
          });

          return Object.freeze({
            kind: 'claimed',
            notification: mapNotification(claimedRow, attemptNumber),
          });
        },
        {
          isolationLevel: 'read committed',
        },
      );
    },

    async markSent(
      notificationId: string,
      attemptNumber: number,
      messageId: string,
    ): Promise<void> {
      await database.transaction(async (transaction): Promise<void> => {
        const attemptResult = await transaction.query({
          name: 'email-notification-attempt-sent',
          text: `
            update public.email_delivery_attempts
            set
              status = 'sent',
              completed_at = now(),
              provider_message_id = $3,
              error_code = null,
              error_message = null
            where notification_id = $1
              and attempt_number = $2
              and status = 'processing'
          `,
          values: [notificationId, attemptNumber, messageId],
        });

        if (attemptResult.rowCount !== 1) {
          throw new Error(
            'Email delivery attempt changed before it was marked sent.',
          );
        }

        const notificationResult = await transaction.query<InvitationRow>({
          name: 'email-notification-mark-sent',
          text: `
            update public.email_notifications
            set
              status = 'sent',
              sent_at = now(),
              failed_at = null,
              processing_started_at = null,
              provider_message_id = $3,
              last_error_code = null,
              last_error_message = null
            where id = $1
              and attempt_count = $2
              and status = 'processing'
            returning invitation_id
          `,
          values: [notificationId, attemptNumber, messageId],
        });

        const notification = notificationResult.rows[0];

        if (notification === undefined) {
          throw new Error(
            'Email notification changed before it was marked sent.',
          );
        }

        if (notification.invitation_id !== null) {
          await transaction.query({
            name: 'email-invitation-mark-sent',
            text: `
              update public.company_invitations
              set
                delivery_status = 'sent',
                last_sent_at = now(),
                send_count = send_count + 1,
                last_delivery_error_code = null
              where id = $1
                and status = 'pending'
            `,
            values: [notification.invitation_id],
          });
        }
      });
    },

    async markFailed(input: MarkFailedInput): Promise<void> {
      await database.transaction(async (transaction): Promise<void> => {
        const attemptResult = await transaction.query({
          name: 'email-notification-attempt-failed',
          text: `
            update public.email_delivery_attempts
            set
              status = 'failed',
              completed_at = now(),
              error_code = $3,
              error_message = $4
            where notification_id = $1
              and attempt_number = $2
              and status = 'processing'
          `,
          values: [
            input.notificationId,
            input.attemptNumber,
            input.errorCode,
            input.errorMessage,
          ],
        });

        if (attemptResult.rowCount !== 1) {
          throw new Error(
            'Email delivery attempt changed before failure was recorded.',
          );
        }

        const notificationResult = await transaction.query<InvitationRow>({
          name: 'email-notification-mark-failed',
          text: `
            update public.email_notifications
            set
              status = case
                when $5::boolean
                then 'retry_scheduled'::public.email_notification_status
                else 'failed'::public.email_notification_status
              end,
              available_at = case
                when $5::boolean
                then now() + ($6::integer * interval '1 millisecond')
                else available_at
              end,
              processing_started_at = null,
              failed_at = case
                when $5::boolean then null
                else now()
              end,
              last_error_code = $3,
              last_error_message = $4
            where id = $1
              and attempt_count = $2
              and status = 'processing'
            returning invitation_id
          `,
          values: [
            input.notificationId,
            input.attemptNumber,
            input.errorCode,
            input.errorMessage,
            input.retryScheduled,
            input.retryDelayMs,
          ],
        });

        const notification = notificationResult.rows[0];

        if (notification === undefined) {
          throw new Error(
            'Email notification changed before failure was recorded.',
          );
        }

        if (notification.invitation_id !== null) {
          await transaction.query({
            name: 'email-invitation-mark-failed',
            text: `
              update public.company_invitations
              set
                delivery_status = case
                  when $2::boolean
                  then 'pending'::public.company_invitation_delivery_status
                  else 'failed'::public.company_invitation_delivery_status
                end,
                send_count = send_count + 1,
                last_delivery_error_code = $3
              where id = $1
                and status = 'pending'
            `,
            values: [
              notification.invitation_id,
              input.retryScheduled,
              input.errorCode,
            ],
          });
        }
      });
    },
  });
}
