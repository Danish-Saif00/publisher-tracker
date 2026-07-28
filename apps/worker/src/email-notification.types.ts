export type EmailNotificationProvider = 'brevo';
export type EmailNotificationStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'retry_scheduled'
  | 'sent'
  | 'failed'
  | 'cancelled';
export type EmailDeliveryAttemptStatus =
  | 'processing'
  | 'sent'
  | 'failed';
export interface EncryptedEmailPayload {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}
export type EmailNotificationPayload =
  Readonly<Record<string, unknown>>;