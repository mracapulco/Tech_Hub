import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ZabbixService } from '../integrations/zabbix/zabbix.service';
import {
  buildVeeamBackupTimeline,
  type VeeamTimelineResultFilter,
  type VeeamTimelineTypeFilter,
} from './veeam-timeline';
import {
  buildVeeamRepositoryPlanning,
  resolvePlanningJobKey,
  resolveRepositoryKey,
  simulateRepositoryRetention,
} from './veeam-repositories';

type VeeamValidatedItem = {
  itemId: string;
  hostId: string;
  key: string;
  name: string;
  status: string;
  state: string;
  error: string;
  valueType: number;
};

type VeeamHistoryRow = {
  itemId: string;
  clock: number;
  ns: number;
  value: string;
};

type VeeamMetricsSnapshotResult =
  | {
      ok: true;
      data: {
        validatedItem: VeeamValidatedItem;
        latest: VeeamHistoryRow;
        metricsJson: Record<string, any>;
      };
    }
  | {
      ok: false;
      error: string;
    };

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService, private readonly zabbixService: ZabbixService) {}

  private logVeeamDebug(_message: string, _data: Record<string, any>) {}

  private toNumberOrNull(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private normalizeRepositoryOverrideNumbers(input: {
    capacityGB?: unknown;
    usedSpaceGB?: unknown;
    freeGB?: unknown;
  }) {
    let capacityGB = this.toNumberOrNull(input.capacityGB);
    let usedSpaceGB = this.toNumberOrNull(input.usedSpaceGB);
    let freeGB = this.toNumberOrNull(input.freeGB);

    // Se o usuário informar dois dos três campos, completa o terceiro no momento do save.
    if (capacityGB == null && usedSpaceGB != null && freeGB != null) {
      capacityGB = usedSpaceGB + freeGB;
    }
    if (usedSpaceGB == null && capacityGB != null && freeGB != null) {
      usedSpaceGB = capacityGB - freeGB;
    }
    if (freeGB == null && capacityGB != null && usedSpaceGB != null) {
      freeGB = capacityGB - usedSpaceGB;
    }

    return {
      capacityGB,
      usedSpaceGB,
      freeGB,
    };
  }

  private getSaoPauloDateFromUnixSeconds(unixSeconds: number) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(unixSeconds * 1000));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  private async getVeeamMetricsSnapshot(input: {
    companyId: string;
    hostId: string;
    itemId?: string;
    date?: string;
  }): Promise<VeeamMetricsSnapshotResult> {
    const validatedItem = await this.zabbixService.getValidatedItem(input.companyId, {
      hostId: input.hostId,
      itemId: input.itemId,
      itemKey: 'veeam.get.metrics',
    });
    if (!validatedItem.ok || !validatedItem.data) {
      return { ok: false, error: validatedItem.error || 'Falha ao validar item veeam.get.metrics no Zabbix.' };
    }

    const history = await this.zabbixService.getItemTextHistory(input.companyId, validatedItem.data.itemId);
    if (!history.ok) {
      return { ok: false, error: history.error || 'Falha ao consultar histórico do item veeam.get.metrics.' };
    }
    const historyRows = Array.isArray(history.data) ? history.data : [];
    if (historyRows.length === 0) {
      return {
        ok: false,
        error:
          'Item veeam.get.metrics encontrado, mas sem histórico disponível. Execute a coleta no Zabbix ou verifique a retenção de histórico do item.',
      };
    }

    const requestedDate = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
    const selectedHistoryRow =
      requestedDate
        ? historyRows.find((row) => this.getSaoPauloDateFromUnixSeconds(Number(row.clock || 0)) <= requestedDate)
        : historyRows[0];
    if (!selectedHistoryRow) {
      return {
        ok: false,
        error: `Nao foi encontrado historico do item veeam.get.metrics para a data ${requestedDate} nem para datas anteriores.`,
      };
    }
    let metricsJson: Record<string, any>;
    try {
      metricsJson = JSON.parse(String(selectedHistoryRow.value || '{}'));
    } catch {
      return { ok: false, error: 'Histórico encontrado, mas o JSON do item veeam.get.metrics é inválido.' };
    }

    return {
      ok: true,
      data: {
        validatedItem: validatedItem.data,
        latest: selectedHistoryRow,
        metricsJson,
      },
    };
  }

  private validateRepositoryOverrideInput(body: {
    capacityGB?: number | null;
    usedSpaceGB?: number | null;
    freeGB?: number | null;
  }) {
    const errors: string[] = [];
    const capacityGB = body.capacityGB ?? null;
    const usedSpaceGB = body.usedSpaceGB ?? null;
    const freeGB = body.freeGB ?? null;

    if (capacityGB != null && capacityGB <= 0) errors.push('capacityGB deve ser maior que 0.');
    if (usedSpaceGB != null && capacityGB != null && usedSpaceGB > capacityGB) {
      errors.push('usedSpaceGB não pode ser maior que capacityGB.');
    }
    if (freeGB != null && freeGB < 0) errors.push('freeGB deve ser maior ou igual a 0.');
    if (freeGB != null && capacityGB != null && freeGB > capacityGB) {
      errors.push('freeGB não pode ser maior que capacityGB.');
    }
    return errors;
  }

  private validateRepositoryJobOverrideInput(body: {
    protectedSizeGB?: number | null;
    fullBackupSizeGB?: number | null;
    dailyChangePercent?: number | null;
    currentRetentionDays?: number | null;
    retentionDays?: number | null;
    dailyFrequency?: number | null;
    backupMode?: string | null;
    safetyMarginPercent?: number | null;
  }) {
    const errors: string[] = [];
    const protectedSizeGB = body.protectedSizeGB ?? null;
    const fullBackupSizeGB = body.fullBackupSizeGB ?? null;
    const dailyChangePercent = body.dailyChangePercent ?? null;
    const currentRetentionDays = body.currentRetentionDays ?? null;
    const retentionDays = body.retentionDays ?? null;
    const dailyFrequency = body.dailyFrequency ?? null;
    const safetyMarginPercent = body.safetyMarginPercent ?? null;
    const backupMode = String(body.backupMode || '').trim();

    if (protectedSizeGB != null && protectedSizeGB <= 0) errors.push('protectedSizeGB deve ser maior que 0.');
    if (fullBackupSizeGB != null && fullBackupSizeGB <= 0) errors.push('fullBackupSizeGB deve ser maior que 0.');
    if (dailyChangePercent != null && dailyChangePercent < 0) errors.push('dailyChangePercent deve ser maior ou igual a 0.');
    if (currentRetentionDays != null && currentRetentionDays < 1) errors.push('currentRetentionDays deve ser maior ou igual a 1.');
    if (retentionDays != null && retentionDays < 1) errors.push('retentionDays deve ser maior ou igual a 1.');
    if (dailyFrequency != null && dailyFrequency < 1) errors.push('dailyFrequency deve ser maior ou igual a 1.');
    if (safetyMarginPercent != null && safetyMarginPercent < 0) errors.push('safetyMarginPercent deve ser maior ou igual a 0.');
    if (backupMode && !['Incremental', 'Synthetic Full', 'Active Full'].includes(backupMode)) {
      errors.push('backupMode deve ser Incremental, Synthetic Full ou Active Full.');
    }
    return errors;
  }

  async overview(companyId: string) {
    const repos = await this.prisma.backupRepository.count({ where: { companyId } });
    const proxies = await this.prisma.backupProxy.count({ where: { companyId } });
    const cores = await this.prisma.backupCore.count({ where: { companyId } });
    const jobs = await this.prisma.backupJob.count({ where: { companyId } });
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const runs = await this.prisma.backupRun.count({
      where: { job: { companyId } , startAt: { gte: lastMonth } },
    });
    return { repos, proxies, cores, jobs, runs };
  }

  async listRepositories(companyId: string) {
    return this.prisma.backupRepository.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async listProxies(companyId: string) {
    return this.prisma.backupProxy.findMany({ where: { companyId }, orderBy: { hostname: 'asc' } });
  }

  async getCore(companyId: string) {
    return this.prisma.backupCore.findMany({ where: { companyId }, orderBy: { hostname: 'asc' } });
  }

  async listJobs(companyId: string) {
    return this.prisma.backupJob.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async listRuns(companyId: string, since?: Date) {
    return this.prisma.backupRun.findMany({
      where: { job: { companyId }, startAt: since ? { gte: since } : undefined },
      orderBy: { startAt: 'desc' },
      take: 200,
    });
  }

  calcRepository(input: { sourceGB: number; dailyChangePct: number; retentionDays: number; fullWeekly?: boolean; compressionRatio?: number; dedupeRatio?: number }) {
    const src = Math.max(0, input.sourceGB || 0);
    const change = Math.max(0, input.dailyChangePct || 0) / 100;
    const days = Math.max(1, input.retentionDays || 30);
    const fullWeekly = !!input.fullWeekly;
    const comp = Math.max(0.01, input.compressionRatio || 1);
    const dedupe = Math.max(0.01, input.dedupeRatio || 1);
    const daily = src * change;
    let total = src + daily * days;
    if (fullWeekly) total += src * Math.floor(days / 7);
    const eff = total / (comp * dedupe);
    const margin = Math.ceil(eff * 1.2);
    return { totalGB: Math.ceil(eff), recommendedGB: margin };
  }

  calcProxy(input: { throughputMBps: number; concurrentVMs: number; cores: number }) {
    const t = Math.max(1, input.throughputMBps || 100);
    const vms = Math.max(1, input.concurrentVMs || 4);
    const cores = Math.max(1, input.cores || 4);
    const perVm = t / vms;
    const maxConc = Math.min(vms, Math.floor(cores / 2) || 1);
    return { perVmMBps: Math.round(perVm), recommendedConcurrency: maxConc };
  }

  async createRepository(data: { companyId: string; siteId?: string; name: string; type: string; capacityGB: number; usedGB?: number; retentionPolicy?: string; compressionRatio?: number; dedupeRatio?: number; notes?: string }) {
    return this.prisma.backupRepository.create({
      data: {
        companyId: String(data.companyId),
        siteId: data.siteId ? String(data.siteId) : undefined,
        name: String(data.name),
        type: String(data.type),
        capacityGB: Number(data.capacityGB || 0),
        usedGB: Number(data.usedGB || 0),
        retentionPolicy: data.retentionPolicy || undefined,
        compressionRatio: data.compressionRatio != null ? Number(data.compressionRatio) : undefined,
        dedupeRatio: data.dedupeRatio != null ? Number(data.dedupeRatio) : undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createProxy(data: { companyId: string; siteId?: string; hostname: string; cores: number; memoryGB: number; throughputMBps?: number; concurrency?: number; transportMode?: string; notes?: string }) {
    return this.prisma.backupProxy.create({
      data: {
        companyId: String(data.companyId),
        siteId: data.siteId ? String(data.siteId) : undefined,
        hostname: String(data.hostname),
        cores: Number(data.cores || 0),
        memoryGB: Number(data.memoryGB || 0),
        throughputMBps: data.throughputMBps != null ? Number(data.throughputMBps) : undefined,
        concurrency: data.concurrency != null ? Number(data.concurrency) : undefined,
        transportMode: data.transportMode || undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createCore(data: { companyId: string; hostname: string; version?: string; license?: string; jobsCount?: number; repositoriesCount?: number; proxiesCount?: number; healthStatus?: string; notes?: string }) {
    return this.prisma.backupCore.create({
      data: {
        companyId: String(data.companyId),
        hostname: String(data.hostname),
        version: data.version || undefined,
        license: data.license || undefined,
        jobsCount: Number(data.jobsCount || 0),
        repositoriesCount: Number(data.repositoriesCount || 0),
        proxiesCount: Number(data.proxiesCount || 0),
        healthStatus: data.healthStatus || undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createJob(data: { companyId: string; name: string; type: string; schedule?: string; retentionPolicy?: string; repositoryId: string; proxyId?: string; enabled?: boolean }) {
    return this.prisma.backupJob.create({
      data: {
        companyId: String(data.companyId),
        name: String(data.name),
        type: String(data.type),
        schedule: data.schedule || undefined,
        retentionPolicy: data.retentionPolicy || undefined,
        repositoryId: String(data.repositoryId),
        proxyId: data.proxyId ? String(data.proxyId) : undefined,
        enabled: data.enabled != null ? Boolean(data.enabled) : true,
      },
    });
  }

  async createRunsBulk(jobId: string, runs: Array<{ startAt: string; endAt?: string; status: string; processedGB?: number; transferredGB?: number; avgSpeedMBps?: number; bottleneck?: string; errors?: string; restorePointsCreated?: number }>) {
    if (!Array.isArray(runs) || runs.length === 0) return { created: 0 };
    const insert = runs.map((r) => ({
      jobId: String(jobId),
      startAt: new Date(r.startAt),
      endAt: r.endAt ? new Date(r.endAt) : null,
      status: r.status as any,
      processedGB: Number(r.processedGB || 0),
      transferredGB: Number(r.transferredGB || 0),
      avgSpeedMBps: r.avgSpeedMBps != null ? Number(r.avgSpeedMBps) : null,
      bottleneck: r.bottleneck || null,
      errors: r.errors || null,
      restorePointsCreated: r.restorePointsCreated != null ? Number(r.restorePointsCreated) : null,
    }));
    const result = await this.prisma.backupRun.createMany({ data: insert });
    return { created: result.count || 0 };
  }

  async listVeeamHosts(companyId: string) {
    return this.zabbixService.listHostsWithItem(companyId, 'veeam.get.metrics');
  }

  async getVeeamRepositories(input: { companyId: string; hostId: string; itemId?: string; date?: string }) {
    this.logVeeamDebug('Iniciando geração de repositórios', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId || null,
      date: input.date || null,
    });
    const snapshot = await this.getVeeamMetricsSnapshot(input);
    this.logVeeamDebug('Resultado do item.get para repositórios', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId || null,
      date: input.date || null,
      itemFound: !!snapshot.ok,
      itemData: snapshot.ok ? snapshot.data.validatedItem : null,
    });
    if (!snapshot.ok) return snapshot;

    const { validatedItem, latest, metricsJson } = snapshot.data;
    const repositoriesStates = Array.isArray(metricsJson?.repositories_states?.data) ? metricsJson.repositories_states.data : [];
    const jobsStates = Array.isArray(metricsJson?.jobs_states?.data) ? metricsJson.jobs_states.data : [];
    const repositoryOverrides = await this.prisma.backupRepositoryOverride.findMany({
      where: { companyId: input.companyId, zabbixHostId: input.hostId },
      orderBy: { repositoryName: 'asc' },
    });
    const jobOverrides = await this.prisma.backupRepositoryJobOverride.findMany({
      where: { companyId: input.companyId, zabbixHostId: input.hostId },
      orderBy: [{ repositoryId: 'asc' }, { jobName: 'asc' }],
    });

    const planning = buildVeeamRepositoryPlanning({
      metricsJson,
      repositoryOverrides: repositoryOverrides.map((row) => ({
        repositoryId: row.repositoryId,
        repositoryName: row.repositoryName,
        repositoryType: row.repositoryType,
        capacityGB: row.capacityGB,
        usedSpaceGB: row.usedSpaceGB,
        freeGB: row.freeGB,
        notes: row.notes,
        useManualForPlanning: row.useManualForPlanning,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
      })),
      jobOverrides: jobOverrides.map((row) => ({
        repositoryId: row.repositoryId,
        jobId: row.jobId,
        jobName: row.jobName,
        protectedSizeGB: row.protectedSizeGB,
        fullBackupSizeGB: row.fullBackupSizeGB,
        dailyChangePercent: row.dailyChangePercent,
        currentRetentionDays: row.currentRetentionDays,
        retentionDays: row.retentionDays,
        dailyFrequency: row.dailyFrequency,
        backupMode: row.backupMode,
        safetyMarginPercent: row.safetyMarginPercent,
        notes: row.notes,
        useManualForPlanning: row.useManualForPlanning,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
      })),
      collectedAt: latest.clock ? Number(latest.clock) * 1000 : undefined,
    });

    this.logVeeamDebug('Resumo de repositórios gerado', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.itemId,
      repositoriesStates: repositoriesStates.length,
      jobsStates: jobsStates.length,
      repositoriesInferred: planning.meta.repositoriesInferred,
      overridesFound: repositoryOverrides.length,
      jobOverridesFound: jobOverrides.length,
      incompleteRepositories: planning.meta.repositoriesIncomplete,
    });

    return {
      ok: true,
      data: {
        host: {
          hostId: validatedItem.hostId || input.hostId,
          itemId: validatedItem.itemId,
          lastClock: latest.clock,
        },
        meta: {
          source: 'Zabbix history item veeam.get.metrics',
          zabbixItemId: validatedItem.itemId,
          zabbixHistoryClock: latest.clock,
          ...planning.meta,
        },
        summary: planning.summary,
        rows: planning.rows,
      },
    };
  }

  async getVeeamRepositoryJobs(input: { companyId: string; hostId: string; itemId?: string; repositoryId: string }) {
    const repositories = await this.getVeeamRepositories({
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId,
    });
    if (!repositories.ok) return repositories;
    const row = repositories.data.rows.find((item: any) => item.repositoryId === input.repositoryId);
    if (!row) return { ok: false, error: 'Repositório não encontrado para o host selecionado.' };
    return { ok: true, data: row.jobs || [] };
  }

  async saveVeeamRepositoryOverride(input: {
    companyId: string;
    hostId: string;
    repositoryId: string;
    repositoryName: string;
    repositoryType?: string;
    capacityGB?: number | null;
    usedSpaceGB?: number | null;
    freeGB?: number | null;
    protectedSizeGB?: number | null;
    notes?: string | null;
    useManualForPlanning?: boolean;
    updatedBy?: string | null;
  }) {
    const normalizedRepositoryId = resolveRepositoryKey(input.repositoryId, input.repositoryName);
    if (!normalizedRepositoryId) return { ok: false, error: 'repositoryId ou repositoryName é obrigatório.' };

    const normalizedNumbers = this.normalizeRepositoryOverrideNumbers({
      capacityGB: input.capacityGB,
      usedSpaceGB: input.usedSpaceGB,
      freeGB: input.freeGB,
    });
    const payload = {
      capacityGB: normalizedNumbers.capacityGB,
      usedSpaceGB: normalizedNumbers.usedSpaceGB,
      freeGB: normalizedNumbers.freeGB,
    };
    const validationErrors = this.validateRepositoryOverrideInput(payload);
    if (validationErrors.length > 0) return { ok: false, error: validationErrors.join(' ') };

    const saved = await this.prisma.backupRepositoryOverride.upsert({
      where: {
        companyId_zabbixHostId_repositoryId: {
          companyId: input.companyId,
          zabbixHostId: input.hostId,
          repositoryId: normalizedRepositoryId,
        },
      },
      update: {
        repositoryName: String(input.repositoryName || '').trim() || normalizedRepositoryId,
        repositoryType: input.repositoryType || null,
        capacityGB: payload.capacityGB,
        usedSpaceGB: payload.usedSpaceGB,
        freeGB: payload.freeGB,
        notes: input.notes || null,
        useManualForPlanning: !!input.useManualForPlanning,
        updatedBy: input.updatedBy || null,
      },
      create: {
        companyId: input.companyId,
        zabbixHostId: input.hostId,
        repositoryId: normalizedRepositoryId,
        repositoryName: String(input.repositoryName || '').trim() || normalizedRepositoryId,
        repositoryType: input.repositoryType || null,
        capacityGB: payload.capacityGB,
        usedSpaceGB: payload.usedSpaceGB,
        freeGB: payload.freeGB,
        notes: input.notes || null,
        useManualForPlanning: !!input.useManualForPlanning,
        updatedBy: input.updatedBy || null,
      },
    });

    return { ok: true, data: saved };
  }

  async saveVeeamRepositoryJobOverride(input: {
    companyId: string;
    hostId: string;
    repositoryId: string;
    jobId?: string;
    jobName: string;
    protectedSizeGB?: number | null;
    fullBackupSizeGB?: number | null;
    dailyChangePercent?: number | null;
    currentRetentionDays?: number | null;
    retentionDays?: number | null;
    dailyFrequency?: number | null;
    backupMode?: string | null;
    safetyMarginPercent?: number | null;
    notes?: string | null;
    useManualForPlanning?: boolean;
    updatedBy?: string | null;
  }) {
    const normalizedRepositoryId = resolveRepositoryKey(input.repositoryId, null);
    const normalizedJobId = resolvePlanningJobKey(input.jobId, input.jobName);
    if (!normalizedRepositoryId || !normalizedJobId) {
      return { ok: false, error: 'repositoryId e jobId/jobName são obrigatórios.' };
    }

    const payload = {
      protectedSizeGB: this.toNumberOrNull(input.protectedSizeGB),
      fullBackupSizeGB: this.toNumberOrNull(input.fullBackupSizeGB),
      dailyChangePercent: this.toNumberOrNull(input.dailyChangePercent),
      currentRetentionDays: this.toNumberOrNull(input.currentRetentionDays),
      retentionDays: this.toNumberOrNull(input.retentionDays),
      dailyFrequency: this.toNumberOrNull(input.dailyFrequency),
      backupMode: input.backupMode ? String(input.backupMode).trim() : null,
      safetyMarginPercent: this.toNumberOrNull(input.safetyMarginPercent),
    };
    const validationErrors = this.validateRepositoryJobOverrideInput(payload);
    if (validationErrors.length > 0) return { ok: false, error: validationErrors.join(' ') };

    const saved = await this.prisma.backupRepositoryJobOverride.upsert({
      where: {
        companyId_zabbixHostId_repositoryId_jobId: {
          companyId: input.companyId,
          zabbixHostId: input.hostId,
          repositoryId: normalizedRepositoryId,
          jobId: normalizedJobId,
        },
      },
      update: {
        jobName: String(input.jobName || '').trim() || normalizedJobId,
        protectedSizeGB: payload.protectedSizeGB,
        fullBackupSizeGB: payload.fullBackupSizeGB,
        dailyChangePercent: payload.dailyChangePercent,
        currentRetentionDays: payload.currentRetentionDays != null ? Number(payload.currentRetentionDays) : null,
        retentionDays: payload.retentionDays != null ? Number(payload.retentionDays) : null,
        dailyFrequency: payload.dailyFrequency != null ? Number(payload.dailyFrequency) : null,
        backupMode: payload.backupMode || null,
        safetyMarginPercent: payload.safetyMarginPercent,
        notes: input.notes || null,
        useManualForPlanning: !!input.useManualForPlanning,
        updatedBy: input.updatedBy || null,
      },
      create: {
        companyId: input.companyId,
        zabbixHostId: input.hostId,
        repositoryId: normalizedRepositoryId,
        jobId: normalizedJobId,
        jobName: String(input.jobName || '').trim() || normalizedJobId,
        protectedSizeGB: payload.protectedSizeGB,
        fullBackupSizeGB: payload.fullBackupSizeGB,
        dailyChangePercent: payload.dailyChangePercent,
        currentRetentionDays: payload.currentRetentionDays != null ? Number(payload.currentRetentionDays) : null,
        retentionDays: payload.retentionDays != null ? Number(payload.retentionDays) : null,
        dailyFrequency: payload.dailyFrequency != null ? Number(payload.dailyFrequency) : null,
        backupMode: payload.backupMode || null,
        safetyMarginPercent: payload.safetyMarginPercent,
        notes: input.notes || null,
        useManualForPlanning: !!input.useManualForPlanning,
        updatedBy: input.updatedBy || null,
      },
    });

    return { ok: true, data: saved };
  }

  simulateVeeamRepository(input: {
    repositoryId?: string;
    repositoryName?: string;
    jobId?: string;
    jobName?: string;
    capacityGB?: number | null;
    usedSpaceGB?: number | null;
    freeGB?: number | null;
    protectedSizeGB?: number | null;
    fullBackupSizeGB?: number | null;
    dailyChangePercent?: number | null;
    currentRetentionDays?: number | null;
    retentionDays?: number | null;
    baseDailyFrequency?: number | null;
    dailyFrequency?: number | null;
    backupMode?: string | null;
    safetyMarginPercent?: number | null;
  }) {
    const simulation = simulateRepositoryRetention(input);
    if (!simulation.complete) {
      return { ok: false, error: simulation.errors.join(' '), data: simulation };
    }
    return { ok: true, data: simulation };
  }

  async getVeeamTimeline(input: {
    companyId: string;
    hostId: string;
    itemId?: string;
    date: string;
    bucketMinutes?: number;
    timezone?: string;
    typeFilter?: VeeamTimelineTypeFilter;
    resultFilter?: VeeamTimelineResultFilter;
  }) {
    this.logVeeamDebug('Iniciando geração da timeline', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId || null,
      reportDate: input.date,
      bucketMinutes: input.bucketMinutes || 30,
      typeFilter: input.typeFilter || 'all',
      resultFilter: input.resultFilter || 'all',
    });
    const snapshot = await this.getVeeamMetricsSnapshot({
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId,
    });
    this.logVeeamDebug('Resultado do item.get', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId || null,
      itemFound: !!snapshot.ok,
      itemData: snapshot.ok ? snapshot.data.validatedItem : null,
    });
    if (!snapshot.ok) return snapshot;

    const { validatedItem, latest, metricsJson } = snapshot.data;
    this.logVeeamDebug('Resultado do history.get', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.itemId,
      historyRows: 1,
      historyClock: latest.clock || null,
    });
    this.logVeeamDebug('Parse do JSON do histórico', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.itemId,
      parseOk: true,
    });

    if (!Array.isArray(metricsJson?.sessions?.data)) {
      this.logVeeamDebug('JSON sem sessions.data', {
        companyId: input.companyId,
        hostId: input.hostId,
        itemId: validatedItem.itemId,
        sessionsDataExists: false,
      });
      return { ok: false, error: 'JSON do item veeam.get.metrics não possui sessions.data.' };
    }
    this.logVeeamDebug('JSON com sessions.data', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.itemId,
      sessionsTotal: Array.isArray(metricsJson.sessions.data) ? metricsJson.sessions.data.length : 0,
    });

    const timeline = buildVeeamBackupTimeline({
      metricsJson,
      reportDate: input.date,
      bucketMinutes: input.bucketMinutes,
      timezone: input.timezone || 'America/Sao_Paulo',
      typeFilter: input.typeFilter || 'all',
      resultFilter: input.resultFilter || 'all',
      collectedAt: latest.clock ? Number(latest.clock) * 1000 : undefined,
    });
    this.logVeeamDebug('Timeline gerada', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.itemId,
      sessionsTotal: timeline.debug.sessionsTotal,
      sessionsAfterTypeFilter: timeline.debug.sessionsAfterTypeFilter,
      sessionsCrossingReportDate: timeline.debug.sessionsCrossingReportDate,
      rowsGenerated: timeline.meta.rows,
    });

    const message =
      timeline.debug.sessionsCrossingReportDate === 0
        ? 'JSON válido, mas não há sessões para a data selecionada.'
        : timeline.meta.sessionsConsidered === 0
          ? 'Há sessões para a data selecionada, mas nenhuma atende aos filtros aplicados.'
          : '';

    return {
      ok: true,
      data: {
        ...timeline,
        meta: {
          ...timeline.meta,
          zabbixItemId: validatedItem.itemId,
          zabbixHistoryClock: latest.clock,
        },
        host: {
          hostId: validatedItem.hostId || input.hostId,
          itemId: validatedItem.itemId,
          lastClock: latest.clock,
        },
        message,
      },
    };
  }
}
