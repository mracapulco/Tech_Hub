import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

type SaveAgreementInput = {
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
  autoRenew?: boolean;
  alertLeadDays?: number | null;
  status?: string | null;
  notes?: string | null;
};

type SaveDocumentInput = {
  provider?: string | null;
  documentType: string;
  title: string;
  documentNumber?: string | null;
  fileUrl?: string | null;
  issuedAt?: string | null;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
};

type SaveConnectionInput = {
  environment?: string | null;
  apiBaseUrl?: string | null;
  subscriptionKey?: string | null;
  apiUser?: string | null;
  apiPass?: string | null;
  marketplace?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  customerNumber?: string | null;
  countryCode?: string | null;
  senderId?: string | null;
  apiKey?: string | null;
};

type SaveCustomerMapInput = {
  provider: string;
  externalCustomerId: string;
  externalCustomerName: string;
  externalStatus?: string | null;
  externalTaxId?: string | null;
  externalTenantId?: string | null;
  externalTenantDomain?: string | null;
  companyId?: string | null;
  matchStatus?: string | null;
  confidence?: number | null;
  notes?: string | null;
};

type IngramTokenResponse = {
  token?: string;
  expiresInSeconds?: number;
};

type IngramPagination = {
  offset: number;
  limit: number;
  total: number;
};

@Injectable()
export class MicrosoftService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeUpper(value?: string | null) {
    const normalized = this.normalizeText(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  private toDateOrNull(value?: string | null) {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  private toNumberOrNull(value?: number | string | null) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getMasterKey(): Buffer {
    const mk = process.env.CONFIG_MASTER_KEY;
    if (!mk) throw new Error('CONFIG_MASTER_KEY ausente.');
    return createHash('sha256').update(mk).digest();
  }

  private encrypt(value?: string | null) {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;
    const key = this.getMasterKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ciphertext.toString('base64'),
    });
  }

  private decrypt(valueEnc?: string | null) {
    if (!valueEnc) return null;
    const key = this.getMasterKey();
    const payload = JSON.parse(valueEnc);
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ct = Buffer.from(payload.ct, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  private maskSecret(value?: string | null) {
    const normalized = this.normalizeText(value);
    if (!normalized) return '';
    if (normalized.length <= 6) return '******';
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }

  private computeAgreementStatus(input: {
    renewalDate?: Date | null;
    expiresAt?: Date | null;
    autoRenew?: boolean | null;
    requestedStatus?: string | null;
  }) {
    const requested = this.normalizeUpper(input.requestedStatus);
    if (requested) return requested;

    const baseDate = input.renewalDate || input.expiresAt || null;
    if (!baseDate) return 'PENDING_REVIEW';
    const days = Math.ceil((baseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'EXPIRED';
    if (input.autoRenew) return 'AUTO_RENEW';
    if (days <= 30) return 'EXPIRING_30';
    if (days <= 60) return 'EXPIRING_60';
    if (days <= 90) return 'EXPIRING_90';
    return 'ACTIVE';
  }

  private normalizeProviderStatus(value?: string | null) {
    return this.normalizeText(value)?.toLowerCase() || null;
  }

  private normalizeAgreementCategory(productName?: string | null, mpn?: string | null, currentCategory?: string | null) {
    const explicit = this.normalizeText(currentCategory);
    if (explicit) return explicit;
    const haystack = `${productName || ''} ${mpn || ''}`.toLowerCase();
    if (haystack.includes('microsoft 365') || haystack.includes('office 365')) return 'Microsoft 365';
    if (haystack.includes('exchange online')) return 'Exchange Online';
    if (haystack.includes('power bi')) return 'Power BI';
    if (haystack.includes('project') || haystack.includes('planner')) return 'Project / Planner';
    if (haystack.includes('windows server')) return 'Windows Server';
    if (haystack.includes('sql server')) return 'SQL Server';
    if (haystack.includes('windows 11') || haystack.includes('windows 10') || haystack.includes('windows desktop')) return 'Windows Desktop';
    if (haystack.includes('cal') || haystack.includes('rds')) return 'CAL / RDS';
    return 'Outros';
  }

  private computeRecurring(input: {
    providerStatus?: string | null;
    renewalStatus?: boolean | null;
    renewalDate?: Date | null;
  }) {
    return this.normalizeProviderStatus(input.providerStatus) === 'active' && !!input.renewalStatus && !!input.renewalDate;
  }

  private cleanString(input?: string | null) {
    const value = this.normalizeText(input);
    return value ? value.replace(/\s+/g, ' ').trim() : '';
  }

  private onlyDigits(input?: string | null) {
    const value = this.normalizeText(input);
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits || null;
  }

  private similarityScore(a?: string | null, b?: string | null) {
    const left = this.cleanString(a).toLowerCase();
    const right = this.cleanString(b).toLowerCase();
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.92;
    const leftTokens = new Set(left.split(/[^a-z0-9]+/i).filter(Boolean));
    const rightTokens = new Set(right.split(/[^a-z0-9]+/i).filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let overlap = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) overlap += 1;
    }
    return overlap / Math.max(leftTokens.size, rightTokens.size);
  }

  private async suggestCompany(externalCustomerName?: string | null) {
    const name = this.normalizeText(externalCustomerName);
    if (!name) return null;
    const companies = await this.prisma.company.findMany({
      select: { id: true, name: true, fantasyName: true },
    });
    let best: { id: string; name: string; confidence: number } | null = null;
    for (const company of companies) {
      const candidates = [company.name, company.fantasyName];
      const confidence = Math.max(...candidates.map((item) => this.similarityScore(name, item)));
      if (!best || confidence > best.confidence) {
        best = { id: company.id, name: company.fantasyName || company.name, confidence };
      }
    }
    if (!best || best.confidence < 0.45) return null;
    return best;
  }

  private async findCompanyByCnpj(cnpj?: string | null) {
    const digits = this.onlyDigits(cnpj);
    if (!digits || digits.length !== 14) return null;
    return this.prisma.company.findUnique({
      where: { cnpj: digits },
      select: { id: true, name: true, fantasyName: true, cnpj: true },
    });
  }

  private toDecimalNumber(value: any): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return this.toNumberOrNull(value.replace(',', '.'));
    if (typeof value === 'object') {
      if ('amount' in value) return this.toDecimalNumber((value as any).amount);
      if ('value' in value) return this.toDecimalNumber((value as any).value);
    }
    return null;
  }

  private pickString(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      const normalized = this.normalizeText(value == null ? null : String(value));
      if (normalized) return normalized;
    }
    return null;
  }

  private pickDisplayString(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      if (value == null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const normalized = this.normalizeText(String(value));
        if (normalized) return normalized;
        continue;
      }
      if (typeof value === 'object') {
        for (const key of ['displayName', 'name', 'label', 'description', 'value', 'code', 'unit', 'type', 'id']) {
          const nested = (value as any)?.[key];
          const normalized = this.normalizeText(nested == null ? null : String(nested));
          if (normalized) return normalized;
        }
      }
    }
    return null;
  }

  private pickNamedParameterValue(source: any, collectionPaths: string[], names: string[]) {
    const normalizedNames = names.map((item) => item.toLowerCase());
    for (const path of collectionPaths) {
      const collection = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      if (!Array.isArray(collection)) continue;

      for (const entry of collection) {
        const entryName = this.normalizeText(entry?.name ?? entry?.Name)?.toLowerCase();
        if (!entryName || !normalizedNames.includes(entryName)) continue;
        const rawValue = entry?.value ?? entry?.Value ?? null;
        const normalizedValue = this.normalizeText(rawValue == null ? null : String(rawValue));
        if (normalizedValue) return normalizedValue;
      }
    }
    return null;
  }

  private pickPeriodLabel(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      if (value == null) continue;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const normalized = this.normalizeText(String(value));
        if (normalized) return normalized;
        continue;
      }

      if (typeof value === 'object') {
        const amountRaw =
          (value as any)?.BillingDuration ??
          (value as any)?.billingDuration ??
          (value as any)?.billingPeriod ??
          (value as any)?.BillingPeriod ??
          (value as any)?.subscriptionPeriod ??
          (value as any)?.SubscriptionDuration ??
          (value as any)?.subscriptionDuration ??
          (value as any)?.SubscriptionPeriod ??
          (value as any)?.period ??
          (value as any)?.value ??
          (value as any)?.count ??
          (value as any)?.duration;
        const unitRaw =
          (value as any)?.BillingPeriodUnit ??
          (value as any)?.billingPeriodUnit ??
          (value as any)?.BillingPeriod ??
          (value as any)?.billingPeriodUnit ??
          (value as any)?.billingPeriod ??
          (value as any)?.SubscriptionPeriodUnit ??
          (value as any)?.subscriptionPeriodUnit ??
          (value as any)?.SubscriptionPeriod ??
          (value as any)?.subscriptionPeriod ??
          (value as any)?.unit ??
          (value as any)?.periodUnit ??
          (value as any)?.name;

        const amount = this.normalizeText(amountRaw == null ? null : String(amountRaw));
        const unit = this.normalizeText(unitRaw == null ? null : String(unitRaw));

        if (amount && unit) return this.formatPeriodLabel(amount, unit);
        if (unit) return this.formatPeriodLabel(null, unit);

        for (const key of ['displayName', 'label', 'description', 'name', 'code', 'id']) {
          const nested = (value as any)?.[key];
          const normalized = this.normalizeText(nested == null ? null : String(nested));
          if (normalized) return normalized;
        }
      }
    }
    return null;
  }

  private formatPeriodLabel(amount?: string | null, unit?: string | null) {
    const normalizedUnit = this.normalizeText(unit)?.toLowerCase();
    const normalizedAmount = this.normalizeText(amount);
    const count = normalizedAmount ? Number(normalizedAmount) : NaN;
    const hasCount = Number.isFinite(count) && count > 0;

    const singularPlural = (single: string, plural: string) => (hasCount && count === 1 ? single : plural);

    if (!normalizedUnit) return normalizedAmount || null;

    if (['month', 'months', 'monthly', 'mensal', 'mes', 'meses'].includes(normalizedUnit)) {
      if (!hasCount || count === 1) return 'Mensal';
      if (count === 3) return 'Trimestral';
      if (count === 6) return 'Semestral';
      if (count === 12) return 'Anual';
      return `${count} ${singularPlural('mês', 'meses')}`;
    }

    if (['year', 'years', 'yearly', 'annual', 'annually', 'anual', 'ano', 'anos'].includes(normalizedUnit)) {
      if (!hasCount || count === 1) return 'Anual';
      return `${count} ${singularPlural('ano', 'anos')}`;
    }

    if (['week', 'weeks', 'weekly', 'semana', 'semanas'].includes(normalizedUnit)) {
      if (!hasCount || count === 1) return 'Semanal';
      return `${count} ${singularPlural('semana', 'semanas')}`;
    }

    if (['day', 'days', 'daily', 'dia', 'dias'].includes(normalizedUnit)) {
      if (!hasCount || count === 1) return 'Diário';
      return `${count} ${singularPlural('dia', 'dias')}`;
    }

    return [normalizedAmount, normalizedUnit].filter(Boolean).join(' ');
  }

  private resolvePeriodLabel(source: any, objectPaths: string[], amountPaths: string[], unitPaths: string[]) {
    const direct = this.pickPeriodLabel(source, objectPaths);
    if (direct) return direct;

    const amount = this.pickDisplayString(source, amountPaths);
    const unit = this.pickDisplayString(source, unitPaths);
    if (amount || unit) return this.formatPeriodLabel(amount, unit);

    return null;
  }

  private pickBoolean(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
      }
    }
    return null;
  }

  private pickNumber(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      const parsed = this.toDecimalNumber(value);
      if (parsed != null) return parsed;
    }
    return null;
  }

  private pickDate(source: any, paths: string[]) {
    for (const path of paths) {
      const value = path.split('.').reduce<any>((current, key) => (current == null ? null : current[key]), source);
      const parsed = this.toDateOrNull(value == null ? null : String(value));
      if (parsed) return parsed;
    }
    return null;
  }

  private parsePagination(payload: any): IngramPagination {
    const pagination = payload?.pagination || payload?.meta?.pagination || {};
    const offset = Number(pagination.offset ?? payload?.offset ?? 0) || 0;
    const limit = Number(pagination.limit ?? payload?.limit ?? 100) || 100;
    const total = Number(pagination.total ?? payload?.total ?? 0) || 0;
    return { offset, limit, total };
  }

  private extractCollection(payload: any) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  private buildSafePayloadSummary(detail: any) {
    return {
      subscriptionId: this.pickString(detail, ['id']),
      vendorSubscriptionId: this.pickString(detail, ['vendorSubscriptionId', 'vendorSubscription.id', 'products.0.vendorSubscriptionId']),
      productId: this.pickString(detail, ['productId', 'products.0.productId', 'products.0.id']),
      mpn: this.pickString(detail, ['products.0.mpn', 'mpn']),
      status: this.pickString(detail, ['status']),
      renewalStatus: this.pickBoolean(detail, ['renewalStatus']),
      renewalDate: this.pickString(detail, ['renewalDate']),
      expirationDate: this.pickString(detail, ['expirationDate', 'expiryDate']),
      billingPeriod: this.resolvePeriodLabel(
        detail,
        ['billingPeriod', 'BillingPeriod', 'products.0.billingPeriod', 'products.0.BillingPeriod'],
        ['billingDuration', 'BillingDuration', 'products.0.billingDuration', 'products.0.BillingDuration'],
        ['billingPeriod', 'BillingPeriod', 'billingPeriodUnit', 'BillingPeriodUnit', 'products.0.billingPeriod', 'products.0.BillingPeriod', 'products.0.billingPeriodUnit', 'products.0.BillingPeriodUnit'],
      ),
      subscriptionPeriod: this.resolvePeriodLabel(
        detail,
        ['subscriptionPeriod', 'SubscriptionPeriod', 'products.0.subscriptionPeriod', 'products.0.SubscriptionPeriod'],
        ['subscriptionDuration', 'SubscriptionDuration', 'products.0.subscriptionDuration', 'products.0.SubscriptionDuration'],
        ['subscriptionPeriod', 'SubscriptionPeriod', 'subscriptionPeriodUnit', 'SubscriptionPeriodUnit', 'products.0.subscriptionPeriod', 'products.0.SubscriptionPeriod', 'products.0.subscriptionPeriodUnit', 'products.0.SubscriptionPeriodUnit'],
      ),
      quantity: this.pickNumber(detail, ['quantity', 'products.0.quantity']),
      unitPrice: this.pickNumber(detail, ['unitPrice.amount', 'products.0.unitPrice.amount']),
      unitCost: this.pickNumber(detail, ['unitCost.amount', 'products.0.unitCost.amount']),
      totalPrice: this.pickNumber(detail, ['totalPrice.amount', 'products.0.extendedPrice.amount']),
      microsoftDomain:
        this.pickNamedParameterValue(detail, ['orderParameters', 'OrderParameters'], ['microsoft_domain']) ||
        this.pickString(detail, ['microsoft_domain', 'microsoftDomain', 'tenant.domain', 'fulfillment.microsoft_domain']),
      microsoftCustomerId:
        this.pickNamedParameterValue(detail, ['fulfillmentParameters', 'FulfillmentParameters'], ['ms_customer_id']) ||
        this.pickString(detail, ['ms_customer_id', 'microsoftCustomerId']),
      microsoftTenantId:
        this.pickNamedParameterValue(detail, ['orderParameters', 'OrderParameters'], ['microsoft_tenant_id']) ||
        this.pickString(detail, ['tenantId', 'microsoftTenantId']),
    };
  }

  private serializeDocument(item: any) {
    return {
      id: item.id,
      provider: item.provider || null,
      documentType: item.documentType,
      title: item.title,
      documentNumber: item.documentNumber || null,
      fileUrl: item.fileUrl || null,
      issuedAt: item.issuedAt || null,
      amount: item.amount != null ? Number(item.amount) : null,
      currency: item.currency || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeSource(item: any) {
    return {
      id: item.id,
      provider: item.provider,
      sourceType: item.sourceType,
      externalCustomerId: item.externalCustomerId || null,
      externalCustomerName: item.externalCustomerName || null,
      externalRecordId: item.externalRecordId || null,
      externalReference: item.externalReference || null,
      payloadSummary: item.payloadSummary || null,
      observedAt: item.observedAt,
      confidence: item.confidence ?? null,
      fieldCoverage: item.fieldCoverage || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeAgreement(item: any) {
    const billingCost =
      item.quantityPurchased != null && item.unitCost != null ? Number(item.quantityPurchased) * Number(item.unitCost) : item.totalCost != null ? Number(item.totalCost) : null;
    const billingPrice = item.totalPrice != null ? Number(item.totalPrice) : item.totalCost != null ? Number(item.totalCost) : null;
    const margin = billingPrice != null && billingCost != null ? billingPrice - billingCost : null;
    const marginPercent = billingPrice && margin != null ? (margin / billingPrice) * 100 : null;
    return {
      id: item.id,
      companyId: item.companyId || null,
      companyName: item.company?.name || null,
      siteId: item.siteId || null,
      siteName: item.site?.name || null,
      sourceProvider: item.sourceProvider || null,
      externalCustomerId: item.externalCustomerId || null,
      externalCustomerName: item.externalCustomerName || null,
      externalSubscriptionId: item.externalSubscriptionId || null,
      vendorSubscriptionId: item.vendorSubscriptionId || null,
      productId: item.productId || null,
      mpn: item.mpn || null,
      microsoftCustomerId: item.microsoftCustomerId || null,
      microsoftTenantId: item.microsoftTenantId || null,
      microsoftDomain: item.microsoftDomain || null,
      providerStatus: item.providerStatus || null,
      renewalStatus: item.renewalStatus ?? null,
      isRecurring: !!item.isRecurring,
      isReadOnly: !!item.isReadOnly,
      category: item.category,
      productName: item.productName,
      sku: item.sku || null,
      licenseType: item.licenseType || null,
      licenseChannel: item.licenseChannel || null,
      billingModel: item.billingModel || null,
      subscriptionPeriod: item.subscriptionPeriod || null,
      tenantName: item.tenantName || null,
      tenantDomain: item.tenantDomain || null,
      quantityPurchased: item.quantityPurchased ?? null,
      quantityActive: item.quantityActive ?? null,
      unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
      unitCost: item.unitCost != null ? Number(item.unitCost) : null,
      totalPrice: item.totalPrice != null ? Number(item.totalPrice) : null,
      totalCost: item.totalCost != null ? Number(item.totalCost) : null,
      billingCost,
      billingAmount: billingPrice,
      margin,
      marginPercent,
      currency: item.currency || null,
      purchaseDate: item.purchaseDate || null,
      startDate: item.startDate || null,
      renewalDate: item.renewalDate || null,
      expiresAt: item.expiresAt || null,
      autoRenew: !!item.autoRenew,
      alertLeadDays: item.alertLeadDays,
      status: item.status,
      notes: item.notes || null,
      lastSeenAt: item.lastSeenAt || null,
      sources: (item.sources || []).map((source: any) => this.serializeSource(source)),
      documents: (item.documents || []).map((doc: any) => this.serializeDocument(doc)),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeConnection(item: any) {
    const subscriptionKey = this.decrypt(item.subscriptionKeyEnc);
    const apiPass = this.decrypt(item.apiPassEnc);
    const clientSecret = this.decrypt(item.clientSecretEnc);
    const apiKey = this.decrypt(item.apiKeyEnc);
    return {
      id: item.id,
      provider: item.provider,
      environment: item.environment,
      apiBaseUrl: item.apiBaseUrl || null,
      hasSubscriptionKey: !!subscriptionKey,
      maskedSubscriptionKey: this.maskSecret(subscriptionKey),
      apiUser: item.apiUser || null,
      hasApiPass: !!apiPass,
      maskedApiPass: this.maskSecret(apiPass),
      marketplace: item.marketplace || null,
      clientId: item.clientId || null,
      hasClientSecret: !!clientSecret,
      maskedClientSecret: this.maskSecret(clientSecret),
      customerNumber: item.customerNumber || null,
      countryCode: item.countryCode || null,
      senderId: item.senderId || null,
      hasApiKey: !!apiKey,
      maskedApiKey: this.maskSecret(apiKey),
      status: item.status,
      lastTestAt: item.lastTestAt || null,
      lastSyncAt: item.lastSyncAt || null,
      lastError: item.lastError || null,
      autoSyncEnabled: !!item.autoSyncEnabled,
      autoSyncIntervalHours: item.autoSyncIntervalHours ?? null,
      nextSyncAt: item.nextSyncAt || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeCustomerMap(item: any) {
    return {
      id: item.id,
      provider: item.provider,
      externalCustomerId: item.externalCustomerId,
      externalCustomerName: item.externalCustomerName,
      externalStatus: item.externalStatus || null,
      externalTaxId: item.externalTaxId || null,
      externalTenantId: item.externalTenantId || null,
      externalTenantDomain: item.externalTenantDomain || null,
      companyId: item.companyId || null,
      companyName: item.company?.name || null,
      matchStatus: item.matchStatus,
      confidence: item.confidence ?? null,
      notes: item.notes || null,
      firstSeenAt: item.firstSeenAt || null,
      lastSeenAt: item.lastSeenAt || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeSyncRun(item: any) {
    return {
      id: item.id,
      provider: item.provider,
      connectionId: item.connectionId || null,
      status: item.status,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt || null,
      customersProcessed: item.customersProcessed ?? 0,
      subscriptionsFound: item.subscriptionsFound ?? 0,
      activeSubscriptions: item.activeSubscriptions ?? 0,
      recordsRead: item.recordsRead,
      recordsCreated: item.recordsCreated,
      recordsUpdated: item.recordsUpdated,
      recordsIgnored: item.recordsIgnored,
      markedNotFound: item.markedNotFound ?? 0,
      errorCount: item.errorCount ?? 0,
      durationMs: item.durationMs ?? null,
      errorSummary: item.errorSummary || null,
      createdAt: item.createdAt,
    };
  }

  private async upsertAgreementSource(agreementId: string, data: {
    provider: 'INGRAM' | 'SCANSOURCE' | 'MANUAL';
    sourceType: 'SUBSCRIPTION' | 'MANUAL';
    externalCustomerId?: string | null;
    externalCustomerName?: string | null;
    externalRecordId?: string | null;
    externalReference?: string | null;
    payloadSummary?: any;
    confidence?: number | null;
    fieldCoverage?: any;
  }) {
    const current = await this.prisma.microsoftAgreementSource.findFirst({
      where: {
        agreementId,
        provider: data.provider as any,
        externalRecordId: data.externalRecordId || undefined,
      },
    });
    if (current) {
      await this.prisma.microsoftAgreementSource.update({
        where: { id: current.id },
        data: {
          sourceType: data.sourceType as any,
          externalCustomerId: this.normalizeText(data.externalCustomerId),
          externalCustomerName: this.normalizeText(data.externalCustomerName),
          externalReference: this.normalizeText(data.externalReference),
          payloadSummary: data.payloadSummary || undefined,
          observedAt: new Date(),
          confidence: data.confidence ?? undefined,
          fieldCoverage: data.fieldCoverage || undefined,
        },
      });
      return;
    }
    await this.prisma.microsoftAgreementSource.create({
      data: {
        agreementId,
        provider: data.provider as any,
        sourceType: data.sourceType as any,
        externalCustomerId: this.normalizeText(data.externalCustomerId),
        externalCustomerName: this.normalizeText(data.externalCustomerName),
        externalRecordId: this.normalizeText(data.externalRecordId),
        externalReference: this.normalizeText(data.externalReference),
        payloadSummary: data.payloadSummary || undefined,
        observedAt: new Date(),
        confidence: data.confidence ?? undefined,
        fieldCoverage: data.fieldCoverage || undefined,
      },
    });
  }

  private getAgreementInclude() {
    return {
      company: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      sources: { orderBy: { observedAt: 'desc' as const } },
      documents: { orderBy: { issuedAt: 'desc' as const } },
    };
  }

  async listAgreements(filters: {
    companyId?: string;
    companyIds?: string[];
    siteId?: string;
    provider?: string;
    status?: string;
    tenant?: string;
    search?: string;
    onlyExpiringDays?: number | null;
    type?: string | null;
  }) {
    const where: any = {};
    const andFilters: any[] = [];
    if (filters.companyId) where.companyId = filters.companyId;
    else if (filters.companyIds) where.companyId = { in: filters.companyIds };
    if (filters.siteId) where.siteId = filters.siteId;
    if (filters.provider) where.sourceProvider = this.normalizeUpper(filters.provider);
    if (filters.status) {
      const providerStatus = this.normalizeProviderStatus(filters.status);
      const legacyStatus = this.normalizeUpper(filters.status);
      andFilters.push({
        OR: [{ providerStatus }, { status: legacyStatus }],
      });
    }
    if (filters.type) {
      const normalizedType = this.normalizeProviderStatus(filters.type);
      if (normalizedType === 'recorrente' || normalizedType === 'recurring') andFilters.push({ isRecurring: true });
      if (normalizedType === 'nao recorrente' || normalizedType === 'não recorrente' || normalizedType === 'non-recurring') andFilters.push({ isRecurring: false });
    }
    if (filters.tenant) {
      andFilters.push({
        OR: [
          { tenantName: { contains: filters.tenant, mode: 'insensitive' } },
          { tenantDomain: { contains: filters.tenant, mode: 'insensitive' } },
          { microsoftDomain: { contains: filters.tenant, mode: 'insensitive' } },
          { microsoftTenantId: { contains: filters.tenant, mode: 'insensitive' } },
          { microsoftCustomerId: { contains: filters.tenant, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.search) {
      andFilters.push({
        OR: [
          { productName: { contains: filters.search, mode: 'insensitive' } },
          { category: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
          { mpn: { contains: filters.search, mode: 'insensitive' } },
          { productId: { contains: filters.search, mode: 'insensitive' } },
          { externalSubscriptionId: { contains: filters.search, mode: 'insensitive' } },
          { vendorSubscriptionId: { contains: filters.search, mode: 'insensitive' } },
          { externalCustomerId: { contains: filters.search, mode: 'insensitive' } },
          { externalCustomerName: { contains: filters.search, mode: 'insensitive' } },
          { microsoftDomain: { contains: filters.search, mode: 'insensitive' } },
          { company: { name: { contains: filters.search, mode: 'insensitive' } } },
        ],
      });
    }
    if (filters.onlyExpiringDays != null) {
      const until = new Date(Date.now() + filters.onlyExpiringDays * 24 * 60 * 60 * 1000);
      andFilters.push({
        OR: [
          { isRecurring: true, providerStatus: 'active', renewalDate: { lte: until } },
          { isRecurring: false, status: { in: ['EXPIRING_30', 'EXPIRING_60', 'EXPIRING_90', 'EXPIRED'] } },
        ],
      });
    }
    if (andFilters.length) where.AND = andFilters;

    const items = await this.prisma.microsoftAgreement.findMany({
      where,
      include: this.getAgreementInclude(),
      orderBy: [{ renewalDate: 'asc' }, { productName: 'asc' }, { createdAt: 'desc' }],
    });
    return { ok: true, data: items.map((item) => this.serializeAgreement(item)) };
  }

  async getAgreement(id: string) {
    const item = await this.prisma.microsoftAgreement.findUnique({
      where: { id },
      include: this.getAgreementInclude(),
    });
    if (!item) return { ok: false, error: 'Registro não encontrado.' };
    return { ok: true, data: this.serializeAgreement(item) };
  }

  async createAgreement(input: SaveAgreementInput, userId?: string | null) {
    const companyId = this.normalizeText(input.companyId);
    const category = this.normalizeAgreementCategory(input.productName, input.sku, input.category);
    const productName = this.normalizeText(input.productName);
    if (!companyId || !category || !productName) return { ok: false, error: 'Empresa, categoria e produto são obrigatórios.' };

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };
    if (input.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: input.siteId }, select: { id: true, companyId: true } });
      if (!site || site.companyId !== companyId) return { ok: false, error: 'Site inválido para a empresa selecionada.' };
    }

    const renewalDate = this.toDateOrNull(input.renewalDate);
    const expiresAt = this.toDateOrNull(input.expiresAt);
    const status = this.computeAgreementStatus({
      renewalDate,
      expiresAt,
      autoRenew: input.autoRenew,
      requestedStatus: input.status,
    });

    const created = await this.prisma.microsoftAgreement.create({
      data: {
        sourceProvider: 'MANUAL',
        companyId,
        siteId: this.normalizeText(input.siteId),
        category,
        productName,
        sku: this.normalizeText(input.sku),
        licenseType: this.normalizeText(input.licenseType),
        licenseChannel: this.normalizeText(input.licenseChannel),
        billingModel: this.normalizeText(input.billingModel),
        tenantName: this.normalizeText(input.tenantName),
        tenantDomain: this.normalizeText(input.tenantDomain),
        quantityPurchased: this.toNumberOrNull(input.quantityPurchased),
        quantityActive: this.toNumberOrNull(input.quantityActive),
        unitCost: this.toNumberOrNull(input.unitCost),
        totalCost: this.toNumberOrNull(input.totalCost),
        currency: this.normalizeUpper(input.currency),
        purchaseDate: this.toDateOrNull(input.purchaseDate),
        startDate: this.toDateOrNull(input.startDate),
        renewalDate,
        expiresAt,
        autoRenew: !!input.autoRenew,
        alertLeadDays: this.toNumberOrNull(input.alertLeadDays) ?? 30,
        status: status as any,
        notes: this.normalizeText(input.notes),
        createdById: userId || null,
        updatedById: userId || null,
        isReadOnly: false,
      },
      include: this.getAgreementInclude(),
    });

    await this.upsertAgreementSource(created.id, {
      provider: 'MANUAL',
      sourceType: 'MANUAL',
      externalRecordId: randomUUID(),
      payloadSummary: {
        origin: 'tech-hub-manual',
        createdById: userId || null,
      },
      fieldCoverage: {
        category: !!category,
        productName: !!productName,
        sku: !!this.normalizeText(input.sku),
        financials: this.toNumberOrNull(input.totalCost) != null || this.toNumberOrNull(input.unitCost) != null,
        dates: !!renewalDate || !!expiresAt,
      },
      confidence: 1,
    });

    const reloaded = await this.prisma.microsoftAgreement.findUnique({
      where: { id: created.id },
      include: this.getAgreementInclude(),
    });
    return { ok: true, data: this.serializeAgreement(reloaded) };
  }

  async updateAgreement(id: string, input: Partial<SaveAgreementInput>, userId?: string | null) {
    const current = await this.prisma.microsoftAgreement.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'Registro não encontrado.' };
    if (current.isReadOnly) return { ok: false, error: 'Assinaturas importadas da integração são somente leitura.' };

    const companyId = this.normalizeText(input.companyId) || current.companyId;
    if (!companyId) return { ok: false, error: 'Empresa é obrigatória.' };
    if (input.companyId && companyId !== current.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) return { ok: false, error: 'Empresa não encontrada.' };
    }
    const targetSiteId = input.siteId !== undefined ? this.normalizeText(input.siteId) : current.siteId;
    if (targetSiteId) {
      const site = await this.prisma.site.findUnique({ where: { id: targetSiteId }, select: { id: true, companyId: true } });
      if (!site || site.companyId !== companyId) return { ok: false, error: 'Site inválido para a empresa selecionada.' };
    }

    const renewalDate = input.renewalDate !== undefined ? this.toDateOrNull(input.renewalDate) : current.renewalDate;
    const expiresAt = input.expiresAt !== undefined ? this.toDateOrNull(input.expiresAt) : current.expiresAt;
    const autoRenew = input.autoRenew !== undefined ? !!input.autoRenew : current.autoRenew;
    const status = this.computeAgreementStatus({
      renewalDate,
      expiresAt,
      autoRenew,
      requestedStatus: input.status !== undefined ? input.status : null,
    });

    const updated = await this.prisma.microsoftAgreement.update({
      where: { id },
      data: {
        companyId,
        siteId: targetSiteId,
        category: input.category !== undefined ? this.normalizeAgreementCategory(input.productName || current.productName, input.sku || current.mpn || current.sku, input.category) : undefined,
        productName: input.productName !== undefined ? this.normalizeText(input.productName) || current.productName : undefined,
        sku: input.sku !== undefined ? this.normalizeText(input.sku) : undefined,
        licenseType: input.licenseType !== undefined ? this.normalizeText(input.licenseType) : undefined,
        licenseChannel: input.licenseChannel !== undefined ? this.normalizeText(input.licenseChannel) : undefined,
        billingModel: input.billingModel !== undefined ? this.normalizeText(input.billingModel) : undefined,
        tenantName: input.tenantName !== undefined ? this.normalizeText(input.tenantName) : undefined,
        tenantDomain: input.tenantDomain !== undefined ? this.normalizeText(input.tenantDomain) : undefined,
        quantityPurchased: input.quantityPurchased !== undefined ? this.toNumberOrNull(input.quantityPurchased) : undefined,
        quantityActive: input.quantityActive !== undefined ? this.toNumberOrNull(input.quantityActive) : undefined,
        unitCost: input.unitCost !== undefined ? this.toNumberOrNull(input.unitCost) : undefined,
        totalCost: input.totalCost !== undefined ? this.toNumberOrNull(input.totalCost) : undefined,
        currency: input.currency !== undefined ? this.normalizeUpper(input.currency) : undefined,
        purchaseDate: input.purchaseDate !== undefined ? this.toDateOrNull(input.purchaseDate) : undefined,
        startDate: input.startDate !== undefined ? this.toDateOrNull(input.startDate) : undefined,
        renewalDate,
        expiresAt,
        autoRenew,
        alertLeadDays: input.alertLeadDays !== undefined ? this.toNumberOrNull(input.alertLeadDays) ?? 30 : undefined,
        status: status as any,
        notes: input.notes !== undefined ? this.normalizeText(input.notes) : undefined,
        updatedById: userId || null,
      },
      include: this.getAgreementInclude(),
    });

    return { ok: true, data: this.serializeAgreement(updated) };
  }

  async removeAgreement(id: string) {
    const current = await this.prisma.microsoftAgreement.findUnique({ where: { id }, select: { id: true, isReadOnly: true } });
    if (!current) return { ok: false, error: 'Registro não encontrado.' };
    if (current.isReadOnly) return { ok: false, error: 'Assinaturas importadas da integração não podem ser excluídas manualmente.' };
    await this.prisma.microsoftAgreement.delete({ where: { id } });
    return { ok: true };
  }

  async addAgreementDocument(agreementId: string, input: SaveDocumentInput) {
    const agreement = await this.prisma.microsoftAgreement.findUnique({ where: { id: agreementId }, select: { id: true, companyId: true } });
    if (!agreement) return { ok: false, error: 'Registro não encontrado.' };
    if (!agreement.companyId) return { ok: false, error: 'Associe a assinatura a uma empresa antes de anexar documentos.' };
    const title = this.normalizeText(input.title);
    if (!title) return { ok: false, error: 'Título do documento é obrigatório.' };

    const created = await this.prisma.microsoftAgreementDocument.create({
      data: {
        agreementId,
        companyId: agreement.companyId,
        provider: this.normalizeUpper(input.provider) as any,
        documentType: (this.normalizeUpper(input.documentType) || 'OTHER') as any,
        title,
        documentNumber: this.normalizeText(input.documentNumber),
        fileUrl: this.normalizeText(input.fileUrl),
        issuedAt: this.toDateOrNull(input.issuedAt),
        amount: this.toNumberOrNull(input.amount),
        currency: this.normalizeUpper(input.currency),
        notes: this.normalizeText(input.notes),
      },
    });

    return { ok: true, data: this.serializeDocument(created) };
  }

  async removeAgreementDocument(documentId: string) {
    const current = await this.prisma.microsoftAgreementDocument.findUnique({ where: { id: documentId }, select: { id: true } });
    if (!current) return { ok: false, error: 'Documento não encontrado.' };
    await this.prisma.microsoftAgreementDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  async listRenewals(filters: { companyId?: string; companyIds?: string[]; windowDays?: number | null }) {
    const windowDays = filters.windowDays != null ? filters.windowDays : 90;
    return this.listAgreements({
      companyId: filters.companyId,
      companyIds: filters.companyIds,
      onlyExpiringDays: windowDays,
      type: 'recorrente',
    });
  }

  /** Próximas licenças a vencer/renovar, para o card do dashboard — cobre qualquer fornecedor (Ingram hoje, ScanSource futuramente). */
  async listUpcoming(filters: { companyId?: string; companyIds?: string[]; limit?: number }) {
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 50) : 10;
    const where: any = {
      OR: [{ expiresAt: { not: null } }, { renewalDate: { not: null } }],
      // Ignora assinaturas que o fornecedor já marcou como removidas/encerradas/não encontradas —
      // essas têm datas antigas e não representam uma renovação real "a vencer".
      NOT: { providerStatus: { in: ['removed', 'terminated', 'not_found', 'cancelled'] } },
    };
    if (filters.companyId) where.companyId = filters.companyId;
    else if (filters.companyIds) where.companyId = { in: filters.companyIds };

    const items = await this.prisma.microsoftAgreement.findMany({
      where,
      include: this.getAgreementInclude(),
      take: 500,
    });
    const withDate = items
      .map((item) => ({ item, date: (item.renewalDate || item.expiresAt) as Date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, limit);
    return { ok: true, data: withDate.map((entry) => this.serializeAgreement(entry.item)) };
  }

  async listConnections() {
    const items = await this.prisma.microsoftDistributorConnection.findMany({
      orderBy: { provider: 'asc' },
    });
    const configured = new Map(items.map((item) => [item.provider, item] as const));
    const providers = ['INGRAM', 'SCANSOURCE'] as const;
    return {
      ok: true,
      data: providers.map((provider) => {
        const item = configured.get(provider);
        if (item) return this.serializeConnection(item);
        return {
          id: null,
          provider,
          environment: 'production',
          apiBaseUrl: provider === 'INGRAM' ? 'https://api.cloud.im/marketplace/na/' : null,
          hasSubscriptionKey: false,
          maskedSubscriptionKey: '',
          apiUser: null,
          hasApiPass: false,
          maskedApiPass: '',
          marketplace: provider === 'INGRAM' ? 'br' : null,
          clientId: null,
          hasClientSecret: false,
          maskedClientSecret: '',
          customerNumber: null,
          countryCode: null,
          senderId: null,
          hasApiKey: false,
          maskedApiKey: '',
          status: 'NOT_CONFIGURED',
          lastTestAt: null,
          lastSyncAt: null,
          lastError: null,
          autoSyncEnabled: false,
          autoSyncIntervalHours: null,
          nextSyncAt: null,
          createdAt: null,
          updatedAt: null,
        };
      }),
    };
  }

  async saveConnection(provider: string, input: SaveConnectionInput) {
    const normalizedProvider = this.normalizeUpper(provider);
    if (!normalizedProvider || !['INGRAM', 'SCANSOURCE'].includes(normalizedProvider)) return { ok: false, error: 'Fornecedor inválido.' };

    const current = await this.prisma.microsoftDistributorConnection.findUnique({
      where: { provider: normalizedProvider as any },
    });
    const nextSubscriptionKeyEnc = input.subscriptionKey !== undefined ? this.encrypt(input.subscriptionKey) : current?.subscriptionKeyEnc;
    const nextApiPassEnc = input.apiPass !== undefined ? this.encrypt(input.apiPass) : current?.apiPassEnc;
    const nextClientSecretEnc = input.clientSecret !== undefined ? this.encrypt(input.clientSecret) : current?.clientSecretEnc;
    const nextApiKeyEnc = input.apiKey !== undefined ? this.encrypt(input.apiKey) : current?.apiKeyEnc;
    const hasAnyConfig = [
      this.normalizeText(input.apiBaseUrl) ?? current?.apiBaseUrl ?? null,
      nextSubscriptionKeyEnc,
      this.normalizeText(input.apiUser) ?? current?.apiUser ?? null,
      nextApiPassEnc,
      this.normalizeText(input.marketplace) ?? current?.marketplace ?? null,
      this.normalizeText(input.clientId) ?? current?.clientId ?? null,
      nextClientSecretEnc,
      this.normalizeText(input.customerNumber) ?? current?.customerNumber ?? null,
      this.normalizeText(input.countryCode) ?? current?.countryCode ?? null,
      this.normalizeText(input.senderId) ?? current?.senderId ?? null,
      nextApiKeyEnc,
    ].some(Boolean);
    const updated = await this.prisma.microsoftDistributorConnection.upsert({
      where: { provider: normalizedProvider as any },
      create: {
        provider: normalizedProvider as any,
        environment: this.normalizeText(input.environment) || 'production',
        apiBaseUrl: this.normalizeText(input.apiBaseUrl),
        subscriptionKeyEnc: nextSubscriptionKeyEnc,
        apiUser: this.normalizeText(input.apiUser),
        apiPassEnc: nextApiPassEnc,
        marketplace: this.normalizeText(input.marketplace)?.toLowerCase() || null,
        clientId: this.normalizeText(input.clientId),
        clientSecretEnc: nextClientSecretEnc,
        customerNumber: this.normalizeText(input.customerNumber),
        countryCode: this.normalizeUpper(input.countryCode),
        senderId: this.normalizeText(input.senderId),
        apiKeyEnc: nextApiKeyEnc,
        status: hasAnyConfig ? 'CONFIGURED' : 'NOT_CONFIGURED',
      },
      update: {
        environment: input.environment !== undefined ? this.normalizeText(input.environment) || 'production' : undefined,
        apiBaseUrl: input.apiBaseUrl !== undefined ? this.normalizeText(input.apiBaseUrl) : undefined,
        subscriptionKeyEnc: nextSubscriptionKeyEnc,
        apiUser: input.apiUser !== undefined ? this.normalizeText(input.apiUser) : undefined,
        apiPassEnc: nextApiPassEnc,
        marketplace: input.marketplace !== undefined ? this.normalizeText(input.marketplace)?.toLowerCase() || null : undefined,
        clientId: input.clientId !== undefined ? this.normalizeText(input.clientId) : undefined,
        clientSecretEnc: nextClientSecretEnc,
        customerNumber: input.customerNumber !== undefined ? this.normalizeText(input.customerNumber) : undefined,
        countryCode: input.countryCode !== undefined ? this.normalizeUpper(input.countryCode) : undefined,
        senderId: input.senderId !== undefined ? this.normalizeText(input.senderId) : undefined,
        apiKeyEnc: nextApiKeyEnc,
        status: hasAnyConfig ? 'CONFIGURED' : 'NOT_CONFIGURED',
        lastError: null,
      },
    });
    return { ok: true, data: this.serializeConnection(updated) };
  }

  /** Frequência mínima e máxima aceitas para a sincronização automática (em horas). */
  private readonly minAutoSyncIntervalHours = 1;
  private readonly maxAutoSyncIntervalHours = 168; // 7 dias

  async setSyncSchedule(provider: string, input: { enabled: boolean; intervalHours?: number | null }) {
    const normalizedProvider = this.normalizeUpper(provider);
    if (!normalizedProvider || !['INGRAM', 'SCANSOURCE'].includes(normalizedProvider)) {
      return { ok: false, error: 'Fornecedor inválido.' };
    }

    const current = await this.prisma.microsoftDistributorConnection.findUnique({
      where: { provider: normalizedProvider as any },
    });

    if (input.enabled) {
      if (!current || current.status === 'NOT_CONFIGURED') {
        return { ok: false, error: 'Configure e salve a conexão antes de habilitar a sincronização automática.' };
      }
      const intervalHours = this.toNumberOrNull(input.intervalHours);
      if (!intervalHours || !Number.isInteger(intervalHours) || intervalHours < this.minAutoSyncIntervalHours || intervalHours > this.maxAutoSyncIntervalHours) {
        return { ok: false, error: `Escolha uma frequência entre ${this.minAutoSyncIntervalHours} e ${this.maxAutoSyncIntervalHours} horas.` };
      }
      const nextSyncAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
      const updated = await this.prisma.microsoftDistributorConnection.update({
        where: { provider: normalizedProvider as any },
        data: { autoSyncEnabled: true, autoSyncIntervalHours: intervalHours, nextSyncAt },
      });
      return { ok: true, data: this.serializeConnection(updated) };
    }

    if (!current) return { ok: false, error: 'Conexão não encontrada.' };
    const updated = await this.prisma.microsoftDistributorConnection.update({
      where: { provider: normalizedProvider as any },
      data: { autoSyncEnabled: false, nextSyncAt: null },
    });
    return { ok: true, data: this.serializeConnection(updated) };
  }

  /** Empurra o próximo horário agendado para depois de uma sincronização (manual ou automática), se o agendamento estiver ativo. */
  private async advanceScheduleIfEnabled(provider: string) {
    try {
      const connection = await this.prisma.microsoftDistributorConnection.findUnique({ where: { provider: provider as any } });
      if (connection?.autoSyncEnabled && connection.autoSyncIntervalHours) {
        await this.prisma.microsoftDistributorConnection.update({
          where: { provider: provider as any },
          data: { nextSyncAt: new Date(Date.now() + connection.autoSyncIntervalHours * 60 * 60 * 1000) },
        });
      }
    } catch {
      // não deve interromper o retorno da sincronização por falha ao agendar a próxima execução
    }
  }

  /** Lista as conexões com sincronização automática habilitada e cujo horário já chegou. */
  async listDueAutoSyncs() {
    return this.prisma.microsoftDistributorConnection.findMany({
      where: { autoSyncEnabled: true, nextSyncAt: { lte: new Date() } },
      select: { provider: true },
    });
  }

  private async getIngramConnection() {
    const connection = await this.prisma.microsoftDistributorConnection.findUnique({
      where: { provider: 'INGRAM' },
    });
    if (!connection) throw new Error('Conexão da Ingram não configurada.');
    const apiBaseUrl = this.normalizeText(connection.apiBaseUrl);
    const subscriptionKey = this.decrypt(connection.subscriptionKeyEnc);
    const apiUser = this.normalizeText(connection.apiUser);
    const apiPass = this.decrypt(connection.apiPassEnc);
    const marketplace = this.normalizeText(connection.marketplace)?.toLowerCase();
    if (!apiBaseUrl || !subscriptionKey || !apiUser || !apiPass || !marketplace) {
      throw new Error('Preencha API URL, Chave, Usuário, Senha e País para configurar a Ingram.');
    }
    return { connection, apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''), subscriptionKey, apiUser, apiPass, marketplace };
  }

  private async getIngramToken(config: Awaited<ReturnType<MicrosoftService['getIngramConnection']>>) {
    const tokenUrl = `${config.apiBaseUrl}/token`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.apiUser}:${config.apiPass}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Subscription-Key': config.subscriptionKey,
      },
      body: JSON.stringify({ marketplace: config.marketplace }),
    });
    const raw = await res.text();
    let data: IngramTokenResponse | Record<string, any> = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    if (!res.ok || !data?.token) {
      throw new Error('Falha ao autenticar na Ingram Micro.');
    }
    return data.token;
  }

  private async ingramRequest(config: Awaited<ReturnType<MicrosoftService['getIngramConnection']>>, token: string, path: string, query?: Record<string, string | number | null | undefined>) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value == null || value === '') continue;
      qs.set(key, String(value));
    }
    const url = `${config.apiBaseUrl}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Subscription-Key': config.subscriptionKey,
      },
    });
    const text = await res.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!res.ok) {
      throw new Error(`Ingram Micro retornou HTTP ${res.status}.`);
    }
    return payload;
  }

  private normalizeCustomerMapStatusSeen(current?: string | null, companyId?: string | null) {
    const normalized = this.normalizeUpper(current);
    if (normalized === 'REVIEW') return 'REVIEW';
    if (normalized === 'NOT_FOUND') return companyId ? 'MAPPED' : 'UNMAPPED';
    if (normalized === 'MAPPED' || normalized === 'CONFIRMED') return 'MAPPED';
    return companyId ? 'MAPPED' : 'UNMAPPED';
  }

  private async upsertCustomerMapFromSync(provider: 'INGRAM', customer: any, companyId?: string | null) {
    const externalCustomerId = this.pickString(customer, ['id', 'customerId']);
    const externalCustomerName = this.pickString(customer, ['name', 'companyName', 'displayName']);
    if (!externalCustomerId || !externalCustomerName) return null;
    const externalTaxId = this.onlyDigits(this.pickString(customer, ['taxRegId', 'taxRegistrationId', 'taxRegistrationID']));
    const current = await this.prisma.microsoftDistributorCustomerMap.findUnique({
      where: {
        provider_externalCustomerId: {
          provider: provider as any,
          externalCustomerId,
        },
      },
    });
    const matchedByCnpj = await this.findCompanyByCnpj(externalTaxId);

    let nextCompanyId = current?.companyId || companyId || null;
    let nextStatus = this.normalizeCustomerMapStatusSeen(current?.matchStatus, nextCompanyId);
    let nextConfidence = current?.confidence ?? null;

    if (current?.matchStatus !== 'REVIEW' && matchedByCnpj) {
      if (!current?.companyId || current.companyId === matchedByCnpj.id) {
        nextCompanyId = matchedByCnpj.id;
        nextStatus = 'MAPPED';
        nextConfidence = 1;
      } else {
        nextStatus = 'REVIEW';
      }
    }

    const item = await this.prisma.microsoftDistributorCustomerMap.upsert({
      where: {
        provider_externalCustomerId: {
          provider: provider as any,
          externalCustomerId,
        },
      },
      create: {
        provider: provider as any,
        externalCustomerId,
        externalCustomerName,
        externalStatus: this.pickString(customer, ['status']),
        externalTaxId,
        externalTenantId: this.pickString(customer, ['ms_customer_id', 'microsoftCustomerId']),
        externalTenantDomain: this.pickString(customer, ['microsoft_domain', 'microsoftDomain']),
        companyId: nextStatus === 'MAPPED' ? nextCompanyId : null,
        matchStatus: nextStatus as any,
        confidence: nextConfidence,
        notes: null,
        lastSeenAt: new Date(),
      },
      update: {
        externalCustomerName,
        externalStatus: this.pickString(customer, ['status']),
        externalTaxId,
        externalTenantId: this.pickString(customer, ['ms_customer_id', 'microsoftCustomerId']),
        externalTenantDomain: this.pickString(customer, ['microsoft_domain', 'microsoftDomain']),
        companyId: current?.matchStatus === 'REVIEW' ? current.companyId : nextStatus === 'MAPPED' ? nextCompanyId : current?.companyId || null,
        matchStatus: nextStatus as any,
        confidence: nextConfidence,
        lastSeenAt: new Date(),
      },
      include: { company: { select: { id: true, name: true } } },
    });
    return item;
  }

  private normalizeSubscriptionRecord(customer: any, detail: any, currentMap: any) {
    const productName = this.pickString(detail, ['name', 'productName', 'products.0.name', 'products.0.displayName']) || 'Subscription';
    const mpn = this.pickString(detail, ['products.0.mpn', 'mpn']);
    const renewalDate = this.pickDate(detail, ['renewalDate']);
    const expirationDate = this.pickDate(detail, ['expirationDate', 'expiryDate']);
    const providerStatus = this.normalizeProviderStatus(this.pickString(detail, ['status']));
    const renewalStatus = this.pickBoolean(detail, ['renewalStatus']);
    const quantity = this.pickNumber(detail, ['quantity', 'products.0.quantity']);
    const unitPrice = this.pickNumber(detail, ['unitPrice.amount', 'products.0.unitPrice.amount']);
    const unitCost = this.pickNumber(detail, ['unitCost.amount', 'products.0.unitCost.amount']);
    const totalPrice = this.pickNumber(detail, ['totalPrice.amount', 'products.0.extendedPrice.amount']) ?? (unitPrice != null && quantity != null ? unitPrice * quantity : null);
    const billingModel = this.resolvePeriodLabel(
      detail,
      ['billingPeriod', 'BillingPeriod', 'products.0.billingPeriod', 'products.0.BillingPeriod'],
      ['billingDuration', 'BillingDuration', 'products.0.billingDuration', 'products.0.BillingDuration'],
      ['billingPeriod', 'BillingPeriod', 'billingPeriodUnit', 'BillingPeriodUnit', 'products.0.billingPeriod', 'products.0.BillingPeriod', 'products.0.billingPeriodUnit', 'products.0.BillingPeriodUnit'],
    );
    const subscriptionPeriod = this.resolvePeriodLabel(
      detail,
      ['subscriptionPeriod', 'SubscriptionPeriod', 'products.0.subscriptionPeriod', 'products.0.SubscriptionPeriod'],
      ['subscriptionDuration', 'SubscriptionDuration', 'products.0.subscriptionDuration', 'products.0.SubscriptionDuration'],
      ['subscriptionPeriod', 'SubscriptionPeriod', 'subscriptionPeriodUnit', 'SubscriptionPeriodUnit', 'products.0.subscriptionPeriod', 'products.0.SubscriptionPeriod', 'products.0.subscriptionPeriodUnit', 'products.0.SubscriptionPeriodUnit'],
    );
    const recurring = this.computeRecurring({ providerStatus, renewalStatus, renewalDate });

    return {
      sourceProvider: 'INGRAM' as const,
      companyId: currentMap?.matchStatus === 'MAPPED' ? currentMap.companyId : null,
      externalCustomerId: this.pickString(customer, ['id', 'customerId']),
      externalCustomerName: this.pickString(customer, ['name', 'companyName', 'displayName']),
      externalSubscriptionId: this.pickString(detail, ['id']),
      vendorSubscriptionId: this.pickString(detail, ['vendorSubscriptionId', 'vendorSubscription.id', 'products.0.vendorSubscriptionId']),
      productId: this.pickString(detail, ['productId', 'products.0.productId', 'products.0.id']),
      mpn,
      microsoftCustomerId:
        this.pickNamedParameterValue(detail, ['fulfillmentParameters', 'FulfillmentParameters'], ['ms_customer_id']) ||
        this.pickString(detail, ['ms_customer_id', 'microsoftCustomerId']) ||
        currentMap?.externalTenantId ||
        null,
      microsoftTenantId:
        this.pickNamedParameterValue(detail, ['orderParameters', 'OrderParameters'], ['microsoft_tenant_id']) ||
        this.pickString(detail, ['tenantId', 'microsoftTenantId']),
      microsoftDomain:
        this.pickNamedParameterValue(detail, ['orderParameters', 'OrderParameters'], ['microsoft_domain']) ||
        this.pickString(detail, ['microsoft_domain', 'microsoftDomain', 'tenant.domain']) ||
        currentMap?.externalTenantDomain ||
        null,
      providerStatus,
      renewalStatus,
      isRecurring: recurring,
      isReadOnly: true,
      category: this.normalizeAgreementCategory(productName, mpn, null),
      productName,
      sku: this.pickString(detail, ['sku', 'products.0.sku']) || mpn,
      billingModel,
      subscriptionPeriod,
      quantityPurchased: quantity,
      quantityActive: quantity,
      unitPrice,
      unitCost,
      totalPrice,
      totalCost: unitCost != null && quantity != null ? unitCost * quantity : null,
      currency: this.pickString(detail, ['totalPrice.currency', 'products.0.unitPrice.currency', 'products.0.extendedPrice.currency', 'currency']),
      startDate: this.pickDate(detail, ['creationDate']),
      renewalDate,
      expiresAt: expirationDate,
      tenantDomain:
        this.pickNamedParameterValue(detail, ['orderParameters', 'OrderParameters'], ['microsoft_domain']) ||
        this.pickString(detail, ['microsoft_domain', 'microsoftDomain', 'tenant.domain']),
      notes: null,
      lastSeenAt: new Date(),
      status: providerStatus === 'pending' ? 'PENDING_REVIEW' : 'ACTIVE',
      safeSummary: this.buildSafePayloadSummary(detail),
    };
  }

  private async upsertIngramAgreement(customer: any, detail: any, map: any) {
    const normalized = this.normalizeSubscriptionRecord(customer, detail, map);
    if (!normalized.externalSubscriptionId) return { created: 0, updated: 0 };
    const existing = await this.prisma.microsoftAgreement.findUnique({
      where: {
        sourceProvider_externalSubscriptionId: {
          sourceProvider: 'INGRAM',
          externalSubscriptionId: normalized.externalSubscriptionId,
        },
      },
    });
    const payload = {
      sourceProvider: 'INGRAM' as any,
      companyId: normalized.companyId,
      externalCustomerId: normalized.externalCustomerId,
      externalCustomerName: normalized.externalCustomerName,
      externalSubscriptionId: normalized.externalSubscriptionId,
      vendorSubscriptionId: normalized.vendorSubscriptionId,
      productId: normalized.productId,
      mpn: normalized.mpn,
      microsoftCustomerId: normalized.microsoftCustomerId,
      microsoftTenantId: normalized.microsoftTenantId,
      microsoftDomain: normalized.microsoftDomain,
      providerStatus: normalized.providerStatus,
      renewalStatus: normalized.renewalStatus,
      isRecurring: normalized.isRecurring,
      isReadOnly: true,
      category: normalized.category,
      productName: normalized.productName,
      sku: normalized.sku,
      billingModel: normalized.billingModel,
      subscriptionPeriod: normalized.subscriptionPeriod,
      quantityPurchased: normalized.quantityPurchased,
      quantityActive: normalized.quantityActive,
      unitPrice: normalized.unitPrice,
      unitCost: normalized.unitCost,
      totalPrice: normalized.totalPrice,
      totalCost: normalized.totalCost,
      currency: normalized.currency,
      startDate: normalized.startDate,
      renewalDate: normalized.renewalDate,
      expiresAt: normalized.expiresAt,
      tenantDomain: normalized.tenantDomain,
      status: normalized.status as any,
      notes: normalized.notes,
      lastSeenAt: normalized.lastSeenAt,
    };
    const agreement = existing
      ? await this.prisma.microsoftAgreement.update({
          where: { id: existing.id },
          data: payload,
          include: this.getAgreementInclude(),
        })
      : await this.prisma.microsoftAgreement.create({
          data: payload,
          include: this.getAgreementInclude(),
        });

    await this.upsertAgreementSource(agreement.id, {
      provider: 'INGRAM',
      sourceType: 'SUBSCRIPTION',
      externalCustomerId: normalized.externalCustomerId,
      externalCustomerName: normalized.externalCustomerName,
      externalRecordId: normalized.externalSubscriptionId,
      externalReference: normalized.vendorSubscriptionId || normalized.productId,
      payloadSummary: normalized.safeSummary,
      confidence: 1,
      fieldCoverage: {
        renewalDate: !!normalized.renewalDate,
        microsoftDomain: !!normalized.microsoftDomain,
        quantity: normalized.quantityPurchased != null,
        pricing: normalized.totalPrice != null,
      },
    });
    return { created: existing ? 0 : 1, updated: existing ? 1 : 0 };
  }

  async testConnection(provider: string) {
    const normalizedProvider = this.normalizeUpper(provider);
    const current = await this.prisma.microsoftDistributorConnection.findUnique({
      where: { provider: normalizedProvider as any },
    });
    if (!current) return { ok: false, error: 'Conexão não configurada.' };

    const subscriptionKey = this.decrypt(current.subscriptionKeyEnc);
    const apiPass = this.decrypt(current.apiPassEnc);
    const clientSecret = this.decrypt(current.clientSecretEnc);
    const apiKey = this.decrypt(current.apiKeyEnc);

    let testResult: any = {
      provider: normalizedProvider,
      environment: current.environment,
      checkedAt: new Date().toISOString(),
      mode: 'CONFIG_ONLY',
    };

    try {
      if (normalizedProvider === 'INGRAM') {
        const config = await this.getIngramConnection();
        const token = await this.getIngramToken(config);
        const payload = await this.ingramRequest(config, token, '/customers', { offset: 0, limit: 1 });
        const customers = this.extractCollection(payload);
        testResult = {
          provider: normalizedProvider,
          environment: current.environment,
          checkedAt: new Date().toISOString(),
          mode: 'REMOTE_AUTH',
          apiBaseUrl: current.apiBaseUrl,
          apiUser: current.apiUser,
          marketplace: current.marketplace,
          customersPreview: customers.length,
          message: 'Conexão autenticada e leitura inicial de customers concluída.',
        };
      } else if (normalizedProvider === 'SCANSOURCE') {
        if (!current.clientId || !clientSecret || !current.customerNumber || !apiKey) {
          throw new Error('Preencha Customer Number, Client ID, Client Secret e API Key para configurar a ScanSource.');
        }
        testResult = {
          provider: normalizedProvider,
          environment: current.environment,
          checkedAt: new Date().toISOString(),
          mode: 'CONFIG_VALIDATED',
          message: 'Configuração pronta. O teste remoto completo da ScanSource depende do endpoint OAuth/documentação autenticada do portal parceiro.',
          customerNumber: current.customerNumber,
          hasApiKey: !!apiKey,
        };
      } else {
        throw new Error('Fornecedor inválido.');
      }

      const updated = await this.prisma.microsoftDistributorConnection.update({
        where: { id: current.id },
        data: {
          status: 'CONNECTED',
          lastTestAt: new Date(),
          lastError: null,
        },
      });
      return { ok: true, data: { connection: this.serializeConnection(updated), testResult } };
    } catch (error: any) {
      const message = error?.message || 'Falha ao testar conexão.';
      const updated = await this.prisma.microsoftDistributorConnection.update({
        where: { id: current.id },
        data: {
          status: 'ERROR',
          lastTestAt: new Date(),
          lastError: message,
        },
      });
      return { ok: false, error: message, data: { connection: this.serializeConnection(updated), testResult } };
    }
  }

  async listCustomerMaps(filters: { provider?: string; companyId?: string; matchStatus?: string }) {
    const where: any = {};
    if (filters.provider) where.provider = this.normalizeUpper(filters.provider);
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.matchStatus) where.matchStatus = this.normalizeUpper(filters.matchStatus);
    const items = await this.prisma.microsoftDistributorCustomerMap.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ provider: 'asc' }, { externalCustomerName: 'asc' }],
    });
    const companies = await this.prisma.company.findMany({ select: { id: true, name: true, fantasyName: true } });
    const data = items.map((item) => {
      const serialized = this.serializeCustomerMap(item);
      const suggestion = item.companyId
        ? null
        : companies
            .map((company) => {
              const confidence = Math.max(this.similarityScore(item.externalCustomerName, company.name), this.similarityScore(item.externalCustomerName, company.fantasyName));
              return { id: company.id, name: company.fantasyName || company.name, confidence };
            })
            .sort((a, b) => b.confidence - a.confidence)[0];
      return {
        ...serialized,
        suggestedCompanyId: suggestion && suggestion.confidence >= 0.45 ? suggestion.id : null,
        suggestedCompanyName: suggestion && suggestion.confidence >= 0.45 ? suggestion.name : null,
        suggestedConfidence: suggestion && suggestion.confidence >= 0.45 ? suggestion.confidence : null,
      };
    });
    return { ok: true, data };
  }

  async saveCustomerMap(input: SaveCustomerMapInput) {
    const provider = this.normalizeUpper(input.provider);
    const externalCustomerId = this.normalizeText(input.externalCustomerId);
    const externalCustomerName = this.normalizeText(input.externalCustomerName);
    if (!provider || !['INGRAM', 'SCANSOURCE'].includes(provider)) return { ok: false, error: 'Fornecedor inválido.' };
    if (!externalCustomerId || !externalCustomerName) return { ok: false, error: 'Cliente externo é obrigatório.' };
    if (input.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
      if (!company) return { ok: false, error: 'Empresa selecionada não encontrada.' };
    }
    const item = await this.prisma.microsoftDistributorCustomerMap.upsert({
      where: {
        provider_externalCustomerId: {
          provider: provider as any,
          externalCustomerId,
        },
      },
      create: {
        provider: provider as any,
        externalCustomerId,
        externalCustomerName,
        externalStatus: this.normalizeProviderStatus(input.externalStatus),
        externalTaxId: this.onlyDigits(input.externalTaxId),
        externalTenantId: this.normalizeText(input.externalTenantId),
        externalTenantDomain: this.normalizeText(input.externalTenantDomain),
        companyId: this.normalizeText(input.companyId),
        matchStatus: (this.normalizeUpper(input.matchStatus) || (input.companyId ? 'MAPPED' : 'UNMAPPED')) as any,
        confidence: this.toNumberOrNull(input.confidence),
        notes: this.normalizeText(input.notes),
        lastSeenAt: new Date(),
      },
      update: {
        externalCustomerName,
        externalStatus: input.externalStatus !== undefined ? this.normalizeProviderStatus(input.externalStatus) : undefined,
        externalTaxId: input.externalTaxId !== undefined ? this.onlyDigits(input.externalTaxId) : undefined,
        externalTenantId: input.externalTenantId !== undefined ? this.normalizeText(input.externalTenantId) : undefined,
        externalTenantDomain: input.externalTenantDomain !== undefined ? this.normalizeText(input.externalTenantDomain) : undefined,
        companyId: input.companyId !== undefined ? this.normalizeText(input.companyId) : undefined,
        matchStatus: input.matchStatus !== undefined ? (this.normalizeUpper(input.matchStatus) || 'UNMAPPED') as any : undefined,
        confidence: input.confidence !== undefined ? this.toNumberOrNull(input.confidence) : undefined,
        notes: input.notes !== undefined ? this.normalizeText(input.notes) : undefined,
        lastSeenAt: new Date(),
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    return { ok: true, data: this.serializeCustomerMap(item) };
  }

  async confirmCustomerMap(id: string, companyId: string, notes?: string | null) {
    const current = await this.prisma.microsoftDistributorCustomerMap.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'Mapeamento não encontrado.' };
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return { ok: false, error: 'Empresa selecionada não encontrada.' };
    const item = await this.prisma.microsoftDistributorCustomerMap.update({
      where: { id },
      data: {
        companyId,
        matchStatus: 'MAPPED',
        notes: notes !== undefined ? this.normalizeText(notes) : current.notes,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    return { ok: true, data: this.serializeCustomerMap(item) };
  }

  async ignoreCustomerMap(id: string) {
    const current = await this.prisma.microsoftDistributorCustomerMap.findUnique({ where: { id }, include: { company: { select: { id: true, name: true } } } });
    if (!current) return { ok: false, error: 'Mapeamento não encontrado.' };
    const item = await this.prisma.microsoftDistributorCustomerMap.update({
      where: { id },
      data: {
        companyId: null,
        matchStatus: 'UNMAPPED',
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    return { ok: true, data: this.serializeCustomerMap(item) };
  }

  async markCustomerMapForReview(id: string, notes?: string | null) {
    const current = await this.prisma.microsoftDistributorCustomerMap.findUnique({ where: { id }, include: { company: { select: { id: true, name: true } } } });
    if (!current) return { ok: false, error: 'Mapeamento não encontrado.' };
    const item = await this.prisma.microsoftDistributorCustomerMap.update({
      where: { id },
      data: {
        matchStatus: 'REVIEW',
        notes: notes !== undefined ? this.normalizeText(notes) : current.notes,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    return { ok: true, data: this.serializeCustomerMap(item) };
  }

  async getOverviewContext(filters: { provider?: string | null; companyId?: string | null; companyIds?: string[] | null }) {
    const provider = this.normalizeUpper(filters.provider || undefined);
    const agreementWhere: any = {};
    if (provider && provider !== 'TODOS') agreementWhere.sourceProvider = provider;
    if (filters.companyId) agreementWhere.companyId = filters.companyId;
    else if (filters.companyIds?.length) agreementWhere.companyId = { in: filters.companyIds };

    const customerWhere: any = {};
    if (provider && provider !== 'TODOS') customerWhere.provider = provider;
    if (filters.companyId) customerWhere.companyId = filters.companyId;
    else if (filters.companyIds?.length) customerWhere.companyId = { in: filters.companyIds };

    const [connections, customerCount, activeCount, latestRun] = await Promise.all([
      this.prisma.microsoftDistributorConnection.findMany({ orderBy: { provider: 'asc' } }),
      this.prisma.microsoftDistributorCustomerMap.count({ where: customerWhere }),
      this.prisma.microsoftAgreement.count({
        where: {
          ...agreementWhere,
          providerStatus: 'active',
        },
      }),
      this.prisma.microsoftSyncRun.findFirst({
        where: provider && provider !== 'TODOS' ? { provider: provider as any } : undefined,
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    return {
      ok: true,
      data: {
        selectedProvider: provider || 'TODOS',
        integrations: connections.map((item) => this.serializeConnection(item)),
        externalCustomers: customerCount,
        activeSubscriptions: activeCount,
        latestSyncRun: latestRun ? this.serializeSyncRun(latestRun) : null,
      },
    };
  }

  /** Tamanho de página e nº máximo de páginas do histórico de sincronização (mantém a lista limitada). */
  private readonly syncRunsPageSize = 10;
  private readonly syncRunsMaxPages = 10;
  private readonly syncRunsMaxKept = this.syncRunsPageSize * this.syncRunsMaxPages;

  async listSyncRuns(provider?: string, page = 1, pageSize = this.syncRunsPageSize) {
    const where: any = {};
    if (provider) where.provider = this.normalizeUpper(provider);
    const safePageSize = Math.min(Math.max(1, pageSize || this.syncRunsPageSize), this.syncRunsPageSize);
    const totalCount = await this.prisma.microsoftSyncRun.count({ where });
    const cappedTotal = Math.min(totalCount, this.syncRunsMaxKept);
    const totalPages = Math.max(1, Math.min(this.syncRunsMaxPages, Math.ceil(cappedTotal / safePageSize)));
    const safePage = Math.min(Math.max(1, page || 1), totalPages);
    const items = await this.prisma.microsoftSyncRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });
    return {
      ok: true,
      data: items.map((item) => this.serializeSyncRun(item)),
      page: safePage,
      pageSize: safePageSize,
      totalPages,
      total: cappedTotal,
    };
  }

  /** Remove execuções mais antigas além do limite mantido no histórico (evita crescimento sem fim). */
  private async pruneSyncRuns() {
    const total = await this.prisma.microsoftSyncRun.count();
    if (total <= this.syncRunsMaxKept) return;
    const excess = await this.prisma.microsoftSyncRun.findMany({
      orderBy: { startedAt: 'asc' },
      take: total - this.syncRunsMaxKept,
      select: { id: true },
    });
    if (excess.length) {
      await this.prisma.microsoftSyncRun.deleteMany({ where: { id: { in: excess.map((item) => item.id) } } });
    }
  }

  async createSyncRun(
    provider: string,
    status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'ERROR',
    summary?: Partial<{
      finishedAt: Date | null;
      customersProcessed: number;
      subscriptionsFound: number;
      activeSubscriptions: number;
      recordsRead: number;
      recordsCreated: number;
      recordsUpdated: number;
      recordsIgnored: number;
      markedNotFound: number;
      errorCount: number;
      durationMs: number | null;
      errorSummary: string | null;
    }>,
  ) {
    const normalizedProvider = this.normalizeUpper(provider);
    const connection = await this.prisma.microsoftDistributorConnection.findUnique({
      where: { provider: normalizedProvider as any },
      select: { id: true },
    });
    const created = await this.prisma.microsoftSyncRun.create({
      data: {
        provider: normalizedProvider as any,
        connectionId: connection?.id || null,
        status: status as any,
        finishedAt: summary?.finishedAt || null,
        customersProcessed: summary?.customersProcessed || 0,
        subscriptionsFound: summary?.subscriptionsFound || 0,
        activeSubscriptions: summary?.activeSubscriptions || 0,
        recordsRead: summary?.recordsRead || 0,
        recordsCreated: summary?.recordsCreated || 0,
        recordsUpdated: summary?.recordsUpdated || 0,
        recordsIgnored: summary?.recordsIgnored || 0,
        markedNotFound: summary?.markedNotFound || 0,
        errorCount: summary?.errorCount || 0,
        durationMs: summary?.durationMs ?? null,
        errorSummary: summary?.errorSummary || null,
      },
    });
    if (connection?.id && status !== 'RUNNING') {
      await this.prisma.microsoftDistributorConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: summary?.finishedAt || new Date(),
          lastError: summary?.errorSummary || null,
        },
      });
    }
    await this.pruneSyncRuns();
    return { ok: true, data: this.serializeSyncRun(created) };
  }

  async updateSyncRun(
    id: string,
    status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'ERROR',
    summary?: Partial<{
      finishedAt: Date | null;
      customersProcessed: number;
      subscriptionsFound: number;
      activeSubscriptions: number;
      recordsRead: number;
      recordsCreated: number;
      recordsUpdated: number;
      recordsIgnored: number;
      markedNotFound: number;
      errorCount: number;
      durationMs: number | null;
      errorSummary: string | null;
    }>,
  ) {
    const current = await this.prisma.microsoftSyncRun.findUnique({
      where: { id },
      select: { id: true, connectionId: true },
    });
    if (!current) return { ok: false, error: 'Execução de sincronização não encontrada.' };

    const updated = await this.prisma.microsoftSyncRun.update({
      where: { id },
      data: {
        status: status as any,
        finishedAt: summary?.finishedAt !== undefined ? summary.finishedAt : undefined,
        customersProcessed: summary?.customersProcessed !== undefined ? summary.customersProcessed : undefined,
        subscriptionsFound: summary?.subscriptionsFound !== undefined ? summary.subscriptionsFound : undefined,
        activeSubscriptions: summary?.activeSubscriptions !== undefined ? summary.activeSubscriptions : undefined,
        recordsRead: summary?.recordsRead !== undefined ? summary.recordsRead : undefined,
        recordsCreated: summary?.recordsCreated !== undefined ? summary.recordsCreated : undefined,
        recordsUpdated: summary?.recordsUpdated !== undefined ? summary.recordsUpdated : undefined,
        recordsIgnored: summary?.recordsIgnored !== undefined ? summary.recordsIgnored : undefined,
        markedNotFound: summary?.markedNotFound !== undefined ? summary.markedNotFound : undefined,
        errorCount: summary?.errorCount !== undefined ? summary.errorCount : undefined,
        durationMs: summary?.durationMs !== undefined ? summary.durationMs : undefined,
        errorSummary: summary?.errorSummary !== undefined ? summary.errorSummary : undefined,
      },
    });

    if (current.connectionId && status !== 'RUNNING') {
      await this.prisma.microsoftDistributorConnection.update({
        where: { id: current.connectionId },
        data: {
          lastSyncAt: summary?.finishedAt || new Date(),
          lastError: summary?.errorSummary || null,
        },
      });
    }

    return { ok: true, data: this.serializeSyncRun(updated) };
  }

  async syncProvider(provider: string) {
    const normalizedProvider = this.normalizeUpper(provider) || provider;
    try {
      return await this.syncProviderInternal(provider);
    } finally {
      // Roda tanto após sync manual quanto agendado: se o agendamento estiver ativo, empurra a próxima execução.
      await this.advanceScheduleIfEnabled(normalizedProvider);
    }
  }

  private async syncProviderInternal(provider: string) {
    const normalizedProvider = this.normalizeUpper(provider);
    if (normalizedProvider !== 'INGRAM') {
      return this.createSyncRun(provider, 'PARTIAL', {
        finishedAt: new Date(),
        errorSummary: 'Sincronização real ainda não habilitada para este fornecedor.',
      });
    }

    const startedAt = Date.now();
    const runningRun = await this.createSyncRun('INGRAM', 'RUNNING');
    const runningRunId = runningRun?.data?.id || null;
    try {
      const config = await this.getIngramConnection();
      const token = await this.getIngramToken(config);
      const seenCustomerIds = new Set<string>();
      const seenSubscriptionIds = new Set<string>();
      let customersProcessed = 0;
      let subscriptionsFound = 0;
      let activeSubscriptions = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;
      let errorCount = 0;

      let offset = 0;
      const limit = 100;
      let total = 0;
      do {
        const customerPayload = await this.ingramRequest(config, token, '/customers', { offset, limit });
        const customers = this.extractCollection(customerPayload);
        const pagination = this.parsePagination(customerPayload);
        total = pagination.total || customers.length;
        for (const customer of customers) {
          customersProcessed += 1;
          const customerId = this.pickString(customer, ['id', 'customerId']);
          if (!customerId) continue;
          seenCustomerIds.add(customerId);
          let customerDetail = customer;
          try {
            const detailedCustomer = await this.ingramRequest(config, token, `/customers/${encodeURIComponent(customerId)}`);
            customerDetail = { ...customer, ...(detailedCustomer || {}) };
          } catch {
            errorCount += 1;
          }
          const map = await this.upsertCustomerMapFromSync('INGRAM', customerDetail);

          let subOffset = 0;
          let subTotal = 0;
          do {
            const subscriptionsPayload = await this.ingramRequest(config, token, '/subscriptions', {
              customerId,
              offset: subOffset,
              limit,
            });
            const subscriptions = this.extractCollection(subscriptionsPayload);
            const subPagination = this.parsePagination(subscriptionsPayload);
            subTotal = subPagination.total || subscriptions.length;
            for (const subscription of subscriptions) {
              subscriptionsFound += 1;
              const providerStatus = this.normalizeProviderStatus(this.pickString(subscription, ['status']));
              const subscriptionId = this.pickString(subscription, ['id']);
              if (!subscriptionId) continue;
              seenSubscriptionIds.add(subscriptionId);

              let detail = subscription;
              if (providerStatus === 'active') {
                activeSubscriptions += 1;
                try {
                  detail = await this.ingramRequest(config, token, `/subscriptions/${subscriptionId}`);
                } catch {
                  errorCount += 1;
                }
              }

              const result = await this.upsertIngramAgreement(customerDetail, detail, map);
              recordsCreated += result.created;
              recordsUpdated += result.updated;
            }
            subOffset += subPagination.limit || subscriptions.length || limit;
          } while (subOffset < subTotal);
        }
        offset += pagination.limit || customers.length || limit;
      } while (offset < total);

      const staleMaps = await this.prisma.microsoftDistributorCustomerMap.findMany({
        where: { provider: 'INGRAM' },
        select: { id: true, externalCustomerId: true },
      });
      const staleMapIds = staleMaps.filter((item) => !seenCustomerIds.has(item.externalCustomerId)).map((item) => item.id);
      if (staleMapIds.length) {
        await this.prisma.microsoftDistributorCustomerMap.updateMany({
          where: { id: { in: staleMapIds } },
          data: { matchStatus: 'NOT_FOUND' as any },
        });
      }

      const staleSubscriptions = await this.prisma.microsoftAgreement.findMany({
        where: { sourceProvider: 'INGRAM', externalSubscriptionId: { not: null } },
        select: { id: true, externalSubscriptionId: true },
      });
      const staleAgreementIds = staleSubscriptions.filter((item) => item.externalSubscriptionId && !seenSubscriptionIds.has(item.externalSubscriptionId)).map((item) => item.id);
      if (staleAgreementIds.length) {
        await this.prisma.microsoftAgreement.updateMany({
          where: { id: { in: staleAgreementIds } },
          data: { providerStatus: 'not_found' },
        });
      }

      if (!runningRunId) {
        return this.createSyncRun('INGRAM', errorCount > 0 ? 'PARTIAL' : 'SUCCESS', {
          finishedAt: new Date(),
          customersProcessed,
          subscriptionsFound,
          activeSubscriptions,
          recordsRead: subscriptionsFound,
          recordsCreated,
          recordsUpdated,
          recordsIgnored: 0,
          markedNotFound: staleAgreementIds.length,
          errorCount,
          durationMs: Date.now() - startedAt,
          errorSummary: errorCount > 0 ? `${errorCount} assinatura(s) tiveram falha parcial na leitura de detalhes.` : null,
        });
      }

      return this.updateSyncRun(runningRunId, errorCount > 0 ? 'PARTIAL' : 'SUCCESS', {
        finishedAt: new Date(),
        customersProcessed,
        subscriptionsFound,
        activeSubscriptions,
        recordsRead: subscriptionsFound,
        recordsCreated,
        recordsUpdated,
        recordsIgnored: 0,
        markedNotFound: staleAgreementIds.length,
        errorCount,
        durationMs: Date.now() - startedAt,
        errorSummary: errorCount > 0 ? `${errorCount} assinatura(s) tiveram falha parcial na leitura de detalhes.` : null,
      });
    } catch (error: any) {
      if (!runningRunId) {
        return this.createSyncRun('INGRAM', 'ERROR', {
          finishedAt: new Date(),
          errorCount: 1,
          durationMs: Date.now() - startedAt,
          errorSummary: error?.message || 'Falha ao sincronizar Ingram Micro.',
        });
      }

      return this.updateSyncRun(runningRunId, 'ERROR', {
        finishedAt: new Date(),
        errorCount: 1,
        durationMs: Date.now() - startedAt,
        errorSummary: error?.message || 'Falha ao sincronizar Ingram Micro.',
      });
    }
  }
}
