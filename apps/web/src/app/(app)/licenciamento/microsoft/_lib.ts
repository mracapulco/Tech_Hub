"use client";

export type Company = { id: string; name: string };
export type Site = { id: string; name: string };

export type AgreementDraft = {
  companyId: string;
  siteId?: string | null;
  category: string;
  productName: string;
  sku?: string | null;
  licenseType?: string | null;
  licenseChannel?: string | null;
  billingModel?: string | null;
  tenantName?: string | null;
  tenantDomain?: string | null;
  quantityPurchased?: number | null;
  quantityActive?: number | null;
  unitCost?: number | null;
  totalCost?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  startDate?: string | null;
  renewalDate?: string | null;
  expiresAt?: string | null;
  autoRenew: boolean;
  alertLeadDays: number;
  status?: string | null;
  notes?: string | null;
};

export type MicrosoftAgreement = {
  id: string;
  companyId?: string | null;
  companyName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  sourceProvider?: string | null;
  externalCustomerId?: string | null;
  externalCustomerName?: string | null;
  externalSubscriptionId?: string | null;
  vendorSubscriptionId?: string | null;
  productId?: string | null;
  mpn?: string | null;
  microsoftCustomerId?: string | null;
  microsoftTenantId?: string | null;
  microsoftDomain?: string | null;
  providerStatus?: string | null;
  renewalStatus?: boolean | null;
  isRecurring: boolean;
  isReadOnly: boolean;
  category: string;
  productName: string;
  sku?: string | null;
  licenseType?: string | null;
  licenseChannel?: string | null;
  billingModel?: string | null;
  subscriptionPeriod?: string | null;
  tenantName?: string | null;
  tenantDomain?: string | null;
  quantityPurchased?: number | null;
  quantityActive?: number | null;
  unitPrice?: number | null;
  unitCost?: number | null;
  totalPrice?: number | null;
  totalCost?: number | null;
  billingCost?: number | null;
  billingAmount?: number | null;
  margin?: number | null;
  marginPercent?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  startDate?: string | null;
  renewalDate?: string | null;
  expiresAt?: string | null;
  autoRenew: boolean;
  alertLeadDays: number;
  status: string;
  notes?: string | null;
  lastSeenAt?: string | null;
  sources: MicrosoftAgreementSource[];
  documents: MicrosoftAgreementDocument[];
  createdAt: string;
  updatedAt: string;
};

export type MicrosoftAgreementSource = {
  id: string;
  provider: string;
  sourceType: string;
  externalCustomerId?: string | null;
  externalCustomerName?: string | null;
  externalRecordId?: string | null;
  externalReference?: string | null;
  payloadSummary?: any;
  observedAt: string;
  confidence?: number | null;
  fieldCoverage?: any;
  createdAt: string;
  updatedAt: string;
};

export type MicrosoftAgreementDocument = {
  id: string;
  provider?: string | null;
  documentType: string;
  title: string;
  documentNumber?: string | null;
  fileUrl?: string | null;
  issuedAt?: string | null;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MicrosoftConnection = {
  id?: string | null;
  provider: string;
  environment: string;
  apiBaseUrl?: string | null;
  hasSubscriptionKey: boolean;
  maskedSubscriptionKey: string;
  apiUser?: string | null;
  hasApiPass: boolean;
  maskedApiPass: string;
  marketplace?: string | null;
  clientId?: string | null;
  hasClientSecret: boolean;
  maskedClientSecret: string;
  customerNumber?: string | null;
  countryCode?: string | null;
  senderId?: string | null;
  hasApiKey: boolean;
  maskedApiKey: string;
  status: string;
  lastTestAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  autoSyncEnabled: boolean;
  autoSyncIntervalHours?: number | null;
  nextSyncAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MicrosoftCustomerMap = {
  id: string;
  provider: string;
  externalCustomerId: string;
  externalCustomerName: string;
  externalStatus?: string | null;
  externalTaxId?: string | null;
  externalTenantId?: string | null;
  externalTenantDomain?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  matchStatus: string;
  confidence?: number | null;
  suggestedCompanyId?: string | null;
  suggestedCompanyName?: string | null;
  suggestedConfidence?: number | null;
  notes?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MicrosoftSyncRun = {
  id: string;
  provider: string;
  connectionId?: string | null;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  customersProcessed: number;
  subscriptionsFound: number;
  activeSubscriptions: number;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsIgnored: number;
  markedNotFound: number;
  errorCount: number;
  durationMs?: number | null;
  errorSummary?: string | null;
  createdAt: string;
};

export type MicrosoftOverviewContext = {
  selectedProvider: string;
  integrations: MicrosoftConnection[];
  externalCustomers: number;
  activeSubscriptions: number;
  latestSyncRun?: MicrosoftSyncRun | null;
};

export const microsoftProviders = [
  { value: "INGRAM", label: "Ingram Micro" },
  { value: "SCANSOURCE", label: "ScanSource" },
] as const;

export const microsoftAgreementStatuses = [
  "active",
  "pending",
  "removed",
  "terminated",
  "not_found",
  "ACTIVE",
  "EXPIRING_90",
  "EXPIRING_60",
  "EXPIRING_30",
  "EXPIRED",
  "AUTO_RENEW",
  "PENDING_MAPPING",
  "PENDING_REVIEW",
  "SYNC_ERROR",
  "CANCELLED",
] as const;

export const microsoftDocumentTypes = [
  "INVOICE",
  "CONTRACT",
  "PDF",
  "QUOTE",
  "ORDER",
  "OTHER",
] as const;

export const microsoftCategorySuggestions = [
  "Microsoft 365",
  "Office",
  "Windows",
  "Azure",
  "Dynamics 365",
  "Power Platform",
  "SQL Server",
  "Visual Studio",
  "Exchange",
  "Outro",
] as const;

export const microsoftLicenseTypeSuggestions = [
  "Subscription",
  "Perpétua",
  "OEM",
  "Retail",
  "Volume",
  "CSP",
  "EA",
  "NCE",
] as const;

export const microsoftBillingModelSuggestions = [
  "Mensal",
  "Anual",
  "Único",
  "Sob demanda",
] as const;

export const microsoftSubscriptionTypes = ["Todos", "Recorrente", "Não recorrente"] as const;

export function daysUntil(date?: string | null) {
  if (!date) return null;
  const dt = new Date(date).getTime();
  if (Number.isNaN(dt)) return null;
  return Math.ceil((dt - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatCurrency(amount?: number | null, currency?: string | null) {
  if (amount == null) return "-";
  const code = String(currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString();
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

export function formatBillingPeriod(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "[object object]") return "—";

  const normalized = raw.toLowerCase();
  const match = normalized.match(/^(\d+)\s+([a-z_]+)$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (["month", "months", "monthly"].includes(unit)) {
      if (amount === 1) return "Mensal";
      if (amount === 3) return "Trimestral";
      if (amount === 6) return "Semestral";
      if (amount === 12) return "Anual";
      return `${amount} meses`;
    }
    if (["year", "years", "yearly", "annual", "annually"].includes(unit)) {
      if (amount === 1) return "Anual";
      return `${amount} anos`;
    }
    if (["week", "weeks", "weekly"].includes(unit)) {
      if (amount === 1) return "Semanal";
      return `${amount} semanas`;
    }
    if (["day", "days", "daily"].includes(unit)) {
      if (amount === 1) return "Diário";
      return `${amount} dias`;
    }
  }

  const map: Record<string, string> = {
    month: "Mensal",
    monthly: "Mensal",
    mensal: "Mensal",
    year: "Anual",
    yearly: "Anual",
    annual: "Anual",
    annually: "Anual",
    anual: "Anual",
    once: "Único",
    one_time: "Único",
    onetime: "Único",
    unique: "Único",
    único: "Único",
    daily: "Diário",
    day: "Diário",
    weekly: "Semanal",
    week: "Semanal",
    quarterly: "Trimestral",
    quarter: "Trimestral",
    semiannual: "Semestral",
    semiannualy: "Semestral",
    half_year: "Semestral",
  };

  return map[normalized] || raw;
}

export function statusLabel(status?: string | null) {
  const raw = String(status || "");
  const value = raw.toUpperCase();
  const map: Record<string, string> = {
    INGRAM: "Ingram Micro",
    SCANSOURCE: "ScanSource",
    MANUAL: "Manual",
    ACTIVE: "Ativo",
    PENDING: "Pendente",
    REMOVED: "Removido",
    TERMINATED: "Encerrado",
    NOT_FOUND: "Não encontrado",
    EXPIRING_90: "Vence em 90 dias",
    EXPIRING_60: "Vence em 60 dias",
    EXPIRING_30: "Vence em 30 dias",
    EXPIRED: "Expirado",
    AUTO_RENEW: "Auto renovação",
    PENDING_MAPPING: "Mapeamento pendente",
    PENDING_REVIEW: "Revisão pendente",
    SYNC_ERROR: "Erro de sincronização",
    CANCELLED: "Cancelado",
    NOT_CONFIGURED: "Não configurado",
    CONFIGURED: "Configurado",
    CONNECTED: "Conectado",
    ERROR: "Com erro",
    SUGGESTED: "Sugerido",
    CONFIRMED: "Confirmado",
    IGNORED: "Ignorado",
    MAPPED: "Mapeado",
    UNMAPPED: "Não mapeado",
    REVIEW: "Revisar",
    RUNNING: "Em execução",
    SUCCESS: "Concluído",
    PARTIAL: "Parcial",
    RENEWAL: "Renovação",
    SUBSCRIPTION: "Assinatura",
    INVOICE: "Nota fiscal",
    ORDER: "Pedido",
    QUOTE: "Cotação",
    PRICING_AGREEMENT: "Acordo comercial",
  };
  return map[value] || raw || "-";
}

export function statusTone(status?: string | null) {
  const value = String(status || "").toUpperCase();
  if (["EXPIRED", "ERROR", "SYNC_ERROR", "CANCELLED", "TERMINATED", "REMOVED", "NOT_FOUND"].includes(value)) return "bg-red-100 text-red-700";
  if (["EXPIRING_30", "EXPIRING_60", "PARTIAL", "PENDING_MAPPING", "PENDING_REVIEW", "PENDING", "REVIEW"].includes(value)) return "bg-yellow-100 text-yellow-800";
  if (["CONNECTED", "ACTIVE", "AUTO_RENEW", "SUCCESS", "CONFIRMED", "MAPPED"].includes(value)) return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-700";
}

export function renewalTone(days?: number | null) {
  if (days == null) return "text-muted";
  if (days < 0 || days <= 7) return "text-red-600";
  if (days <= 30) return "text-amber-600";
  if (days <= 60) return "text-yellow-700";
  if (days <= 90) return "text-sky-700";
  return "text-text";
}

export function expirationTone(days?: number | null) {
  if (days == null) return "text-muted";
  if (days < 0 || days < 7) return "text-red-600";
  if (days < 14) return "text-orange-600";
  if (days < 21) return "text-yellow-700";
  return "text-sky-700";
}

export function expirationLabel(days?: number | null) {
  if (days == null) return "—";
  if (days < 0) return `Expirado há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "Expira hoje";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

export function agreementTypeLabel(item: Pick<MicrosoftAgreement, "isRecurring" | "providerStatus" | "renewalStatus" | "renewalDate">) {
  return item.isRecurring ? "Recorrente" : "Não recorrente";
}

export function emptyAgreementDraft(companyId = ""): AgreementDraft {
  return {
    companyId,
    siteId: "",
    category: "",
    productName: "",
    sku: "",
    licenseType: "",
    licenseChannel: "",
    billingModel: "",
    tenantName: "",
    tenantDomain: "",
    quantityPurchased: null,
    quantityActive: null,
    unitCost: null,
    totalCost: null,
    currency: "BRL",
    purchaseDate: "",
    startDate: "",
    renewalDate: "",
    expiresAt: "",
    autoRenew: false,
    alertLeadDays: 30,
    status: "",
    notes: "",
  };
}

export function getUploadUrl(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;
  if (fileUrl.startsWith("/uploads")) return `/api${fileUrl}`;
  return fileUrl;
}
