import { extractVeeamSessions, normalizeVeeamType } from './veeam-timeline';

type RawMetricsJson = Record<string, any>;
type BackupMode = 'Incremental' | 'Synthetic Full' | 'Active Full';

type RawRepositoryOverride = {
  repositoryId: string;
  repositoryName: string;
  repositoryType?: string | null;
  capacityGB?: number | null;
  usedSpaceGB?: number | null;
  freeGB?: number | null;
  notes?: string | null;
  useManualForPlanning?: boolean | null;
  updatedBy?: string | null;
  updatedAt?: Date | string | null;
};

type RawJobOverride = {
  repositoryId: string;
  jobId: string;
  jobName?: string | null;
  protectedSizeGB?: number | null;
  fullBackupSizeGB?: number | null;
  dailyChangePercent?: number | null;
  currentRetentionDays?: number | null;
  retentionDays?: number | null;
  dailyFrequency?: number | null;
  backupMode?: string | null;
  safetyMarginPercent?: number | null;
  notes?: string | null;
  useManualForPlanning?: boolean | null;
  updatedBy?: string | null;
  updatedAt?: Date | string | null;
};

type RepositoryNumbers = {
  capacityGB: number | null;
  usedSpaceGB: number | null;
  freeGB: number | null;
  usagePercent: number | null;
};

type SessionFrequencyAccumulator = {
  countsByDay: Record<string, number>;
};

type SessionFrequencyStats = {
  latestDate: string | null;
  latestCount: number | null;
};

type SessionDurationAccumulator = {
  totalMinutes: number;
  samples: number;
  latestEndedAt: number | null;
  latestMinutes: number | null;
};

type SessionDurationStats = {
  averageMinutes: number | null;
  latestMinutes: number | null;
  samples: number;
};

type SessionTypeMaps = {
  byJobId: Map<string, 'Backup' | 'Replica'>;
  byJobName: Map<string, 'Backup' | 'Replica'>;
};

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round2(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function normalizeRepositoryName(value: unknown) {
  return String(value || '').trim();
}

function normalizeJobKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function slugifyName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function resolveRepositoryKey(repositoryId: unknown, repositoryName: unknown) {
  const id = String(repositoryId || '').trim();
  if (id) return id;
  const name = normalizeRepositoryName(repositoryName);
  if (!name) return '';
  return `name__${slugifyName(name) || 'sem-nome'}`;
}

export function resolvePlanningJobKey(jobId: unknown, jobName: unknown) {
  const id = String(jobId || '').trim();
  if (id) return id;
  const name = normalizeRepositoryName(jobName);
  if (!name) return '';
  return `name__${slugifyName(name) || 'sem-nome'}`;
}

function normalizeBackupMode(value: unknown): BackupMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'synthetic full' || normalized === 'synthetic_full' || normalized === 'synthetic-full') {
    return 'Synthetic Full';
  }
  if (normalized === 'active full' || normalized === 'active_full' || normalized === 'active-full') {
    return 'Active Full';
  }
  return 'Incremental';
}

function normalizeRepositoryNumbers(input: {
  capacityGB?: unknown;
  usedSpaceGB?: unknown;
  freeGB?: unknown;
}): RepositoryNumbers {
  let capacityGB = toFiniteNumber(input.capacityGB);
  let usedSpaceGB = toFiniteNumber(input.usedSpaceGB);
  let freeGB = toFiniteNumber(input.freeGB);

  if (capacityGB != null && usedSpaceGB != null && freeGB == null) {
    freeGB = capacityGB - usedSpaceGB;
  }
  if (capacityGB != null && freeGB != null && usedSpaceGB == null) {
    usedSpaceGB = capacityGB - freeGB;
  }
  if (usedSpaceGB != null && usedSpaceGB < 0) usedSpaceGB = 0;
  if (freeGB != null && freeGB < 0) freeGB = 0;

  let usagePercent: number | null = null;
  if (capacityGB != null && capacityGB > 0 && usedSpaceGB != null) {
    usagePercent = (usedSpaceGB / capacityGB) * 100;
  }

  return {
    capacityGB: round2(capacityGB),
    usedSpaceGB: round2(usedSpaceGB),
    freeGB: round2(freeGB),
    usagePercent: round2(usagePercent),
  };
}

function hasCompleteStorage(numbers: RepositoryNumbers) {
  return numbers.capacityGB != null && numbers.capacityGB > 0 && numbers.usedSpaceGB != null && numbers.freeGB != null;
}

function buildRepositoryStatus(numbers: RepositoryNumbers) {
  if (!hasCompleteStorage(numbers) || numbers.usagePercent == null) return 'Dados incompletos';
  if (numbers.usagePercent >= 90) return 'Crítico';
  if (numbers.usagePercent >= 75) return 'Atenção';
  return 'OK';
}

function buildRecommendation(input: {
  capacityGB: number | null;
  estimatedRequiredWithMarginGB: number | null;
  balanceGB: number | null;
  complete: boolean;
}) {
  if (!input.complete) return 'Dados incompletos. Preencha os valores manuais para simular.';
  if (input.balanceGB == null || input.capacityGB == null || input.estimatedRequiredWithMarginGB == null) {
    return 'Dados incompletos. Preencha os valores manuais para simular.';
  }
  if (input.balanceGB < 0) {
    return `Repositório insuficiente. Déficit estimado de ${Math.abs(round2(input.balanceGB) || 0)} GB.`;
  }
  const occupancy = input.estimatedRequiredWithMarginGB / input.capacityGB;
  if (occupancy >= 0.85) {
    return 'Repositório próximo do limite. Recomenda-se aumentar a capacidade ou reduzir retenção.';
  }
  return 'Repositório suficiente para a retenção desejada.';
}

function parseIsoDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractSessionDateKey(value: unknown) {
  const text = String(value || '').trim();
  const inlineDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (inlineDate?.[1]) return inlineDate[1];
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function updateSessionFrequencyMap(map: Map<string, SessionFrequencyAccumulator>, key: string, dateKey: string) {
  if (!key || !dateKey) return;
  const current = map.get(key) || { countsByDay: {} };
  current.countsByDay[dateKey] = (current.countsByDay[dateKey] || 0) + 1;
  map.set(key, current);
}

function finalizeSessionStats(input?: SessionFrequencyAccumulator | null): SessionFrequencyStats {
  const dayKeys = Object.keys(input?.countsByDay || {}).sort();
  if (dayKeys.length === 0) {
    return {
      latestDate: null,
      latestCount: null,
    };
  }
  const latestDate = dayKeys[dayKeys.length - 1];
  return {
    latestDate,
    latestCount: input?.countsByDay?.[latestDate] ?? null,
  };
}

function parseSessionDurationMinutes(raw: any) {
  const start = parseIsoDate(raw?.creationTime);
  const end = parseIsoDate(raw?.endTime);
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / 60000;
}

function updateSessionDurationMap(map: Map<string, SessionDurationAccumulator>, key: string, durationMinutes: number, endedAtIso: string) {
  if (!key || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
  const endedAtMs = new Date(endedAtIso).getTime();
  const current = map.get(key) || {
    totalMinutes: 0,
    samples: 0,
    latestEndedAt: null,
    latestMinutes: null,
  };
  current.totalMinutes += durationMinutes;
  current.samples += 1;
  if (current.latestEndedAt == null || endedAtMs > current.latestEndedAt) {
    current.latestEndedAt = endedAtMs;
    current.latestMinutes = durationMinutes;
  }
  map.set(key, current);
}

function finalizeSessionDurationStats(input?: SessionDurationAccumulator | null): SessionDurationStats {
  if (!input || input.samples === 0) {
    return {
      averageMinutes: null,
      latestMinutes: null,
      samples: 0,
    };
  }
  return {
    averageMinutes: round2(input.totalMinutes / input.samples),
    latestMinutes: round2(input.latestMinutes),
    samples: input.samples,
  };
}

function buildSessionFrequencyMaps(metricsJson: RawMetricsJson) {
  const byJobId = new Map<string, SessionFrequencyAccumulator>();
  const byJobName = new Map<string, SessionFrequencyAccumulator>();
  for (const raw of extractVeeamSessions(metricsJson)) {
    if (!normalizeVeeamType(raw?.sessionType)) continue;
    const dateKey = extractSessionDateKey(raw?.creationTime);
    if (!dateKey) continue;
    const jobIdKey = String(raw?.jobId || '').trim();
    const jobNameKey = normalizeJobKey(raw?.name);
    if (jobIdKey) updateSessionFrequencyMap(byJobId, jobIdKey, dateKey);
    if (jobNameKey) updateSessionFrequencyMap(byJobName, jobNameKey, dateKey);
  }
  return { byJobId, byJobName };
}

function buildSessionDurationMaps(metricsJson: RawMetricsJson) {
  const byJobId = new Map<string, SessionDurationAccumulator>();
  const byJobName = new Map<string, SessionDurationAccumulator>();
  for (const raw of extractVeeamSessions(metricsJson)) {
    if (!normalizeVeeamType(raw?.sessionType)) continue;
    const durationMinutes = parseSessionDurationMinutes(raw);
    const endedAtIso = parseIsoDate(raw?.endTime);
    if (durationMinutes == null || !endedAtIso) continue;
    const jobIdKey = String(raw?.jobId || '').trim();
    const jobNameKey = normalizeJobKey(raw?.name);
    if (jobIdKey) updateSessionDurationMap(byJobId, jobIdKey, durationMinutes, endedAtIso);
    if (jobNameKey) updateSessionDurationMap(byJobName, jobNameKey, durationMinutes, endedAtIso);
  }
  return { byJobId, byJobName };
}

function buildSessionTypeMaps(metricsJson: RawMetricsJson): SessionTypeMaps {
  const byJobId = new Map<string, 'Backup' | 'Replica'>();
  const byJobName = new Map<string, 'Backup' | 'Replica'>();
  for (const raw of extractVeeamSessions(metricsJson)) {
    const normalizedType = normalizeVeeamType(raw?.sessionType);
    if (!normalizedType) continue;
    const jobIdKey = String(raw?.jobId || '').trim();
    const jobNameKey = normalizeJobKey(raw?.name);
    if (jobIdKey && !byJobId.has(jobIdKey)) byJobId.set(jobIdKey, normalizedType);
    if (jobNameKey && !byJobName.has(jobNameKey)) byJobName.set(jobNameKey, normalizedType);
  }
  return { byJobId, byJobName };
}

function normalizePlanningJobType(value: unknown) {
  return normalizeVeeamType(String(value || '').trim());
}

function estimateRequiredStorage(input: {
  backupMode: BackupMode;
  currentTotalBackupSizeGB: number | null;
  fullBackupSizeGB: number | null;
  currentRetentionDays: number;
  retentionDays: number;
  baseDailyFrequency: number;
  targetDailyFrequency: number;
  growthPercent: number;
}) {
  if (input.currentTotalBackupSizeGB == null || input.fullBackupSizeGB == null) {
    return {
      weeklyFullCopies: null,
      incrementalDailyGB: null,
      estimatedFullsGB: null,
      estimatedIncrementalsGB: null,
      estimatedRequiredGB: null,
    };
  }
  const effectiveFullBackupSizeRaw = Math.min(input.fullBackupSizeGB, input.currentTotalBackupSizeGB);
  const currentIncrementalPoolRaw = Math.max(input.currentTotalBackupSizeGB - effectiveFullBackupSizeRaw, 0);
  const effectiveFullBackupSizeGB = round2(effectiveFullBackupSizeRaw);
  const currentIncrementalPoolGB = round2(currentIncrementalPoolRaw);
  const incrementalDailyGB =
    input.currentRetentionDays > 0 ? round2(currentIncrementalPoolRaw / input.currentRetentionDays) : null;
  const frequencyFactor =
    input.baseDailyFrequency > 0 ? input.targetDailyFrequency / input.baseDailyFrequency : 1;
  const weeklyFullCopies =
    input.backupMode === 'Incremental'
      ? 1
      : 1 + Math.max(1, Math.ceil(input.retentionDays / 7));
  const estimatedFullsGB = round2(effectiveFullBackupSizeRaw * weeklyFullCopies);
  const estimatedIncrementalsGB =
    incrementalDailyGB != null ? round2(incrementalDailyGB * input.retentionDays * frequencyFactor) : null;
  const estimatedRequiredGB =
    estimatedFullsGB != null && estimatedIncrementalsGB != null
      ? round2((estimatedFullsGB + estimatedIncrementalsGB) * (1 + input.growthPercent / 100))
      : null;
  return {
    weeklyFullCopies,
    incrementalDailyGB,
    estimatedFullsGB,
    estimatedIncrementalsGB,
    estimatedRequiredGB,
  };
}

export function simulateRepositoryRetention(input: {
  repositoryId?: string;
  repositoryName?: string;
  jobId?: string;
  jobName?: string;
  capacityGB?: unknown;
  usedSpaceGB?: unknown;
  freeGB?: unknown;
  protectedSizeGB?: unknown;
  fullBackupSizeGB?: unknown;
  dailyChangePercent?: unknown;
  currentRetentionDays?: unknown;
  retentionDays?: unknown;
  baseDailyFrequency?: unknown;
  dailyFrequency?: unknown;
  backupMode?: unknown;
  safetyMarginPercent?: unknown;
}) {
  const numbers = normalizeRepositoryNumbers({
    capacityGB: input.capacityGB,
    usedSpaceGB: input.usedSpaceGB,
    freeGB: input.freeGB,
  });
  const protectedSizeGB = round2(toFiniteNumber(input.protectedSizeGB));
  const fullBackupSizeGB = round2(toFiniteNumber(input.fullBackupSizeGB));
  const dailyChangePercent = round2(toFiniteNumber(input.dailyChangePercent));
  const currentRetentionDaysRaw = toFiniteNumber(input.currentRetentionDays);
  const currentRetentionDays = currentRetentionDaysRaw != null ? Number(currentRetentionDaysRaw) : null;
  const retentionDays = Number(toFiniteNumber(input.retentionDays) || 0);
  const dailyFrequency = Number(toFiniteNumber(input.dailyFrequency) || 0);
  const baseDailyFrequency = Number(toFiniteNumber(input.baseDailyFrequency) || dailyFrequency || 0);
  const backupMode = normalizeBackupMode(input.backupMode);
  const safetyMarginPercent = round2(toFiniteNumber(input.safetyMarginPercent));
  const errors: string[] = [];

  if (numbers.capacityGB == null || numbers.capacityGB <= 0) errors.push('capacityGB deve ser maior que 0.');
  if (numbers.usedSpaceGB != null && numbers.capacityGB != null && numbers.usedSpaceGB > numbers.capacityGB) {
    errors.push('usedSpaceGB não pode ser maior que capacityGB.');
  }
  if (protectedSizeGB == null || protectedSizeGB <= 0) errors.push('protectedSizeGB deve ser maior que 0.');
  if (fullBackupSizeGB != null && fullBackupSizeGB <= 0) errors.push('fullBackupSizeGB deve ser maior que 0.');
  if (fullBackupSizeGB != null && protectedSizeGB != null && fullBackupSizeGB > protectedSizeGB) {
    errors.push('fullBackupSizeGB não pode ser maior que protectedSizeGB.');
  }
  if (dailyChangePercent == null || dailyChangePercent < 0) errors.push('dailyChangePercent deve ser maior ou igual a 0.');
  if (currentRetentionDays != null && currentRetentionDays < 1) errors.push('currentRetentionDays deve ser maior ou igual a 1.');
  if (retentionDays < 1) errors.push('retentionDays deve ser maior ou igual a 1.');
  if (dailyFrequency < 1) errors.push('dailyFrequency deve ser maior ou igual a 1.');
  if (baseDailyFrequency < 1) errors.push('baseDailyFrequency deve ser maior ou igual a 1.');
  if (safetyMarginPercent == null || safetyMarginPercent < 0) errors.push('safetyMarginPercent deve ser maior ou igual a 0.');

  const complete = errors.length === 0;
  const effectiveFullBackupSizeGB =
    complete && protectedSizeGB != null ? round2(Math.min(fullBackupSizeGB ?? protectedSizeGB, protectedSizeGB)) : null;
  const estimated = complete
    ? estimateRequiredStorage({
        backupMode,
        currentTotalBackupSizeGB: protectedSizeGB,
        fullBackupSizeGB: effectiveFullBackupSizeGB,
        currentRetentionDays: currentRetentionDays ?? retentionDays,
        retentionDays,
        baseDailyFrequency,
        targetDailyFrequency: dailyFrequency,
        growthPercent: dailyChangePercent ?? 0,
      })
    : {
        weeklyFullCopies: null,
        incrementalDailyGB: null,
        estimatedFullsGB: null,
        estimatedIncrementalsGB: null,
        estimatedRequiredGB: null,
      };
  const estimatedRequiredGB = estimated.estimatedRequiredGB;
  const estimatedRequiredWithMarginGB =
    complete && estimatedRequiredGB != null && safetyMarginPercent != null
      ? round2(estimatedRequiredGB * (1 + safetyMarginPercent / 100))
      : null;
  const balanceGB =
    complete && numbers.capacityGB != null && estimatedRequiredWithMarginGB != null
      ? round2(numbers.capacityGB - estimatedRequiredWithMarginGB)
      : null;

  let maxRetentionDays: number | null = null;
  if (complete && numbers.capacityGB != null && effectiveFullBackupSizeGB != null && safetyMarginPercent != null) {
    const capacityWithMargin = numbers.capacityGB;
    for (let days = 1; days <= 3650; days += 1) {
      const trial = estimateRequiredStorage({
        backupMode,
        currentTotalBackupSizeGB: protectedSizeGB,
        fullBackupSizeGB: effectiveFullBackupSizeGB,
        currentRetentionDays: currentRetentionDays ?? retentionDays,
        retentionDays: days,
        baseDailyFrequency,
        targetDailyFrequency: dailyFrequency,
        growthPercent: dailyChangePercent ?? 0,
      });
      const requiredWithMargin =
        trial.estimatedRequiredGB != null
          ? round2(trial.estimatedRequiredGB * (1 + safetyMarginPercent / 100))
          : null;
      if (requiredWithMargin == null || requiredWithMargin > capacityWithMargin) break;
      maxRetentionDays = days;
    }
  }

  return {
    repositoryId: input.repositoryId || '',
    repositoryName: input.repositoryName || '',
    jobId: input.jobId || '',
    jobName: input.jobName || '',
    complete,
    errors,
    inputs: {
      capacityGB: numbers.capacityGB,
      usedSpaceGB: numbers.usedSpaceGB,
      freeGB: numbers.freeGB,
      protectedSizeGB,
      fullBackupSizeGB: effectiveFullBackupSizeGB,
      dailyChangePercent,
      currentRetentionDays,
      retentionDays: retentionDays || null,
      dailyFrequency: dailyFrequency || null,
      baseDailyFrequency: baseDailyFrequency || null,
      backupMode,
      safetyMarginPercent,
    },
    results: {
      currentCapacityGB: numbers.capacityGB,
      currentUsedSpaceGB: numbers.usedSpaceGB,
      currentFreeGB: numbers.freeGB,
      currentRetentionDays,
      incrementalDailyGB: estimated.incrementalDailyGB,
      fullBackupSizeGB: effectiveFullBackupSizeGB,
      estimatedFullsGB: estimated.estimatedFullsGB,
      estimatedIncrementalsGB: estimated.estimatedIncrementalsGB,
      estimatedWeeklyFullCopies: estimated.weeklyFullCopies,
      estimatedRequiredGB,
      estimatedRequiredWithMarginGB,
      balanceGB,
      deficitGB: balanceGB != null && balanceGB < 0 ? Math.abs(balanceGB) : 0,
      maxEstimatedRetentionDays: maxRetentionDays,
      recommendation: buildRecommendation({
        capacityGB: numbers.capacityGB,
        estimatedRequiredWithMarginGB,
        balanceGB,
        complete,
      }),
    },
  };
}

export function buildVeeamRepositoryPlanning(input: {
  metricsJson: RawMetricsJson;
  repositoryOverrides?: RawRepositoryOverride[];
  jobOverrides?: RawJobOverride[];
  collectedAt?: Date | string | number | null;
}) {
  const repositoriesRaw = Array.isArray(input.metricsJson?.repositories_states?.data)
    ? input.metricsJson.repositories_states.data
    : [];
  const jobsRaw = Array.isArray(input.metricsJson?.jobs_states?.data) ? input.metricsJson.jobs_states.data : [];
  const sessionFrequencyMaps = buildSessionFrequencyMaps(input.metricsJson);
  const sessionDurationMaps = buildSessionDurationMaps(input.metricsJson);
  const sessionTypeMaps = buildSessionTypeMaps(input.metricsJson);
  const collectedAtIso =
    input.collectedAt == null
      ? null
      : parseIsoDate(input.collectedAt instanceof Date ? input.collectedAt.toISOString() : new Date(input.collectedAt as any).toISOString());

  const repositoryOverridesById = new Map<string, RawRepositoryOverride>();
  for (const override of input.repositoryOverrides || []) {
    if (!override?.repositoryId) continue;
    repositoryOverridesById.set(String(override.repositoryId), override);
  }

  const jobOverridesByKey = new Map<string, RawJobOverride>();
  for (const override of input.jobOverrides || []) {
    const repositoryId = String(override?.repositoryId || '').trim();
    const jobId = resolvePlanningJobKey(override?.jobId, override?.jobName);
    if (!repositoryId || !jobId) continue;
    jobOverridesByKey.set(`${repositoryId}::${jobId}`, override);
  }

  const repositories = new Map<string, any>();
  const nameToKey = new Map<string, string>();

  for (const raw of repositoriesRaw) {
    const repositoryId = resolveRepositoryKey(raw?.id, raw?.name);
    if (!repositoryId) continue;
    const name = normalizeRepositoryName(raw?.name) || 'Repositório sem nome';
    const automaticNumbers = normalizeRepositoryNumbers({
      capacityGB: raw?.capacityGB,
      usedSpaceGB: raw?.usedSpaceGB,
      freeGB: raw?.freeGB,
    });
    repositories.set(repositoryId, {
      repositoryId,
      name,
      type: String(raw?.type || 'Unknown'),
      description: String(raw?.description || ''),
      path: String(raw?.path || ''),
      source: 'zabbix',
      dataQuality: hasCompleteStorage(automaticNumbers) ? 'automatic' : 'missing_capacity',
      needsManualInput: !hasCompleteStorage(automaticNumbers),
      automatic: {
        ...automaticNumbers,
        updatedAt: collectedAtIso,
      },
      jobs: [],
    });
    nameToKey.set(name.toLowerCase(), repositoryId);
  }

  for (const raw of jobsRaw) {
    const jobId = resolvePlanningJobKey(raw?.id || raw?.jobId, raw?.name);
    const jobName = String(raw?.name || '');
    const jobType =
      normalizePlanningJobType(raw?.type) ||
      normalizePlanningJobType(raw?.jobType) ||
      normalizePlanningJobType(raw?.sessionType) ||
      (jobId && !jobId.startsWith('name__') ? sessionTypeMaps.byJobId.get(jobId) : null) ||
      (normalizeJobKey(jobName) ? sessionTypeMaps.byJobName.get(normalizeJobKey(jobName)) : null) ||
      null;

    if (jobType === 'Replica') {
      continue;
    }

    const repositoryId = resolveRepositoryKey(raw?.repositoryId, raw?.repositoryName);
    const repositoryName = normalizeRepositoryName(raw?.repositoryName) || normalizeRepositoryName(raw?.name) || 'Repositório inferido';
    const matchedKey = repositories.has(repositoryId)
      ? repositoryId
      : nameToKey.get(repositoryName.toLowerCase()) || repositoryId;
    if (!repositories.has(matchedKey)) {
      repositories.set(matchedKey, {
        repositoryId: matchedKey,
        name: repositoryName,
        type: 'Unknown/Cloud',
        description: '',
        path: '',
        source: 'jobs_states',
        dataQuality: 'missing_capacity',
        needsManualInput: true,
        automatic: {
          capacityGB: null,
          usedSpaceGB: null,
          freeGB: null,
          usagePercent: null,
          updatedAt: collectedAtIso,
        },
        jobs: [],
      });
      nameToKey.set(repositoryName.toLowerCase(), matchedKey);
    }

    const repository = repositories.get(matchedKey);
    const sessionStats = finalizeSessionStats(
      (jobId && !jobId.startsWith('name__') ? sessionFrequencyMaps.byJobId.get(jobId) : null) ||
      (normalizeJobKey(jobName) ? sessionFrequencyMaps.byJobName.get(normalizeJobKey(jobName)) : null) ||
      null,
    );
    const durationStats = finalizeSessionDurationStats(
      (jobId && !jobId.startsWith('name__') ? sessionDurationMaps.byJobId.get(jobId) : null) ||
      (normalizeJobKey(jobName) ? sessionDurationMaps.byJobName.get(normalizeJobKey(jobName)) : null) ||
      null,
    );
    repository.jobs.push({
      jobId,
      name: jobName || 'Rotina sem nome',
      repositoryId: String(raw?.repositoryId || matchedKey),
      repositoryName,
      objectsCount: toFiniteNumber(raw?.objectsCount),
      lastResult: String(raw?.lastResult || ''),
      lastRun: parseIsoDate(raw?.lastRun),
      frequency: {
        autoDailyFrequency: sessionStats.latestCount,
        autoDailyFrequencyObservedDate: sessionStats.latestDate,
      },
      runtime: {
        averageExecutionMinutes: durationStats.averageMinutes,
        latestExecutionMinutes: durationStats.latestMinutes,
        samples: durationStats.samples,
      },
    });
  }

  const rows = Array.from(repositories.values()).map((repository) => {
    const repositoryOverride = repositoryOverridesById.get(repository.repositoryId);
    const manualNumbers = normalizeRepositoryNumbers({
      capacityGB: repositoryOverride?.capacityGB,
      usedSpaceGB: repositoryOverride?.usedSpaceGB,
      freeGB: repositoryOverride?.freeGB,
    });

    const manual = {
      capacityGB: manualNumbers.capacityGB,
      usedSpaceGB: manualNumbers.usedSpaceGB,
      freeGB: manualNumbers.freeGB,
      usagePercent: manualNumbers.usagePercent,
      notes: repositoryOverride?.notes || null,
      useManualForPlanning: !!repositoryOverride?.useManualForPlanning,
      updatedBy: repositoryOverride?.updatedBy || null,
      updatedAt: parseIsoDate(repositoryOverride?.updatedAt),
    };

    const automaticComplete = hasCompleteStorage(repository.automatic);
    const manualComplete = hasCompleteStorage(manual);
    let effective = {
      capacityGB: repository.automatic.capacityGB,
      usedSpaceGB: repository.automatic.usedSpaceGB,
      freeGB: repository.automatic.freeGB,
      usagePercent: repository.automatic.usagePercent,
      source: 'zabbix',
    };
    if ((!automaticComplete && manualComplete) || (manual.useManualForPlanning && manualComplete)) {
      effective = {
        capacityGB: manual.capacityGB,
        usedSpaceGB: manual.usedSpaceGB,
        freeGB: manual.freeGB,
        usagePercent: manual.usagePercent,
        source: 'manual',
      };
    } else if (!automaticComplete && !manualComplete) {
      effective = {
        capacityGB: repository.automatic.capacityGB ?? manual.capacityGB,
        usedSpaceGB: repository.automatic.usedSpaceGB ?? manual.usedSpaceGB,
        freeGB: repository.automatic.freeGB ?? manual.freeGB,
        usagePercent: repository.automatic.usagePercent ?? manual.usagePercent,
        source: repository.source === 'jobs_states' ? 'jobs_states' : 'zabbix',
      };
    }

    const jobs = repository.jobs
      .map((job: any) => {
        const jobOverride = jobOverridesByKey.get(`${repository.repositoryId}::${job.jobId}`);
        const effectiveDailyFrequency = jobOverride?.dailyFrequency != null
          ? Number(jobOverride.dailyFrequency)
          : job.frequency.autoDailyFrequency ?? 1;
        const frequencySource =
          jobOverride?.dailyFrequency != null
            ? 'manual'
            : job.frequency.autoDailyFrequency != null
              ? 'automatic'
              : 'default';
        const manualPlanning = {
          protectedSizeGB: round2(toFiniteNumber(jobOverride?.protectedSizeGB)),
          fullBackupSizeGB: round2(toFiniteNumber(jobOverride?.fullBackupSizeGB)),
          dailyChangePercent: round2(toFiniteNumber(jobOverride?.dailyChangePercent)),
          currentRetentionDays: jobOverride?.currentRetentionDays != null ? Number(jobOverride.currentRetentionDays) : null,
          retentionDays: jobOverride?.retentionDays != null ? Number(jobOverride.retentionDays) : null,
          dailyFrequency: jobOverride?.dailyFrequency != null ? Number(jobOverride.dailyFrequency) : null,
          backupMode: normalizeBackupMode(jobOverride?.backupMode),
          safetyMarginPercent: round2(toFiniteNumber(jobOverride?.safetyMarginPercent)),
          notes: jobOverride?.notes || null,
          useManualForPlanning: !!jobOverride?.useManualForPlanning,
          updatedBy: jobOverride?.updatedBy || null,
          updatedAt: parseIsoDate(jobOverride?.updatedAt),
        };
        return {
          ...job,
          planning: {
            manual: manualPlanning,
            frequency: {
              autoDailyFrequency: job.frequency.autoDailyFrequency,
              autoDailyFrequencyObservedDate: job.frequency.autoDailyFrequencyObservedDate,
              manualDailyFrequency: manualPlanning.dailyFrequency,
              effectiveDailyFrequency,
              source: frequencySource,
            },
            simulation: {
              capacityGB: effective.capacityGB,
              usedSpaceGB: effective.usedSpaceGB,
              freeGB: effective.freeGB,
              currentRetentionDays: manualPlanning.currentRetentionDays,
              retentionDays: manualPlanning.retentionDays ?? 30,
              dailyChangePercent: manualPlanning.dailyChangePercent ?? 0,
              protectedSizeGB: manualPlanning.protectedSizeGB,
              fullBackupSizeGB: manualPlanning.fullBackupSizeGB ?? manualPlanning.protectedSizeGB,
              dailyFrequency: effectiveDailyFrequency,
              backupMode: manualPlanning.backupMode,
              safetyMarginPercent: manualPlanning.safetyMarginPercent ?? 20,
            },
          },
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const status = buildRepositoryStatus({
      capacityGB: effective.capacityGB,
      usedSpaceGB: effective.usedSpaceGB,
      freeGB: effective.freeGB,
      usagePercent: effective.usagePercent,
    });
    const sourceLabel =
      effective.source === 'manual'
        ? 'manual'
        : repository.source === 'jobs_states'
          ? 'jobs_states'
          : 'zabbix';

    return {
      repositoryId: repository.repositoryId,
      name: repository.name,
      type: repository.type,
      description: repository.description,
      path: repository.path,
      source: sourceLabel,
      dataQuality: sourceLabel === 'manual' ? 'manual_override' : repository.dataQuality,
      needsManualInput: repository.needsManualInput || !hasCompleteStorage(effective),
      automatic: repository.automatic,
      manual,
      effective,
      jobs,
      jobsCount: jobs.length,
      status,
    };
  });

  const rowsSorted = rows.sort((a, b) => a.name.localeCompare(b.name));
  const inferredCount = rowsSorted.filter((row) => row.source === 'jobs_states').length;

  return {
    meta: {
      repositoriesAutomatic: repositoriesRaw.length,
      jobsTotal: jobsRaw.length,
      repositoriesInferred: inferredCount,
      overridesFound: (input.repositoryOverrides || []).length,
      jobOverridesFound: (input.jobOverrides || []).length,
      repositoriesIncomplete: rowsSorted.filter((row) => row.status === 'Dados incompletos').map((row) => row.name),
      collectedAt: collectedAtIso,
    },
    summary: {
      total: rowsSorted.length,
      automatic: rowsSorted.filter((row) => row.source === 'zabbix').length,
      manual: rowsSorted.filter((row) => row.source === 'manual').length,
      inferred: inferredCount,
      incomplete: rowsSorted.filter((row) => row.status === 'Dados incompletos').length,
      warning: rowsSorted.filter((row) => row.status === 'Atenção').length,
      critical: rowsSorted.filter((row) => row.status === 'Crítico').length,
      jobs: rowsSorted.reduce((sum, row) => sum + row.jobsCount, 0),
      jobsWithPlanning: rowsSorted.reduce(
        (sum, row) => sum + row.jobs.filter((job: any) => job.planning.manual.updatedAt || job.planning.manual.notes).length,
        0,
      ),
    },
    rows: rowsSorted,
  };
}
