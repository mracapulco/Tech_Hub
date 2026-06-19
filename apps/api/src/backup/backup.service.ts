import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
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
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private collectionTimer: NodeJS.Timeout | null = null;
  private collectionRunning = false;

  constructor(private readonly prisma: PrismaService, private readonly zabbixService: ZabbixService) {}

  onModuleInit() {
    this.collectionTimer = setInterval(() => {
      this.runScheduledVeeamCollection().catch(() => undefined);
    }, 5 * 60 * 1000);
    setTimeout(() => {
      this.runScheduledVeeamCollection().catch(() => undefined);
    }, 15 * 1000);
  }

  onModuleDestroy() {
    if (this.collectionTimer) clearInterval(this.collectionTimer);
    this.collectionTimer = null;
  }

  private logVeeamDebug(_message: string, _data: Record<string, any>) {}

  private toNumberOrNull(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
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

  private buildPayloadHash(payload: Record<string, any>) {
    return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  }

  private buildDefaultBackupCollectionConfig() {
    const now = new Date();
    return {
      id: 'in-memory-global',
      scope: 'global',
      enabled: true,
      intervalHours: 12,
      retentionDays: 30,
      allowManualRun: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastTriggerType: null,
      lastError: 'Schema de coleta ainda nao aplicado no banco local.',
      createdAt: now,
      updatedAt: now,
    };
  }

  private isUsingInMemoryCollectionConfig(config: { id?: string | null }) {
    return config?.id === 'in-memory-global';
  }

  private isMissingVeeamCollectionStorageError(error: any) {
    const text = String(error?.message || '');
    return (
      error?.code === 'P2021' &&
      (text.includes('BackupVeeamSnapshotRaw') || text.includes('BackupCollectionConfig'))
    );
  }

  private async getOrCreateBackupCollectionConfig() {
    try {
      const existing = await this.prisma.backupCollectionConfig.findUnique({ where: { scope: 'global' } });
      if (existing) return existing;
      return this.prisma.backupCollectionConfig.create({
        data: {
          scope: 'global',
          enabled: true,
          intervalHours: 12,
          retentionDays: 30,
          allowManualRun: true,
        },
      });
    } catch (error: any) {
      if (this.isMissingVeeamCollectionStorageError(error)) {
        return this.buildDefaultBackupCollectionConfig();
      }
      throw error;
    }
  }

  private async getStoredVeeamMetricsSnapshot(input: {
    companyId: string;
    hostId: string;
    itemId: string;
    date?: string;
    validatedItem: VeeamValidatedItem;
  }): Promise<VeeamMetricsSnapshotResult | null> {
    const requestedDate = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
    let storedRows: Array<{
      itemId: string;
      sourceClock: number;
      payloadJson: unknown;
      createdAt: Date;
    }> = [];
    try {
      storedRows = await this.prisma.backupVeeamSnapshotRaw.findMany({
        where: {
          companyId: input.companyId,
          zabbixHostId: input.hostId,
          itemId: input.itemId,
        },
        orderBy: [{ sourceClock: 'desc' }, { createdAt: 'desc' }],
        take: requestedDate ? 180 : 1,
      });
    } catch (error: any) {
      if (this.isMissingVeeamCollectionStorageError(error)) {
        return null;
      }
      throw error;
    }
    const selectedRow = requestedDate
      ? storedRows.find((row) => this.getSaoPauloDateFromUnixSeconds(Number(row.sourceClock || 0)) <= requestedDate)
      : storedRows[0];
    if (!selectedRow) return null;
    return {
      ok: true,
      data: {
        validatedItem: input.validatedItem,
        latest: {
          itemId: selectedRow.itemId,
          clock: selectedRow.sourceClock,
          ns: 0,
          value: JSON.stringify(selectedRow.payloadJson || {}),
        },
        metricsJson: (selectedRow.payloadJson || {}) as Record<string, any>,
      },
    };
  }

  async getVeeamCollectionConfig() {
    const config = await this.getOrCreateBackupCollectionConfig();
    return { ok: true, data: config };
  }

  async updateVeeamCollectionConfig(input: {
    enabled?: boolean;
    intervalHours?: number;
    retentionDays?: number;
    allowManualRun?: boolean;
  }) {
    const next: any = {};
    if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
    if (typeof input.allowManualRun === 'boolean') next.allowManualRun = input.allowManualRun;
    if (input.intervalHours != null) {
      const intervalHours = Number(input.intervalHours);
      if (!Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 720) {
        return { ok: false, error: 'intervalHours deve estar entre 1 e 720.' };
      }
      next.intervalHours = Math.round(intervalHours);
    }
    if (input.retentionDays != null) {
      const retentionDays = Number(input.retentionDays);
      if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
        return { ok: false, error: 'retentionDays deve estar entre 1 e 3650.' };
      }
      next.retentionDays = Math.round(retentionDays);
    }
    const current = await this.getOrCreateBackupCollectionConfig();
    if (this.isUsingInMemoryCollectionConfig(current)) {
      return { ok: false, error: 'Schema da coleta automatica ainda nao foi aplicado no banco.' };
    }
    const saved = await this.prisma.backupCollectionConfig.update({
      where: { scope: current.scope },
      data: next,
    });
    return { ok: true, data: saved };
  }

  async listVeeamCollectionHistory(input: {
    companyIds?: string[];
    companyId?: string;
    hostId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(Number(input.limit || 50), 1), 200);
    const where: any = {};
    if (input.companyId) {
      where.companyId = input.companyId;
    } else if (Array.isArray(input.companyIds) && input.companyIds.length > 0) {
      where.companyId = { in: input.companyIds };
    }
    if (input.hostId) where.zabbixHostId = input.hostId;
    let rows: any[] = [];
    try {
      rows = await this.prisma.backupVeeamSnapshotRaw.findMany({
        where,
        orderBy: [{ sourceClock: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          companyId: true,
          zabbixHostId: true,
          zabbixHostName: true,
          itemId: true,
          itemName: true,
          sourceClock: true,
          triggerType: true,
          payloadHash: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
              fantasyName: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (this.isMissingVeeamCollectionStorageError(error)) {
        return { ok: true, data: [] };
      }
      throw error;
    }
    return { ok: true, data: rows };
  }

  private async purgeOldVeeamSnapshots(retentionDays: number) {
    const safeRetentionDays = Math.max(1, Math.min(Math.round(retentionDays || 30), 3650));
    const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);
    let deleted;
    try {
      deleted = await this.prisma.backupVeeamSnapshotRaw.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      });
    } catch (error: any) {
      if (this.isMissingVeeamCollectionStorageError(error)) {
        return 0;
      }
      throw error;
    }
    return deleted.count;
  }

  async runVeeamCollection(input: {
    triggerType: 'manual' | 'scheduled';
    companyId?: string;
    hostId?: string;
  }) {
    const config = await this.getOrCreateBackupCollectionConfig();
    if (input.triggerType === 'manual' && !config.allowManualRun) {
      return { ok: false, error: 'Coleta manual desabilitada na configuração atual.' };
    }
    if (input.triggerType === 'scheduled' && !config.enabled) {
      return { ok: true, data: { skipped: true, reason: 'disabled' } };
    }
    if (this.isUsingInMemoryCollectionConfig(config)) {
      return {
        ok: input.triggerType === 'scheduled',
        ...(input.triggerType === 'scheduled'
          ? { data: { skipped: true, reason: 'storage-unavailable' } }
          : { error: 'Schema da coleta automatica ainda nao foi aplicado no banco.' }),
      };
    }
    if (this.collectionRunning) {
      return { ok: false, error: 'Já existe uma coleta Veeam em execução.' };
    }

    this.collectionRunning = true;
    const startedAt = new Date();
    await this.prisma.backupCollectionConfig.update({
      where: { scope: config.scope },
      data: {
        lastRunAt: startedAt,
        lastTriggerType: input.triggerType,
        lastError: null,
      },
    });

    let hostsConsidered = 0;
    let snapshotsCreated = 0;
    let snapshotsUpdated = 0;
    let snapshotsUnchanged = 0;
    const errors: Array<{ companyId: string; hostId?: string; message: string }> = [];
    let debugCurrentHostId: string | null = null;

    try {
      const companies = input.companyId
        ? await this.prisma.company.findMany({
            where: { id: input.companyId, status: 'ACTIVE' },
            select: { id: true, name: true, fantasyName: true },
          })
        : await this.prisma.company.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, fantasyName: true },
          });

      for (const company of companies) {
        debugCurrentHostId = null;
        try {
          const zabbixConfig = await this.zabbixService.getConfig(company.id);
          if (!zabbixConfig) {
            continue;
          }
          const hostsResult = await this.zabbixService.listHostsWithItem(company.id, 'veeam.get.metrics');
          if (!hostsResult.ok) {
            errors.push({ companyId: company.id, message: hostsResult.error || 'Falha ao listar hosts Veeam.' });
            continue;
          }
          const hosts = (Array.isArray(hostsResult.data) ? hostsResult.data : []).filter((host: any) =>
            input.hostId ? host.hostId === input.hostId : true,
          );
          for (const host of hosts) {
            debugCurrentHostId = host.hostId;
            hostsConsidered += 1;
            const historyResult = await this.zabbixService.getItemTextHistory(company.id, host.itemId);
            if (!historyResult.ok) {
              errors.push({
                companyId: company.id,
                hostId: host.hostId,
                message: historyResult.error || 'Falha ao consultar histórico do item.',
              });
              continue;
            }
            const latest = Array.isArray(historyResult.data) ? historyResult.data[0] : null;
            if (!latest?.value || !latest?.clock) {
              errors.push({
                companyId: company.id,
                hostId: host.hostId,
                message: 'Item veeam.get.metrics sem histórico disponível.',
              });
              continue;
            }
            let payloadJson: Record<string, any>;
            try {
              payloadJson = JSON.parse(String(latest.value || '{}'));
            } catch {
              errors.push({
                companyId: company.id,
                hostId: host.hostId,
                message: 'JSON inválido no histórico do item veeam.get.metrics.',
              });
              continue;
            }
            const payloadHash = this.buildPayloadHash(payloadJson);
            const existing = await this.prisma.backupVeeamSnapshotRaw.findUnique({
              where: {
                companyId_zabbixHostId_itemId_sourceClock: {
                  companyId: company.id,
                  zabbixHostId: host.hostId,
                  itemId: host.itemId,
                  sourceClock: Number(latest.clock),
                },
              },
            });
            if (!existing) {
              await this.prisma.backupVeeamSnapshotRaw.create({
                data: {
                  companyId: company.id,
                  zabbixHostId: host.hostId,
                  zabbixHostName: host.name || host.host || null,
                  itemId: host.itemId,
                  itemName: 'veeam.get.metrics',
                  sourceClock: Number(latest.clock),
                  triggerType: input.triggerType,
                  payloadHash,
                  payloadJson,
                },
              });
              snapshotsCreated += 1;
            } else if (existing.payloadHash !== payloadHash) {
              await this.prisma.backupVeeamSnapshotRaw.update({
                where: { id: existing.id },
                data: {
                  zabbixHostName: host.name || host.host || existing.zabbixHostName,
                  triggerType: input.triggerType,
                  payloadHash,
                  payloadJson,
                },
              });
              snapshotsUpdated += 1;
            } else {
              snapshotsUnchanged += 1;
            }
          }
        } catch (companyError: any) {
          errors.push({
            companyId: company.id,
            hostId: debugCurrentHostId || undefined,
            message: companyError?.message || 'Falha ao processar a coleta desta empresa.',
          });
        }
      }

      const deletedSnapshots = await this.purgeOldVeeamSnapshots(config.retentionDays);
      const finishedAt = new Date();
      await this.prisma.backupCollectionConfig.update({
        where: { scope: config.scope },
        data: {
          lastSuccessAt: finishedAt,
          lastError: errors.length > 0 ? `${errors.length} ocorrência(s) com falha parcial.` : null,
        },
      });
      return {
        ok: true,
        data: {
          triggerType: input.triggerType,
          startedAt,
          finishedAt,
          hostsConsidered,
          snapshotsCreated,
          snapshotsUpdated,
          snapshotsUnchanged,
          deletedSnapshots,
          errors,
        },
      };
    } catch (error: any) {
      await this.prisma.backupCollectionConfig.update({
        where: { scope: config.scope },
        data: {
          lastError: error?.message || String(error || 'Falha na coleta Veeam.'),
        },
      });
      return {
        ok: false,
        error: error?.message || 'Falha na coleta Veeam.',
      };
    } finally {
      this.collectionRunning = false;
    }
  }

  private async runScheduledVeeamCollection() {
    const config = await this.getOrCreateBackupCollectionConfig();
    if (!config.enabled || this.collectionRunning) return;
    const reference = config.lastSuccessAt || config.lastRunAt || config.updatedAt || config.createdAt;
    const intervalMs = Math.max(1, config.intervalHours) * 60 * 60 * 1000;
    if (reference && Date.now() - new Date(reference).getTime() < intervalMs) return;
    await this.runVeeamCollection({ triggerType: 'scheduled' });
  }

  private isMissingRepositoryPlanningOverrideTableError(error: any) {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '').toLowerCase();
    const targetNames = ['backuprepositoryoverride', 'backuprepositoryjoboverride'];
    return (
      code === 'P2021' ||
      code === 'P2022' ||
      targetNames.some((name) => message.includes(name)) ||
      (message.includes('table') && targetNames.some((name) => message.includes(name.toLowerCase())))
    );
  }

  private async getVeeamMetricsSnapshot(input: {
    companyId: string;
    hostId: string;
    itemId?: string;
    date?: string;
    itemKey?: string;
  }): Promise<VeeamMetricsSnapshotResult> {
    const itemKey = String(input.itemKey || 'veeam.get.metrics');
    if (input.itemId) {
      const storedSnapshot = await this.getStoredVeeamMetricsSnapshot({
        companyId: input.companyId,
        hostId: input.hostId,
        itemId: input.itemId,
        date: input.date,
        validatedItem: {
          itemId: input.itemId,
          hostId: input.hostId,
          key: itemKey,
          name: itemKey,
          status: '0',
          state: '0',
          error: '',
          valueType: 4,
        },
      });
      if (storedSnapshot?.ok) {
        return storedSnapshot;
      }
    }
    let validatedItem;
    try {
      validatedItem = await this.zabbixService.getValidatedItem(input.companyId, {
        hostId: input.hostId,
        itemId: input.itemId,
        itemKey,
      });
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || `Falha ao validar item ${itemKey} no Zabbix.`,
      };
    }
    if (!validatedItem.ok || !validatedItem.data) {
      return { ok: false, error: validatedItem.error || `Falha ao validar item ${itemKey} no Zabbix.` };
    }

    const storedSnapshot = await this.getStoredVeeamMetricsSnapshot({
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: validatedItem.data.itemId,
      date: input.date,
      validatedItem: validatedItem.data,
    });
    if (storedSnapshot?.ok) {
      return storedSnapshot;
    }

    let history;
    try {
      history = await this.zabbixService.getItemTextHistory(input.companyId, validatedItem.data.itemId);
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || `Falha ao consultar histórico do item ${itemKey}.`,
      };
    }
    if (!history.ok) {
      return { ok: false, error: history.error || `Falha ao consultar histórico do item ${itemKey}.` };
    }
    const historyRows = Array.isArray(history.data) ? history.data : [];
    if (historyRows.length === 0) {
      return {
        ok: false,
        error:
          `Item ${itemKey} encontrado, mas sem histórico disponível. Execute a coleta no Zabbix ou verifique a retenção de histórico do item.`,
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
        error: `Nao foi encontrado historico do item ${itemKey} para a data ${requestedDate} nem para datas anteriores.`,
      };
    }
    let metricsJson: Record<string, any>;
    try {
      metricsJson = JSON.parse(String(selectedHistoryRow.value || '{}'));
    } catch {
      return { ok: false, error: `Histórico encontrado, mas o JSON do item ${itemKey} é inválido.` };
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

  private mergeVeeamMetricsJson(primary: Record<string, any>, secondary?: Record<string, any> | null) {
    if (!secondary || typeof secondary !== 'object') return primary;
    const merged = { ...(primary || {}) } as Record<string, any>;
    for (const key of ['jobs_states', 'jobs_states_from_sessions', 'sessions']) {
      const primaryRows = Array.isArray(primary?.[key]?.data) ? primary[key].data : [];
      const secondaryRows = Array.isArray(secondary?.[key]?.data) ? secondary[key].data : [];
      if (primaryRows.length === 0 && secondaryRows.length === 0) continue;
      merged[key] = {
        ...(primary?.[key] || secondary?.[key] || {}),
        data: [...primaryRows, ...secondaryRows],
      };
    }
    return merged;
  }

  private async getMergedVeeamMetricsSnapshot(input: {
    companyId: string;
    hostId: string;
    itemId?: string;
    date?: string;
  }) {
    const primarySnapshot = await this.getVeeamMetricsSnapshot(input);
    if (!primarySnapshot.ok) return primarySnapshot;

    const agentSnapshot = await this.getVeeamMetricsSnapshot({
      companyId: input.companyId,
      hostId: input.hostId,
      date: input.date,
      itemKey: 'veeam.agent.get.metrics',
    });

    return {
      ok: true as const,
      data: {
        ...primarySnapshot.data,
        metricsJson: this.mergeVeeamMetricsJson(
          primarySnapshot.data.metricsJson,
          agentSnapshot.ok ? agentSnapshot.data.metricsJson : null,
        ),
        agentItemId: agentSnapshot.ok ? agentSnapshot.data.validatedItem.itemId : null,
        agentHistoryClock: agentSnapshot.ok ? agentSnapshot.data.latest.clock : null,
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
    fullWeeklyExecutionMinutes?: number | null;
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
    const fullWeeklyExecutionMinutes = body.fullWeeklyExecutionMinutes ?? null;
    const dailyChangePercent = body.dailyChangePercent ?? null;
    const currentRetentionDays = body.currentRetentionDays ?? null;
    const retentionDays = body.retentionDays ?? null;
    const dailyFrequency = body.dailyFrequency ?? null;
    const safetyMarginPercent = body.safetyMarginPercent ?? null;
    const backupMode = String(body.backupMode || '').trim();

    if (protectedSizeGB != null && protectedSizeGB <= 0) errors.push('protectedSizeGB deve ser maior que 0.');
    if (fullBackupSizeGB != null && fullBackupSizeGB <= 0) errors.push('fullBackupSizeGB deve ser maior que 0.');
    if (fullWeeklyExecutionMinutes != null && fullWeeklyExecutionMinutes <= 0) {
      errors.push('fullWeeklyExecutionMinutes deve ser maior que 0.');
    }
    if (dailyChangePercent != null && dailyChangePercent < 0) errors.push('dailyChangePercent deve ser maior ou igual a 0.');
    if (currentRetentionDays != null && currentRetentionDays < 1) errors.push('currentRetentionDays deve ser maior ou igual a 1.');
    if (retentionDays != null && retentionDays < 1) errors.push('retentionDays deve ser maior ou igual a 1.');
    if (dailyFrequency != null && dailyFrequency < 1) errors.push('dailyFrequency deve ser maior ou igual a 1.');
    if (safetyMarginPercent != null && safetyMarginPercent < 0) errors.push('safetyMarginPercent deve ser maior ou igual a 0.');
    if (backupMode && !['Incremental', 'Synthetic Full', 'Active Full'].includes(backupMode)) {
      errors.push('backupMode deve ser Incremental, Synthetic Full ou Active Full.');
    }
    if (backupMode && backupMode !== 'Incremental' && fullWeeklyExecutionMinutes == null) {
      errors.push('fullWeeklyExecutionMinutes é obrigatório para Synthetic Full e Active Full.');
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
    // #region debug-point D:veeam-repositories-entry
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backup.service.ts:getVeeamRepositories:entry',msg:'[DEBUG] Veeam repositories request received',data:{companyId:input.companyId,hostId:input.hostId,itemId:input.itemId||null,date:input.date||null},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    const snapshot = await this.getMergedVeeamMetricsSnapshot(input);
    this.logVeeamDebug('Resultado do item.get para repositórios', {
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId || null,
      date: input.date || null,
      itemFound: !!snapshot.ok,
      itemData: snapshot.ok ? snapshot.data.validatedItem : null,
    });
    // #region debug-point C:veeam-repositories-snapshot
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'backup.service.ts:getVeeamRepositories:snapshot',msg:'[DEBUG] Snapshot result for repositories',data:{ok:snapshot.ok,error:('error' in snapshot?snapshot.error:null),itemId:snapshot.ok?snapshot.data.validatedItem.itemId:null,historyClock:snapshot.ok?snapshot.data.latest.clock:null},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    if (!snapshot.ok) return snapshot;

    const { validatedItem, latest, metricsJson: mergedMetricsJson } = snapshot.data;
    const repositoriesStates = Array.isArray(mergedMetricsJson?.repositories_states?.data) ? mergedMetricsJson.repositories_states.data : [];
    const jobsStates = Array.isArray(mergedMetricsJson?.jobs_states?.data) ? mergedMetricsJson.jobs_states.data : [];
    // #region debug-point B:veeam-repositories-payload-shape
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'backup.service.ts:getVeeamRepositories:payload',msg:'[DEBUG] Repository payload shape inspected',data:{repositoriesStates:Array.isArray(repositoriesStates)?repositoriesStates.length:-1,jobsStates:Array.isArray(jobsStates)?jobsStates.length:-1,hasRepositoriesStates:Array.isArray(mergedMetricsJson?.repositories_states?.data),hasJobsStates:Array.isArray(mergedMetricsJson?.jobs_states?.data)},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    let repositoryOverrides: any[] = [];
    let jobOverrides: any[] = [];
    try {
      repositoryOverrides = await this.prisma.backupRepositoryOverride.findMany({
        where: { companyId: input.companyId, zabbixHostId: input.hostId },
        orderBy: { repositoryName: 'asc' },
      });
      jobOverrides = await this.prisma.backupRepositoryJobOverride.findMany({
        where: { companyId: input.companyId, zabbixHostId: input.hostId },
        orderBy: [{ repositoryId: 'asc' }, { jobName: 'asc' }],
      });
      // #region debug-point A:veeam-repositories-overrides-ok
      (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'backup.service.ts:getVeeamRepositories:overrides-ok',msg:'[DEBUG] Override tables queried successfully',data:{repositoryOverrides:repositoryOverrides.length,jobOverrides:jobOverrides.length},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
    } catch (error: any) {
      // #region debug-point A:veeam-repositories-overrides-error
      (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'backup.service.ts:getVeeamRepositories:overrides-error',msg:'[DEBUG] Override table query failed',data:{name:error?.name||null,message:error?.message||String(error||''),code:error?.code||null,meta:error?.meta||null},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      if (this.isMissingRepositoryPlanningOverrideTableError(error)) {
        // #region debug-point A:veeam-repositories-overrides-fallback
        (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'backup.service.ts:getVeeamRepositories:overrides-fallback',msg:'[DEBUG] Missing override tables detected, continuing without overrides',data:{code:error?.code||null},ts:Date.now()})}).catch(()=>{})})();
        // #endregion
        repositoryOverrides = [];
        jobOverrides = [];
      } else {
      throw error;
      }
    }

    const planning = buildVeeamRepositoryPlanning({
      metricsJson: mergedMetricsJson,
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
        fullWeeklyExecutionMinutes: row.fullWeeklyExecutionMinutes,
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
    // #region debug-point H:veeam-repositories-association-summary
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'backup.service.ts:getVeeamRepositories:association-summary',msg:'[DEBUG] Repository association summary',data:{rows:(planning.rows||[]).map((row:any)=>({repositoryId:row.repositoryId,name:row.name,source:row.source,jobsCount:row.jobsCount,jobs:(row.jobs||[]).slice(0,5).map((job:any)=>({jobId:job.jobId,name:job.name,repositoryName:job.repositoryName||null}))})).slice(0,10)},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    // #region debug-point E:veeam-repositories-success
    (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'E',location:'backup.service.ts:getVeeamRepositories:success',msg:'[DEBUG] Repository planning built successfully',data:{rows:planning.rows.length,repositoriesInferred:planning.meta.repositoriesInferred,incompleteRepositories:planning.meta.repositoriesIncomplete},ts:Date.now()})}).catch(()=>{})})();
    // #endregion

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
    fullWeeklyExecutionMinutes?: number | null;
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
      fullWeeklyExecutionMinutes: this.toNumberOrNull(input.fullWeeklyExecutionMinutes),
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
        fullWeeklyExecutionMinutes: payload.fullWeeklyExecutionMinutes,
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
        fullWeeklyExecutionMinutes: payload.fullWeeklyExecutionMinutes,
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
    const snapshot = await this.getMergedVeeamMetricsSnapshot({
      companyId: input.companyId,
      hostId: input.hostId,
      itemId: input.itemId,
      date: input.date,
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
      return { ok: false, error: 'JSON combinado dos itens Veeam não possui sessions.data.' };
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
