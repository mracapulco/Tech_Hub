import { Injectable } from '@nestjs/common';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { SettingsService } from '../../settings/settings.service';
import { getJwtSecret } from '../../common/auth-context';

type GlpiConnectionStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'AUTHORIZED' | 'ERROR' | 'REVOKED';

type GlpiConfig = {
  baseUrl: string;
  clientId: string;
  callbackUrl?: string | null;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string | null;
  selectedEntityId?: string | null;
  selectedEntityName?: string | null;
  selectedEntityFullPath?: string | null;
  includeSubentities?: boolean;
  connectionStatus?: GlpiConnectionStatus;
  authorizedAt?: string | null;
  lastTestAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  oauthStateHash?: string | null;
  oauthStateExpiresAt?: string | null;
  oauthStateUserId?: string | null;
  oauthStateCompanyId?: string | null;
  oauthStateConfigKey?: string | null;
  oauthStateReturnUrl?: string | null;
};

type GlpiEntity = {
  id: string;
  name: string;
  fullPath: string | null;
  parentId: string | null;
};

type GlpiComputer = {
  externalId: string;
  displayName: string;
  hostname: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  manufacturer: string | null;
  model: string | null;
  operatingSystem: string | null;
  operatingSystemVersion: string | null;
  cpu: string | null;
  memoryGB: number | null;
  storageSummary: string | null;
};

@Injectable()
export class GlpiService {
  constructor(private readonly settings: SettingsService) {}

  private readonly defaultUrl = 'https://helpdesk.techmaster.inf.br';
  private readonly defaultApiVersion = 'v2.2';
  private readonly oauthScope = 'api user email status';
  private readonly oauthCallbackPath = '/integrations/glpi/oauth/callback';

  private normalizeBaseUrl(url?: string | null) {
    const raw = String(url || '').trim() || this.defaultUrl;
    return raw.replace(/\/+$/, '').replace(/\/api\.php\/?$/i, '').replace(/\/apirest\.php\/?$/i, '');
  }

  private normalizePlainText(value: any) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private pickObjectName(...values: any[]) {
    for (const value of values) {
      if (value == null) continue;
      if (typeof value === 'string') {
        const normalized = this.normalizePlainText(value);
        if (normalized) return normalized;
        continue;
      }
      if (typeof value === 'object') {
        const candidate = this.normalizePlainText(value?.name || value?.label || value?.completename || value?.title);
        if (candidate) return candidate;
      }
    }
    return null;
  }

  private normalizeCallbackUrl(url?: string | null) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  private buildApiRoot(url?: string | null) {
    return `${this.normalizeBaseUrl(url)}/api.php`;
  }

  private buildVersionedApiRoot(url?: string | null, version = this.defaultApiVersion) {
    return `${this.buildApiRoot(url)}/${version}`;
  }

  private maskSecret(value?: string | null) {
    if (!value) return '';
    if (value.length <= 6) return '******';
    return `${value.slice(0, 3)}****${value.slice(-3)}`;
  }

  private async requestText(url: string, init?: RequestInit, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text?.trim() || `Falha HTTP ${response.status} ao consultar o GLPI.`);
      }
      return { response, text };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestJson(url: string, init?: RequestInit, timeoutMs = 20000) {
    const { response, text } = await this.requestText(url, init, timeoutMs);
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(text?.trim() || `Resposta inválida ao consultar ${url}.`);
    }
    return { response, json };
  }

  private async postForm(url: string, data: Record<string, string>, timeoutMs = 20000) {
    const body = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value != null) body.set(key, value);
    });
    return this.requestJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      timeoutMs,
    );
  }

  private bearerHeaders(accessToken: string) {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    } as Record<string, string>;
  }

  private toDateIso(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isExpired(expiresAt?: string | null) {
    const iso = this.toDateIso(expiresAt);
    if (!iso) return true;
    return new Date(iso).getTime() <= Date.now() + 30_000;
  }

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private getStateSigningSecret() {
    const secret = process.env.CONFIG_MASTER_KEY || getJwtSecret();
    return secret;
  }

  private signStatePayload(payload: string) {
    return createHmac('sha256', this.getStateSigningSecret()).update(payload).digest('base64url');
  }

  private encodeOAuthState(input: {
    companyId: string;
    userId: string;
    configKey: string;
    returnUrl: string | null;
  }) {
    const payload = {
      companyId: input.companyId,
      userId: input.userId,
      configKey: input.configKey,
      returnUrl: input.returnUrl,
      nonce: randomBytes(24).toString('base64url'),
      exp: Date.now() + 15 * 60_000,
    };
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.signStatePayload(payloadEncoded);
    return {
      rawState: Buffer.from(JSON.stringify({ payload: payloadEncoded, sig: signature })).toString('base64url'),
      payload,
    };
  }

  private decodeAndValidateState(state: string) {
    let wrapper: any = null;
    try {
      wrapper = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, error: 'State OAuth2 inválido.' } as const;
    }
    const payloadEncoded = String(wrapper?.payload || '');
    const signature = String(wrapper?.sig || '');
    if (!payloadEncoded || !signature) return { ok: false, error: 'State OAuth2 inválido.' } as const;
    const expectedSignature = this.signStatePayload(payloadEncoded);
    const validSignature =
      Buffer.byteLength(signature) === Buffer.byteLength(expectedSignature) &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    if (!validSignature) return { ok: false, error: 'Assinatura do state OAuth2 inválida.' } as const;
    try {
      const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
      if (!payload?.companyId || !payload?.userId || !payload?.configKey) {
        return { ok: false, error: 'State OAuth2 incompleto.' } as const;
      }
      if (Number(payload?.exp || 0) < Date.now()) {
        return { ok: false, error: 'A autorização expirou. Tente novamente.' } as const;
      }
      return { ok: true, data: payload } as const;
    } catch {
      return { ok: false, error: 'State OAuth2 inválido.' } as const;
    }
  }

  private getGlpiConfigKey(companyId: string) {
    return `GLPI_CFG_${String(companyId)}`;
  }

  getCallbackUrl() {
    const raw = String(process.env.GLPI_OAUTH_CALLBACK_URL || '').trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  buildCallbackUrlFromBase(baseUrl?: string | null) {
    const normalizedBase = this.normalizeCallbackUrl(baseUrl);
    if (!normalizedBase) return null;
    return `${normalizedBase}${this.oauthCallbackPath}`;
  }

  resolveCallbackUrl(input?: {
    requestedBaseUrl?: string | null;
    storedCallbackUrl?: string | null;
    explicitCallbackUrl?: string | null;
  }) {
    const explicitCallbackUrl = this.normalizeCallbackUrl(input?.explicitCallbackUrl);
    if (explicitCallbackUrl) return explicitCallbackUrl;
    const storedCallbackUrl = this.normalizeCallbackUrl(input?.storedCallbackUrl);
    if (storedCallbackUrl) return storedCallbackUrl;
    const requestedCallbackUrl = this.buildCallbackUrlFromBase(input?.requestedBaseUrl);
    if (requestedCallbackUrl) return requestedCallbackUrl;
    return this.getCallbackUrl();
  }

  getFrontendBaseUrl() {
    const raw = String(process.env.TECH_HUB_FRONTEND_URL || '').trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  getPendingOauthCookieName() {
    return 'glpi_oauth_pending';
  }

  getPendingOauthCookiePath() {
    return '/';
  }

  private buildDefaultFrontendReturnUrl(companyId: string) {
    const base = this.getFrontendBaseUrl();
    if (!base) return `/configuracoes/empresas/${companyId}/glpi`;
    return `${base}/configuracoes/empresas/${companyId}/glpi`;
  }

  private parseArrayPayload(json: any) {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.items)) return json.items;
    return [];
  }

  private parseCount(json: any, responseHeaders?: Headers, currentPageLength = 0) {
    const contentRange = responseHeaders?.get('content-range') || responseHeaders?.get('Content-Range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) return Number(match[1]);
    }
    const candidates = [
      json?.total_count,
      json?.totalCount,
      json?.total,
      json?.meta?.total,
      json?.meta?.pagination?.total,
      json?.pagination?.total,
    ];
    for (const candidate of candidates) {
      const num = Number(candidate);
      if (Number.isFinite(num)) return num;
    }
    return currentPageLength;
  }

  private parseEntity(item: any): GlpiEntity {
    const path =
      String(item?.completename || item?.full_path || item?.fullPath || item?.path || item?.name || '').trim() || null;
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name || '').trim(),
      fullPath: path,
      parentId:
        item?.parent?.id != null
          ? String(item.parent.id)
          : item?.parent_id != null
          ? String(item.parent_id)
          : item?.entities_id != null && String(item.entities_id) !== String(item.id)
          ? String(item.entities_id)
          : null,
    };
  }

  private parseComputer(item: any): GlpiComputer {
    const rawMemory =
      item?.memory ??
      item?.memory_size ??
      item?.ram ??
      item?.ram_size ??
      item?.memory_mb ??
      item?.memoryMB ??
      item?.memory_gb ??
      item?.memoryGB;
    const memoryNumber = Number(rawMemory);
    const memoryGB =
      Number.isFinite(memoryNumber) && memoryNumber > 0
        ? memoryNumber > 512
          ? Math.round((memoryNumber / 1024) * 100) / 100
          : Math.round(memoryNumber * 100) / 100
        : null;

    return {
      externalId: String(item?.id ?? ''),
      displayName:
        this.normalizePlainText(item?.name) ||
        this.normalizePlainText(item?.hostname) ||
        this.normalizePlainText(item?.fqdn) ||
        `Computer ${String(item?.id ?? '').trim() || 'sem-id'}`,
      hostname:
        this.normalizePlainText(item?.hostname) ||
        this.normalizePlainText(item?.fqdn) ||
        this.normalizePlainText(item?.name),
      serialNumber: this.normalizePlainText(item?.serial || item?.serial_number),
      assetTag: this.normalizePlainText(item?.otherserial || item?.asset_tag || item?.tag),
      manufacturer: this.pickObjectName(item?.manufacturer, item?.brand, item?.manufacturers, item?.manufacturer_name),
      model: this.pickObjectName(item?.model, item?.computermodel, item?.computer_model, item?.model_name),
      operatingSystem: this.pickObjectName(
        item?.operatingsystem,
        item?.operating_system,
        item?.os,
        item?.operatingSystem,
        item?.operating_system_name,
      ),
      operatingSystemVersion: this.pickObjectName(
        item?.operatingsystemversion,
        item?.operating_system_version,
        item?.os_version,
        item?.operatingSystemVersion,
      ),
      cpu: this.normalizePlainText(item?.cpu || item?.processor || item?.cpu_name),
      memoryGB,
      storageSummary: this.normalizePlainText(item?.storage || item?.storage_summary || item?.disk || item?.disk_size),
    };
  }

  private buildEntityScopedHeaders(accessToken: string, entityId: string, recursive: boolean) {
    return {
      ...this.bearerHeaders(accessToken),
      'GLPI-Entity': entityId,
      'GLPI-Entity-Recursive': recursive ? 'true' : 'false',
    };
  }

  private normalizeEntities(items: any[]) {
    return items
      .map((item) => this.parseEntity(item))
      .filter((item) => item.id && item.name)
      .sort((a, b) => (a.fullPath || a.name).localeCompare(b.fullPath || b.name));
  }

  private getDescendantEntities(entities: GlpiEntity[], selectedEntityId: string) {
    const selected = entities.find((item) => item.id === selectedEntityId);
    if (!selected) return [];
    const fullPath = selected.fullPath || selected.name;
    return entities.filter((item) => {
      if (item.id === selected.id) return false;
      const candidate = item.fullPath || item.name;
      return candidate.startsWith(`${fullPath} >`) || candidate.startsWith(`${fullPath} /`) || item.parentId === selected.id;
    });
  }

  async getStoredConfig(companyId: string): Promise<GlpiConfig | null> {
    const cfg = (await this.settings.getGlpiConfig(companyId)) as GlpiConfig | null;
    if (!cfg) return null;
    return {
      baseUrl: this.normalizeBaseUrl(cfg.baseUrl || (cfg as any).url),
      clientId: String(cfg.clientId || '').trim(),
      callbackUrl: this.normalizeCallbackUrl(cfg.callbackUrl || null),
      clientSecret: cfg.clientSecret || undefined,
      accessToken: cfg.accessToken || undefined,
      refreshToken: cfg.refreshToken || undefined,
      accessTokenExpiresAt: cfg.accessTokenExpiresAt || null,
      selectedEntityId: cfg.selectedEntityId || (cfg as any).entityId || null,
      selectedEntityName: cfg.selectedEntityName || (cfg as any).entityName || null,
      selectedEntityFullPath: cfg.selectedEntityFullPath || null,
      includeSubentities: cfg.includeSubentities === true || (cfg as any).isRecursive === true,
      connectionStatus: (cfg.connectionStatus as GlpiConnectionStatus) || 'NOT_CONFIGURED',
      authorizedAt: cfg.authorizedAt || null,
      lastTestAt: cfg.lastTestAt || null,
      lastSyncAt: cfg.lastSyncAt || null,
      lastError: cfg.lastError || null,
      oauthStateHash: cfg.oauthStateHash || null,
      oauthStateExpiresAt: cfg.oauthStateExpiresAt || null,
      oauthStateUserId: cfg.oauthStateUserId || null,
      oauthStateCompanyId: cfg.oauthStateCompanyId || null,
      oauthStateConfigKey: cfg.oauthStateConfigKey || null,
      oauthStateReturnUrl: cfg.oauthStateReturnUrl || null,
    };
  }

  private async saveStoredConfig(companyId: string, cfg: GlpiConfig, updatedBy?: string) {
    await this.settings.setGlpiConfig(companyId, cfg, updatedBy);
  }

  async getConfigSummary(companyId: string, requestedBaseUrl?: string | null) {
    const cfg = await this.getStoredConfig(companyId);
    const callbackUrl = this.resolveCallbackUrl({
      requestedBaseUrl,
      storedCallbackUrl: cfg?.callbackUrl || null,
    });
    if (!cfg) {
      return {
        baseUrl: this.defaultUrl,
        clientId: '',
        callbackUrl,
        hasClientSecret: false,
        maskedClientSecret: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityFullPath: null,
        includeSubentities: false,
        connectionStatus: 'NOT_CONFIGURED' as GlpiConnectionStatus,
        authorized: false,
        authorizedAt: null,
        lastTestAt: null,
        lastSyncAt: null,
        lastError: null,
      };
    }
    return {
      baseUrl: cfg.baseUrl,
      clientId: cfg.clientId,
      callbackUrl,
      hasClientSecret: Boolean(cfg.clientSecret),
      maskedClientSecret: this.maskSecret(cfg.clientSecret),
      selectedEntityId: cfg.selectedEntityId || null,
      selectedEntityName: cfg.selectedEntityName || null,
      selectedEntityFullPath: cfg.selectedEntityFullPath || null,
      includeSubentities: cfg.includeSubentities === true,
      connectionStatus: cfg.connectionStatus || 'NOT_CONFIGURED',
      authorized: cfg.connectionStatus === 'AUTHORIZED' && Boolean(cfg.accessToken || cfg.refreshToken),
      authorizedAt: cfg.authorizedAt || null,
      lastTestAt: cfg.lastTestAt || null,
      lastSyncAt: cfg.lastSyncAt || null,
      lastError: cfg.lastError || null,
    };
  }

  async upsertConfig(companyId: string, input: {
    baseUrl: string;
    clientId: string;
    callbackUrl?: string | null;
    clientSecret?: string | null;
    selectedEntityId?: string | null;
    selectedEntityName?: string | null;
    selectedEntityFullPath?: string | null;
    includeSubentities?: boolean;
  }, updatedBy?: string) {
    const current = (await this.getStoredConfig(companyId)) || {
      baseUrl: this.defaultUrl,
      clientId: '',
      includeSubentities: false,
      connectionStatus: 'NOT_CONFIGURED' as GlpiConnectionStatus,
    };
    const next: GlpiConfig = {
      ...current,
      baseUrl: this.normalizeBaseUrl(input.baseUrl),
      clientId: String(input.clientId || '').trim(),
      callbackUrl:
        input.callbackUrl !== undefined ? this.normalizeCallbackUrl(input.callbackUrl) : (current as GlpiConfig).callbackUrl || null,
      clientSecret: input.clientSecret ? String(input.clientSecret).trim() : current.clientSecret,
      selectedEntityId:
        input.selectedEntityId !== undefined ? (input.selectedEntityId ? String(input.selectedEntityId) : null) : current.selectedEntityId,
      selectedEntityName:
        input.selectedEntityName !== undefined ? (input.selectedEntityName ? String(input.selectedEntityName) : null) : current.selectedEntityName,
      selectedEntityFullPath:
        input.selectedEntityFullPath !== undefined
          ? input.selectedEntityFullPath
            ? String(input.selectedEntityFullPath)
            : null
          : current.selectedEntityFullPath,
      includeSubentities: input.includeSubentities === true,
      connectionStatus:
        current.accessToken || current.refreshToken ? current.connectionStatus || 'CONFIGURED' : 'CONFIGURED',
      lastError: null,
    };

    if (!next.baseUrl || !next.clientId || !next.clientSecret) {
      return { ok: false, error: 'URL base, Client ID e Client Secret são obrigatórios.' };
    }

    await this.saveStoredConfig(companyId, next, updatedBy);
    return { ok: true };
  }

  async revokeAuthorization(companyId: string, updatedBy?: string) {
    const current = await this.getStoredConfig(companyId);
    if (!current) return { ok: false, error: 'Configuração GLPI não encontrada para a empresa.' };
    const next: GlpiConfig = {
      ...current,
      accessToken: undefined,
      refreshToken: undefined,
      accessTokenExpiresAt: null,
      connectionStatus: 'REVOKED',
      authorizedAt: null,
      lastError: null,
      oauthStateHash: null,
      oauthStateExpiresAt: null,
      oauthStateUserId: null,
      oauthStateCompanyId: null,
      oauthStateConfigKey: null,
      oauthStateReturnUrl: null,
    };
    await this.saveStoredConfig(companyId, next, updatedBy);
    return { ok: true };
  }

  buildAuthorizationUrl(input: {
    companyId: string;
    userId: string;
    returnUrl?: string | null;
    callbackUrl?: string | null;
    requestedBaseUrl?: string | null;
  }) {
    return this.getStoredConfig(input.companyId).then(async (cfg) => {
      if (!cfg?.baseUrl || !cfg?.clientId || !cfg?.clientSecret) {
        return { ok: false, error: 'Salve URL base, Client ID e Client Secret antes de autorizar.' };
      }
      const callbackUrl = this.resolveCallbackUrl({
        explicitCallbackUrl: input.callbackUrl,
        requestedBaseUrl: input.requestedBaseUrl,
        storedCallbackUrl: cfg.callbackUrl || null,
      });
      if (!callbackUrl) {
        return { ok: false, error: 'Não foi possível definir a URL de callback do OAuth2.' };
      }
      const configKey = this.getGlpiConfigKey(input.companyId);
      const safeReturnUrl = String(input.returnUrl || this.buildDefaultFrontendReturnUrl(input.companyId)).trim();
      const { rawState, payload } = this.encodeOAuthState({
        companyId: input.companyId,
        userId: input.userId,
        configKey,
        returnUrl: safeReturnUrl,
      });
      await this.saveStoredConfig(
        input.companyId,
        {
          ...cfg,
          callbackUrl,
          oauthStateHash: this.hashState(rawState),
          oauthStateExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          oauthStateUserId: payload.userId,
          oauthStateCompanyId: payload.companyId,
          oauthStateConfigKey: payload.configKey,
          oauthStateReturnUrl: payload.returnUrl,
          lastError: null,
        },
      );
      const authorizeUrl = new URL(`${this.buildApiRoot(cfg.baseUrl)}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', cfg.clientId);
      authorizeUrl.searchParams.set('scope', this.oauthScope);
      authorizeUrl.searchParams.set('state', rawState);
      authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
      return { ok: true, data: { authorizeUrl: authorizeUrl.toString(), rawState } };
    });
  }

  async completeAuthorization(input: {
    code?: string;
    state?: string;
    cookieState?: string;
    callbackUrl?: string | null;
    requestedBaseUrl?: string | null;
  }) {
    if (!input.code) return { ok: false, error: 'Callback OAuth2 inválido.' };
    const effectiveState = String(input.state || input.cookieState || '').trim();
    if (!effectiveState) return { ok: false, error: 'Callback OAuth2 inválido.' };
    const stateDecoded = this.decodeAndValidateState(effectiveState);
    if (!stateDecoded.ok) return stateDecoded;
    const parsed = stateDecoded.data;
    const companyId = String(parsed.companyId || '').trim();
    if (!companyId) return { ok: false, error: 'Empresa não identificada no retorno OAuth2.' };
    const cfg = await this.getStoredConfig(companyId);
    if (!cfg?.clientId || !cfg?.clientSecret) {
      return { ok: false, error: 'Configuração GLPI incompleta para concluir a autorização.' };
    }
    const callbackUrl = this.resolveCallbackUrl({
      explicitCallbackUrl: input.callbackUrl,
      requestedBaseUrl: input.requestedBaseUrl,
      storedCallbackUrl: cfg.callbackUrl || null,
    });
    if (!callbackUrl) return { ok: false, error: 'Não foi possível definir a URL de callback do OAuth2.' };
    if (!cfg.oauthStateHash || cfg.oauthStateHash !== this.hashState(effectiveState)) {
      return { ok: false, error: 'State OAuth2 não confere com a solicitação original.' };
    }
    if (this.isExpired(cfg.oauthStateExpiresAt)) {
      return { ok: false, error: 'A autorização expirou. Tente novamente.' };
    }
    if (cfg.oauthStateCompanyId !== parsed.companyId || cfg.oauthStateUserId !== parsed.userId || cfg.oauthStateConfigKey !== parsed.configKey) {
      return { ok: false, error: 'State OAuth2 não confere com a autorização pendente.' };
    }

    const clearPendingState: GlpiConfig = {
      ...cfg,
      oauthStateHash: null,
      oauthStateExpiresAt: null,
      oauthStateUserId: null,
      oauthStateCompanyId: null,
      oauthStateConfigKey: null,
      oauthStateReturnUrl: null,
    };

    try {
      const { json } = await this.postForm(`${this.buildApiRoot(cfg.baseUrl)}/token`, {
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code: input.code,
        redirect_uri: callbackUrl,
      });

      const accessToken = String(json?.access_token || '').trim();
      const refreshToken = String(json?.refresh_token || '').trim();
      const expiresIn = Number(json?.expires_in || 0);
      if (!accessToken) {
        await this.saveStoredConfig(companyId, {
          ...clearPendingState,
          connectionStatus: 'ERROR',
          lastError: 'O GLPI não retornou access_token.',
        });
        return { ok: false, error: 'O GLPI não retornou access_token.' };
      }

      await this.saveStoredConfig(companyId, {
        ...clearPendingState,
        accessToken,
        refreshToken: refreshToken || cfg.refreshToken,
        accessTokenExpiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        connectionStatus: 'AUTHORIZED',
        authorizedAt: new Date().toISOString(),
        lastError: null,
      });

      return {
        ok: true,
        data: {
          companyId,
          userId: parsed.userId,
          returnUrl: cfg.oauthStateReturnUrl || parsed.returnUrl || this.buildDefaultFrontendReturnUrl(companyId),
        },
      };
    } catch (error: any) {
      await this.saveStoredConfig(companyId, {
        ...clearPendingState,
        connectionStatus: 'ERROR',
        lastError: error?.message || 'Falha ao concluir autorização OAuth2.',
      });
      return { ok: false, error: error?.message || 'Falha ao concluir autorização OAuth2.' };
    }
  }

  private async refreshAccessToken(companyId: string, cfg: GlpiConfig) {
    if (!cfg.refreshToken || !cfg.clientId || !cfg.clientSecret) {
      return { ok: false, error: 'Refresh Token indisponível para renovar a conexão.' };
    }
    try {
      const { json } = await this.postForm(`${this.buildApiRoot(cfg.baseUrl)}/token`, {
        grant_type: 'refresh_token',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
      });
      const accessToken = String(json?.access_token || '').trim();
      const refreshToken = String(json?.refresh_token || '').trim() || cfg.refreshToken;
      const expiresIn = Number(json?.expires_in || 0);
      if (!accessToken) return { ok: false, error: 'O GLPI não retornou access_token ao renovar a conexão.' };
      const next: GlpiConfig = {
        ...cfg,
        accessToken,
        refreshToken,
        accessTokenExpiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        connectionStatus: 'AUTHORIZED',
        lastError: null,
      };
      await this.saveStoredConfig(companyId, next);
      return { ok: true, data: next };
    } catch (error: any) {
      const next: GlpiConfig = {
        ...cfg,
        connectionStatus: 'ERROR',
        lastError: error?.message || 'Falha ao renovar o token do GLPI.',
      };
      await this.saveStoredConfig(companyId, next);
      return { ok: false, error: next.lastError };
    }
  }

  private async ensureAuthorizedAccess(companyId: string) {
    const cfg = await this.getStoredConfig(companyId);
    if (!cfg?.baseUrl || !cfg?.clientId || !cfg?.clientSecret) {
      return { ok: false, error: 'Configuração GLPI não encontrada para a empresa.' };
    }
    if (!cfg.accessToken && !cfg.refreshToken) {
      return { ok: false, error: 'A conexão GLPI ainda não foi autorizada.' };
    }
    if (!cfg.accessToken || this.isExpired(cfg.accessTokenExpiresAt)) {
      const refreshed = await this.refreshAccessToken(companyId, cfg);
      if (!refreshed.ok) return refreshed;
      return { ok: true, data: refreshed.data! };
    }
    return { ok: true, data: cfg };
  }

  private async discoverVersionedApi(baseUrl: string, accessToken?: string | null) {
    const candidates = [
      `${this.buildVersionedApiRoot(baseUrl, 'v2.2')}/doc`,
      `${this.buildVersionedApiRoot(baseUrl, 'v2.1')}/doc`,
      `${this.buildVersionedApiRoot(baseUrl, 'v2.0')}/doc`,
      `${this.buildApiRoot(baseUrl)}/v2.2/doc`,
      `${this.buildApiRoot(baseUrl)}/v2.1/doc`,
      `${this.buildApiRoot(baseUrl)}/v2.0/doc`,
    ];
    const headers = accessToken ? this.bearerHeaders(accessToken) : { Accept: 'text/html' };
    for (const url of candidates) {
      try {
        const { text } = await this.requestText(url, { method: 'GET', headers });
        if (text.includes('API Endpoints') || text.includes('OpenAPI') || text.includes('SwaggerUI')) {
          return { ok: true, data: { docUrl: url } };
        }
      } catch {
        continue;
      }
    }
    return { ok: false, error: 'A documentação da API V2 não foi encontrada no GLPI informado.' };
  }

  private async getStatus(baseUrl: string, accessToken?: string | null) {
    const attempts = [
      { url: `${this.buildApiRoot(baseUrl)}/status`, auth: true },
      { url: `${this.normalizeBaseUrl(baseUrl)}/status.php?format=json`, auth: false },
    ];
    for (const attempt of attempts) {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (attempt.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const { json } = await this.requestJson(attempt.url, { method: 'GET', headers });
        return { ok: true, data: json };
      } catch {
        continue;
      }
    }
    return { ok: false, error: 'Não foi possível consultar o status do GLPI.' };
  }

  private async tryListEntities(baseUrl: string, accessToken: string) {
    const roots = ['v2.2', 'v2.1', 'v2.0'].map((v) => this.buildVersionedApiRoot(baseUrl, v));
    const candidates = [
      ...roots.map((root) => `${root}/Administration/Entity?limit=200&sort=id`),
      ...roots.map((root) => `${root}/Entity?limit=200&sort=id`),
    ];
    for (const url of candidates) {
      try {
        const { json } = await this.requestJson(url, { method: 'GET', headers: this.bearerHeaders(accessToken) });
        const entities = this.normalizeEntities(this.parseArrayPayload(json));
        if (entities.length > 0) return { ok: true, data: entities };
      } catch {
        continue;
      }
    }
    return { ok: false, error: 'Não foi possível listar as entidades acessíveis via API V2.' };
  }

  async listEntities(companyId: string) {
    const auth = await this.ensureAuthorizedAccess(companyId);
    if (!auth.ok) return auth;
    const cfg = auth.data!;
    const entities = await this.tryListEntities(cfg.baseUrl, cfg.accessToken!);
    if (!entities.ok) return entities;
    return { ok: true, data: entities.data! };
  }

  private async countComputers(baseUrl: string, accessToken: string, entityIds: string[]) {
    if (entityIds.length === 0) return { ok: true, data: 0 };
    const filter = entityIds.length === 1 ? `entity.id==${entityIds[0]}` : `entity.id=in=(${entityIds.join(',')})`;
    const roots = ['v2.2', 'v2.1', 'v2.0'].map((v) => this.buildVersionedApiRoot(baseUrl, v));
    const candidates = [
      ...roots.map((root) => `${root}/Assets/Computer?limit=1&filter=${encodeURIComponent(filter)}`),
      ...roots.map((root) => `${root}/Computer?limit=1&filter=${encodeURIComponent(filter)}`),
    ];
    for (const url of candidates) {
      try {
        const { response, json } = await this.requestJson(url, { method: 'GET', headers: this.bearerHeaders(accessToken) });
        const items = this.parseArrayPayload(json);
        return { ok: true, data: this.parseCount(json, response.headers, items.length) };
      } catch {
        continue;
      }
    }
    return { ok: false, error: 'Não foi possível contar os computadores via API V2.' };
  }

  private async tryListComputers(baseUrl: string, accessToken: string, entityIds: string[], options?: { entityId?: string | null; recursive?: boolean }) {
    if (entityIds.length === 0 && !options?.entityId) return { ok: true, data: { items: [] as GlpiComputer[], total: 0, truncated: false } };
    const filter = entityIds.length === 1 ? `entity.id==${entityIds[0]}` : `entity.id=in=(${entityIds.join(',')})`;
    const roots = ['v2.2', 'v2.1', 'v2.0'].map((v) => this.buildVersionedApiRoot(baseUrl, v));
    const headerCandidates =
      options?.entityId
        ? roots.map((root) => ({
            build: (start: number, limit: number) => `${root}/Assets/Computer?start=${start}&limit=${limit}&sort=id:asc`,
            headers: this.buildEntityScopedHeaders(accessToken, options.entityId!, options?.recursive === true),
          }))
        : [];
    const filterCandidates = [
      ...roots.map((root) => ({
        build: (start: number, limit: number) =>
          `${root}/Assets/Computer?start=${start}&limit=${limit}&sort=id:asc&filter=${encodeURIComponent(filter)}`,
        headers: this.bearerHeaders(accessToken),
      })),
    ];
    const candidates = [...headerCandidates, ...filterCandidates];

    for (const candidate of candidates) {
      const items: GlpiComputer[] = [];
      const seen = new Set<string>();
      const pageSize = 200;
      let total = 0;
      let truncated = false;
      let firstPageWorked = false;

      for (let page = 0; page < 10; page += 1) {
        const start = page * pageSize;
        try {
          const { response, json } = await this.requestJson(candidate.build(start, pageSize), {
            method: 'GET',
            headers: candidate.headers,
          });
          firstPageWorked = true;
          const rawItems = this.parseArrayPayload(json);
          total = this.parseCount(json, response.headers, rawItems.length);
          for (const rawItem of rawItems) {
            const parsed = this.parseComputer(rawItem);
            if (!parsed.externalId || seen.has(parsed.externalId)) continue;
            seen.add(parsed.externalId);
            items.push(parsed);
          }
          if (rawItems.length < pageSize || items.length >= total) {
            return { ok: true, data: { items, total, truncated } };
          }
        } catch {
          if (!firstPageWorked) break;
          truncated = true;
          return { ok: true, data: { items, total: total || items.length, truncated } };
        }
      }

      if (firstPageWorked) {
        truncated = true;
        return { ok: true, data: { items, total: total || items.length, truncated } };
      }
    }

    return { ok: false, error: 'Não foi possível listar os computadores via API V2.' };
  }

  async listComputersForImport(companyId: string) {
    const auth = await this.ensureAuthorizedAccess(companyId);
    if (!auth.ok) return auth;
    const cfg = auth.data!;
    if (!cfg.selectedEntityId) {
      return { ok: false, error: 'Selecione a entidade do cliente no GLPI antes de importar máquinas.' };
    }

    const entities = await this.tryListEntities(cfg.baseUrl, cfg.accessToken!);
    if (!entities.ok) return entities;
    const selected = entities.data!.find((item) => item.id === cfg.selectedEntityId) || null;
    if (!selected) {
      return { ok: false, error: 'A entidade selecionada não foi encontrada entre as entidades acessíveis.' };
    }

    const descendantIds = cfg.includeSubentities
      ? this.getDescendantEntities(entities.data!, selected.id).map((item) => item.id)
      : [];
    const computerIds = [selected.id, ...descendantIds];
    const computers = await this.tryListComputers(cfg.baseUrl, cfg.accessToken!, computerIds, {
      entityId: selected.id,
      recursive: cfg.includeSubentities === true,
    });
    if (!computers.ok) return computers;

    return {
      ok: true,
      data: {
        selectedEntity: selected,
        includeSubentities: cfg.includeSubentities === true,
        totalAvailable: computers.data!.total,
        truncated: computers.data!.truncated,
        computers: computers.data!.items,
      },
    };
  }

  async testConnection(companyId: string) {
    const cfg = await this.getStoredConfig(companyId);
    if (!cfg?.baseUrl || !cfg?.clientId || !cfg?.clientSecret) {
      return { ok: false, error: 'Salve URL base, Client ID e Client Secret antes de testar.' };
    }

    const result: any = {
      baseUrl: cfg.baseUrl,
      apiLabel: 'V2 - High-Level API',
      connectionStatus: cfg.connectionStatus || 'NOT_CONFIGURED',
      authorized: false,
      glpiVersion: null,
      authenticatedUser: null,
      entities: [] as GlpiEntity[],
      selectedEntity: null as GlpiEntity | null,
      includeSubentities: cfg.includeSubentities === true,
      hostsInPrimaryEntity: 0,
      hostsInSubentities: 0,
      totalConsidered: 0,
    };

    try {
      await this.requestText(cfg.baseUrl, { method: 'GET' }, 15000);
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Falha ao acessar a URL base do GLPI.' };
    }

    const auth = await this.ensureAuthorizedAccess(companyId);
    if (!auth.ok) {
      await this.saveStoredConfig(companyId, {
        ...cfg,
        connectionStatus: 'ERROR',
        lastTestAt: new Date().toISOString(),
        lastError: auth.error,
      });
      return auth;
    }
    const resolved = auth.data!;
    result.authorized = true;
    result.connectionStatus = resolved.connectionStatus || 'AUTHORIZED';

    const doc = await this.discoverVersionedApi(resolved.baseUrl, resolved.accessToken || null);
    if (!doc.ok) {
      await this.saveStoredConfig(companyId, {
        ...resolved,
        connectionStatus: 'ERROR',
        lastTestAt: new Date().toISOString(),
        lastError: doc.error,
      });
      return doc;
    }
    result.docUrl = doc.data?.docUrl || null;

    const status = await this.getStatus(resolved.baseUrl, resolved.accessToken || null);
    if (status.ok) {
      result.glpiVersion =
        status.data?.version || status.data?.glpi?.version || status.data?.glpi_version || status.data?.data?.version || null;
    }

    const entities = await this.tryListEntities(resolved.baseUrl, resolved.accessToken!);
    if (!entities.ok) {
      await this.saveStoredConfig(companyId, {
        ...resolved,
        connectionStatus: 'ERROR',
        lastTestAt: new Date().toISOString(),
        lastError: entities.error,
      });
      return entities;
    }
    result.entities = entities.data!;

    const selected = resolved.selectedEntityId
      ? result.entities.find((item: GlpiEntity) => item.id === resolved.selectedEntityId) || null
      : null;
    result.selectedEntity = selected;

    const meCandidates = [
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.2')}/Administration/User/me`,
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.1')}/Administration/User/me`,
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.0')}/Administration/User/me`,
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.2')}/User/me`,
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.1')}/User/me`,
      `${this.buildVersionedApiRoot(resolved.baseUrl, 'v2.0')}/User/me`,
    ];
    for (const url of meCandidates) {
      try {
        const { json } = await this.requestJson(url, { method: 'GET', headers: this.bearerHeaders(resolved.accessToken!) });
        result.authenticatedUser = json?.display_name || json?.name || json?.email || json?.id || null;
        if (result.authenticatedUser) break;
      } catch {
        continue;
      }
    }

    if (selected) {
      const primaryCount = await this.countComputers(resolved.baseUrl, resolved.accessToken!, [selected.id]);
      if (!primaryCount.ok) return primaryCount;
      result.hostsInPrimaryEntity = primaryCount.data!;

      if (resolved.includeSubentities) {
        const descendants = this.getDescendantEntities(result.entities, selected.id);
        if (descendants.length > 0) {
          const descendantCount = await this.countComputers(
            resolved.baseUrl,
            resolved.accessToken!,
            descendants.map((item) => item.id),
          );
          if (!descendantCount.ok) return descendantCount;
          result.hostsInSubentities = descendantCount.data!;
        }
      }
      result.totalConsidered = result.hostsInPrimaryEntity + result.hostsInSubentities;
    }

    await this.saveStoredConfig(companyId, {
      ...resolved,
      connectionStatus: 'AUTHORIZED',
      lastTestAt: new Date().toISOString(),
      lastError: null,
    });

    return { ok: true, data: result };
  }
}
