export type CompanySmtpSecureMode = 'plain' | 'starttls' | 'tls';
export type CompanySmtpConfigurationStatus = 'active' | 'disabled';
export type CompanySmtpTestStatus = 'pending' | 'sent' | 'failed';

export interface ReportingPeriod {
  readonly from: string;
  readonly to: string;
}

export interface ReportingMonetaryTotal {
  readonly currency: string;
  readonly revenueAmountMinor: number;
  readonly payoutAmountMinor: number;
}

export interface ReportingTotals {
  readonly clicks: number;
  readonly uniqueVisitors: number;
  readonly duplicateClicks: number;
  readonly highRiskClicks: number;
  readonly conversions: number;
  readonly approvedConversions: number;
  readonly monetaryTotals: readonly ReportingMonetaryTotal[];
}

export interface ReportingPerformanceRow {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly clicks: number;
  readonly conversions: number;
  readonly approvedConversions: number;
  readonly monetaryTotals: readonly ReportingMonetaryTotal[];
}

export interface CompanyReportingDashboard {
  readonly companyId: string;
  readonly period: ReportingPeriod;
  readonly totals: ReportingTotals;
  readonly offers: readonly ReportingPerformanceRow[];
  readonly networkAccounts: readonly ReportingPerformanceRow[];
  readonly members: readonly ReportingPerformanceRow[];
}

export interface ListCompanyReportingInput {
  readonly from?: string;
  readonly to?: string;
  readonly offerId?: string;
  readonly networkAccountId?: string;
  readonly ownerMembershipId?: string;
}

export interface OperationalEventRecord {
  readonly id: string;
  readonly companyId: string | null;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
  readonly eventName: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ListOperationalEventsInput {
  readonly eventName?: string;
  readonly entityType?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface CompanyCustomizationRecord {
  readonly id: string;
  readonly companyId: string;
  readonly brandName: string | null;
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly supportEmail: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateCompanyCustomizationInput {
  readonly brandName?: string | null;
  readonly logoUrl?: string | null;
  readonly primaryColor?: string | null;
  readonly secondaryColor?: string | null;
  readonly supportEmail?: string | null;
}

export interface CompanySmtpConfigurationRecord {
  readonly id: string;
  readonly companyId: string;
  readonly host: string;
  readonly port: number;
  readonly secureMode: CompanySmtpSecureMode;
  readonly username: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly replyToEmail: string | null;
  readonly status: CompanySmtpConfigurationStatus;
  readonly hasPassword: boolean;
  readonly passwordUpdatedAt: string;
  readonly lastTestedAt: string | null;
  readonly lastTestStatus: CompanySmtpTestStatus | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompanySmtpSecretRecord extends CompanySmtpConfigurationRecord {
  readonly encryptedPassword: string;
  readonly passwordIv: string;
  readonly passwordAuthTag: string;
}

export interface UpdateCompanySmtpConfigurationInput {
  readonly host: string;
  readonly port: number;
  readonly secureMode: CompanySmtpSecureMode;
  readonly username: string;
  readonly password?: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly replyToEmail?: string | null;
  readonly status?: CompanySmtpConfigurationStatus;
}

export interface CompanySmtpWriteInput {
  readonly host: string;
  readonly port: number;
  readonly secureMode: CompanySmtpSecureMode;
  readonly username: string;
  readonly encryptedPassword: string;
  readonly passwordIv: string;
  readonly passwordAuthTag: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly replyToEmail: string | null;
  readonly status: CompanySmtpConfigurationStatus;
  readonly passwordUpdatedAt: string;
}

export interface TestCompanySmtpInput {
  readonly recipientEmail: string;
}

export interface CompanySmtpTestResult {
  readonly eventId: string;
  readonly status: 'sent';
  readonly recipientEmail: string;
  readonly completedAt: string;
}

export interface CompanyOperationsRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId: string;
}

export interface ReportingScope {
  readonly ownerUserId?: string;
}

export interface EncryptedCredential {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}

export interface CompanyMailMessage {
  readonly recipientEmail: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly replyToEmail: string | null;
  readonly subject: string;
  readonly text: string;
}

export interface CompanyMailConnection {
  readonly host: string;
  readonly port: number;
  readonly secureMode: CompanySmtpSecureMode;
  readonly username: string;
  readonly password: string;
}
