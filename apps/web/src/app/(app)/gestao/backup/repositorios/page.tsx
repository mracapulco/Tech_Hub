"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type HostOption = { hostId: string; itemId: string; host: string; name: string; lastClock: number };
type RepositoryStatus = "OK" | "Atenção" | "Crítico" | "Dados incompletos";
type RepositorySource = "zabbix" | "manual" | "jobs_states";
type GoalPreference = "balance" | "lower_cost" | "more_protection";
type ScenarioMode = "Incremental" | "Synthetic Full" | "Active Full";
type ExecutiveStatus = "Atende" | "No limite" | "Não atende" | "Dados insuficientes";

type RepositoryNumbers = {
  capacityGB: number | null;
  usedSpaceGB: number | null;
  freeGB: number | null;
  usagePercent: number | null;
};

type RepositoryManual = RepositoryNumbers & {
  notes: string | null;
  useManualForPlanning: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

type JobPlanningManual = {
  protectedSizeGB: number | null;
  fullBackupSizeGB: number | null;
  dailyChangePercent: number | null;
  currentRetentionDays: number | null;
  retentionDays: number | null;
  dailyFrequency: number | null;
  backupMode: string;
  safetyMarginPercent: number | null;
  notes: string | null;
  useManualForPlanning: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

type RepositoryJob = {
  jobId: string;
  name: string;
  repositoryId?: string;
  repositoryName?: string;
  objectsCount?: number | null;
  lastResult?: string;
  lastRun?: string | null;
  frequency: {
    autoDailyFrequency: number | null;
    autoDailyFrequencyObservedDate: string | null;
  };
  runtime: {
    averageExecutionMinutes: number | null;
    latestExecutionMinutes: number | null;
    samples: number;
  };
  planning: {
    manual: JobPlanningManual;
    frequency: {
      autoDailyFrequency: number | null;
      autoDailyFrequencyObservedDate: string | null;
      manualDailyFrequency: number | null;
      effectiveDailyFrequency: number | null;
      source: string;
    };
    simulation: {
      capacityGB: number | null;
      usedSpaceGB: number | null;
      freeGB: number | null;
      currentRetentionDays: number | null;
      retentionDays: number | null;
      dailyChangePercent: number | null;
      protectedSizeGB: number | null;
      fullBackupSizeGB: number | null;
      dailyFrequency: number | null;
      backupMode: string;
      safetyMarginPercent: number | null;
    };
  };
};

type RepositoryRow = {
  repositoryId: string;
  name: string;
  type: string;
  description: string;
  path: string;
  source: RepositorySource;
  dataQuality: string;
  needsManualInput: boolean;
  automatic: RepositoryNumbers & { updatedAt: string | null };
  manual: RepositoryManual;
  effective: RepositoryNumbers & { source: string };
  jobs: RepositoryJob[];
  jobsCount: number;
  status: RepositoryStatus;
};

type RepositoryPayload = {
  host: { hostId: string; itemId: string; lastClock: number };
  meta: {
    source: string;
    zabbixItemId?: string;
    zabbixHistoryClock?: number;
    repositoriesAutomatic: number;
    jobsTotal: number;
    repositoriesInferred: number;
    overridesFound: number;
    jobOverridesFound: number;
    repositoriesIncomplete: string[];
    collectedAt?: string | null;
  };
  summary: {
    total: number;
    automatic: number;
    manual: number;
    inferred: number;
    incomplete: number;
    warning: number;
    critical: number;
    jobs: number;
    jobsWithPlanning: number;
  };
  rows: RepositoryRow[];
};

type RepositoryForm = {
  capacityGB: string;
  usedSpaceGB: string;
  freeGB: string;
  notes: string;
  useManualForPlanning: boolean;
};

type RepositoryFieldKey = "capacityGB" | "usedSpaceGB" | "freeGB";

type NeedForm = {
  desiredRetentionDays: string;
  currentRetentionDays: string;
  currentBackupMode: ScenarioMode;
  dailyFrequency: string;
  averageExecutionMinutes: string;
  totalBackupSizeGB: string;
  fullBackupSizeGB: string;
  dailyChangePercent: string;
  safetyMarginPercent: string;
  preference: GoalPreference;
};

type ScenarioResult = {
  id: string;
  label: string;
  mode: ScenarioMode;
  status: ExecutiveStatus;
  complete: boolean;
  desiredRetentionDays: number | null;
  currentRetentionDays: number | null;
  dailyFrequency: number | null;
  totalBackupSizeGB: number | null;
  fullBackupSizeGB: number | null;
  dailyChangePercent: number | null;
  safetyMarginPercent: number | null;
  incrementalDailyGB: number | null;
  estimatedFullCopies: number | null;
  estimatedIncrementalExecutionMinutes: number | null;
  estimatedFullExecutionMinutes: number | null;
  estimatedAverageExecutionMinutes: number | null;
  estimatedWeeklyWindowHours: number | null;
  estimatedRequiredGB: number | null;
  estimatedRequiredWithMarginGB: number | null;
  balanceGB: number | null;
  maxEstimatedRetentionDays: number | null;
  recommendation: string;
};

const RESULT_LABELS: Record<string, string> = {
  Success: "Sucesso",
  Failed: "Falha",
  Warning: "Aviso",
  Running: "Em execução",
  Unknown: "Desconhecido",
};

function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getSaoPauloDateFromUnixSeconds(unixSeconds?: number) {
  if (!unixSeconds) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(unixSeconds * 1000));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatLastClock(unixSeconds?: number) {
  if (!unixSeconds) return "Sem coleta";
  return new Date(unixSeconds * 1000).toLocaleString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function formatGb(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
}

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatCount(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatMinutes(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 60) {
    return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min`;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} min`;
}

function formatHours(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h/sem`;
}

function sourceLabel(source: RepositorySource) {
  if (source === "manual") return "Manual";
  if (source === "jobs_states") return "Inferido via jobs";
  return "Automático";
}

function sourceBadgeClass(source: RepositorySource) {
  if (source === "manual") return "border-orange-200 bg-orange-100 text-orange-800";
  if (source === "jobs_states") return "border-gray-200 bg-gray-100 text-gray-700";
  return "border-blue-200 bg-blue-100 text-blue-800";
}

function statusBadgeClass(status: RepositoryStatus) {
  if (status === "Crítico") return "border-red-200 bg-red-100 text-red-800";
  if (status === "Atenção") return "border-yellow-200 bg-yellow-100 text-yellow-800";
  if (status === "OK") return "border-green-200 bg-green-100 text-green-800";
  return "border-gray-200 bg-gray-100 text-gray-700";
}

function toFormValue(value?: number | string | null) {
  if (value == null || value === "") return "";
  return String(value);
}

function buildRepositoryForm(row: RepositoryRow | null): RepositoryForm {
  return {
    capacityGB: toFormValue(row?.manual.capacityGB ?? row?.effective.capacityGB ?? row?.automatic.capacityGB),
    usedSpaceGB: toFormValue(row?.manual.usedSpaceGB ?? row?.effective.usedSpaceGB ?? row?.automatic.usedSpaceGB),
    freeGB: toFormValue(row?.manual.freeGB ?? row?.effective.freeGB ?? row?.automatic.freeGB),
    notes: row?.manual.notes || "",
    useManualForPlanning: !!row?.manual.useManualForPlanning,
  };
}

function buildNeedForm(job: RepositoryJob | null): NeedForm {
  const base = job?.planning.manual;
  const fallback = job?.planning.simulation;
  return {
    desiredRetentionDays: toFormValue(base?.retentionDays ?? fallback?.retentionDays ?? 30),
    currentRetentionDays: toFormValue(base?.currentRetentionDays ?? base?.retentionDays ?? fallback?.currentRetentionDays ?? fallback?.retentionDays),
    currentBackupMode: (base?.backupMode || fallback?.backupMode || "Incremental") as ScenarioMode,
    dailyFrequency: toFormValue(base?.dailyFrequency ?? job?.planning.frequency.effectiveDailyFrequency ?? fallback?.dailyFrequency ?? 1),
    averageExecutionMinutes: toFormValue(job?.runtime.averageExecutionMinutes),
    totalBackupSizeGB: toFormValue(base?.protectedSizeGB ?? fallback?.protectedSizeGB),
    fullBackupSizeGB: toFormValue(base?.fullBackupSizeGB ?? fallback?.fullBackupSizeGB ?? fallback?.protectedSizeGB),
    dailyChangePercent: toFormValue(base?.dailyChangePercent ?? fallback?.dailyChangePercent ?? 0),
    safetyMarginPercent: toFormValue(base?.safetyMarginPercent ?? fallback?.safetyMarginPercent ?? 20),
    preference: "balance",
  };
}

function getScenarioFullCopies(mode: ScenarioMode, retentionDays: number) {
  if (mode === "Incremental") return 1;
  return 1 + Math.max(1, Math.ceil(retentionDays / 7));
}

function getScenarioWeeklyFullExecutions(mode: ScenarioMode) {
  if (mode === "Incremental") return 0;
  return 1;
}

function getScenarioIncrementalRuntimeFactor(mode: ScenarioMode) {
  if (mode === "Incremental") return 1.18;
  if (mode === "Synthetic Full") return 0.94;
  return 0.88;
}

function getScenarioFullRuntimeFactor(mode: ScenarioMode) {
  if (mode === "Synthetic Full") return 1.45;
  if (mode === "Active Full") return 1.95;
  return 0;
}

function getScenarioTotalExecutionsPerWeek(mode: ScenarioMode, dailyFrequency: number) {
  return dailyFrequency * 7 + getScenarioWeeklyFullExecutions(mode);
}

function executiveBadgeClass(status: ExecutiveStatus) {
  if (status === "Não atende") return "border-red-200 bg-red-100 text-red-800";
  if (status === "No limite") return "border-yellow-200 bg-yellow-100 text-yellow-800";
  if (status === "Atende") return "border-green-200 bg-green-100 text-green-800";
  return "border-gray-200 bg-gray-100 text-gray-700";
}

function simulatePlanningScenario(input: {
  id: string;
  label: string;
  mode: ScenarioMode;
  currentBackupMode: ScenarioMode;
  capacityGB: number | null;
  desiredRetentionDays: number | null;
  currentRetentionDays: number | null;
  baseDailyFrequency: number | null;
  dailyFrequency: number | null;
  averageExecutionMinutes: number | null;
  totalBackupSizeGB: number | null;
  fullBackupSizeGB: number | null;
  dailyChangePercent: number | null;
  safetyMarginPercent: number | null;
}): ScenarioResult {
  const effectiveCurrentRetentionDays = input.currentRetentionDays ?? input.desiredRetentionDays;
  const effectiveBaseDailyFrequency = input.baseDailyFrequency ?? input.dailyFrequency;
  const complete =
    input.capacityGB != null &&
    input.capacityGB > 0 &&
    input.desiredRetentionDays != null &&
    input.desiredRetentionDays >= 1 &&
    effectiveCurrentRetentionDays != null &&
    effectiveCurrentRetentionDays >= 1 &&
    effectiveBaseDailyFrequency != null &&
    effectiveBaseDailyFrequency >= 1 &&
    input.dailyFrequency != null &&
    input.dailyFrequency >= 1 &&
    input.totalBackupSizeGB != null &&
    input.totalBackupSizeGB > 0 &&
    input.averageExecutionMinutes != null &&
    input.averageExecutionMinutes > 0 &&
    input.dailyChangePercent != null &&
    input.dailyChangePercent >= 0 &&
    input.safetyMarginPercent != null &&
    input.safetyMarginPercent >= 0;

  const fullBackupSizeGB =
    complete && input.totalBackupSizeGB != null
      ? Math.min(input.fullBackupSizeGB ?? input.totalBackupSizeGB, input.totalBackupSizeGB)
      : null;
  const currentIncrementalPoolGB =
    complete && input.totalBackupSizeGB != null && fullBackupSizeGB != null
      ? Math.max(input.totalBackupSizeGB - fullBackupSizeGB, 0)
      : null;
  const incrementalDailyGB =
    complete && currentIncrementalPoolGB != null && effectiveCurrentRetentionDays != null && effectiveCurrentRetentionDays > 0
      ? currentIncrementalPoolGB / effectiveCurrentRetentionDays
      : null;
  const fullCopies =
    complete && input.desiredRetentionDays != null
      ? getScenarioFullCopies(input.mode, input.desiredRetentionDays)
      : null;
  const currentIncrementalExecutionsPerWeek =
    effectiveBaseDailyFrequency != null && effectiveBaseDailyFrequency > 0 ? effectiveBaseDailyFrequency * 7 : null;
  const scenarioIncrementalExecutionsPerWeek =
    input.dailyFrequency != null && input.dailyFrequency > 0 ? input.dailyFrequency * 7 : null;
  const currentFullExecutionsPerWeek = getScenarioWeeklyFullExecutions(input.currentBackupMode);
  const scenarioFullExecutionsPerWeek = getScenarioWeeklyFullExecutions(input.mode);
  const currentWeeklyEquivalentLoad =
    complete &&
    incrementalDailyGB != null &&
    fullBackupSizeGB != null &&
    currentIncrementalExecutionsPerWeek != null &&
    currentIncrementalExecutionsPerWeek > 0
      ? incrementalDailyGB * currentIncrementalExecutionsPerWeek * getScenarioIncrementalRuntimeFactor(input.currentBackupMode) +
        fullBackupSizeGB *
          currentFullExecutionsPerWeek *
          getScenarioFullRuntimeFactor(input.currentBackupMode)
      : null;
  const scenarioWeeklyEquivalentLoad =
    complete &&
    incrementalDailyGB != null &&
    fullBackupSizeGB != null &&
    scenarioIncrementalExecutionsPerWeek != null &&
    scenarioIncrementalExecutionsPerWeek > 0
      ? incrementalDailyGB * scenarioIncrementalExecutionsPerWeek * getScenarioIncrementalRuntimeFactor(input.mode) +
        fullBackupSizeGB * scenarioFullExecutionsPerWeek * getScenarioFullRuntimeFactor(input.mode)
      : null;
  const currentExecutionsPerWeek =
    effectiveBaseDailyFrequency != null && effectiveBaseDailyFrequency > 0
      ? getScenarioTotalExecutionsPerWeek(input.currentBackupMode, effectiveBaseDailyFrequency)
      : null;
  const scenarioExecutionsPerWeek =
    input.dailyFrequency != null && input.dailyFrequency > 0
      ? getScenarioTotalExecutionsPerWeek(input.mode, input.dailyFrequency)
      : null;
  const baselineFixedMinutesPerExecution =
    input.averageExecutionMinutes != null &&
    input.averageExecutionMinutes > 0
      ? input.averageExecutionMinutes * 0.18
      : null;
  const baselineVariableThroughputGBPerMinute =
    currentWeeklyEquivalentLoad != null &&
    currentExecutionsPerWeek != null &&
    currentExecutionsPerWeek > 0 &&
    input.averageExecutionMinutes != null &&
    baselineFixedMinutesPerExecution != null
      ? currentWeeklyEquivalentLoad /
        Math.max(input.averageExecutionMinutes * currentExecutionsPerWeek - baselineFixedMinutesPerExecution * currentExecutionsPerWeek, 1)
      : null;
  const estimatedIncrementalExecutionMinutes =
    complete &&
    incrementalDailyGB != null &&
    baselineVariableThroughputGBPerMinute != null &&
    baselineVariableThroughputGBPerMinute > 0 &&
    baselineFixedMinutesPerExecution != null
      ? baselineFixedMinutesPerExecution +
        (incrementalDailyGB * getScenarioIncrementalRuntimeFactor(input.mode)) / baselineVariableThroughputGBPerMinute
      : null;
  const estimatedFullExecutionMinutes =
    complete &&
    fullBackupSizeGB != null &&
    scenarioFullExecutionsPerWeek > 0 &&
    baselineVariableThroughputGBPerMinute != null &&
    baselineVariableThroughputGBPerMinute > 0 &&
    baselineFixedMinutesPerExecution != null
      ? baselineFixedMinutesPerExecution +
        (fullBackupSizeGB * getScenarioFullRuntimeFactor(input.mode)) / baselineVariableThroughputGBPerMinute
      : null;
  const estimatedWeeklyIncrementalMinutes =
    estimatedIncrementalExecutionMinutes != null && scenarioIncrementalExecutionsPerWeek != null
      ? estimatedIncrementalExecutionMinutes * scenarioIncrementalExecutionsPerWeek
      : null;
  const estimatedWeeklyFullMinutes =
    estimatedFullExecutionMinutes != null ? estimatedFullExecutionMinutes * scenarioFullExecutionsPerWeek : 0;
  const estimatedWeeklyRuntimeMinutes =
    complete &&
    estimatedWeeklyIncrementalMinutes != null &&
    scenarioExecutionsPerWeek != null &&
    scenarioExecutionsPerWeek > 0
      ? estimatedWeeklyIncrementalMinutes + estimatedWeeklyFullMinutes
      : null;
  const estimatedAverageExecutionMinutes =
    estimatedWeeklyRuntimeMinutes != null && scenarioExecutionsPerWeek != null && scenarioExecutionsPerWeek > 0
      ? estimatedWeeklyRuntimeMinutes / scenarioExecutionsPerWeek
      : null;
  const estimatedWeeklyWindowHours = estimatedWeeklyRuntimeMinutes != null ? estimatedWeeklyRuntimeMinutes / 60 : null;
  const estimatedRequiredGB =
    complete &&
    fullBackupSizeGB != null &&
    incrementalDailyGB != null &&
    fullCopies != null &&
    input.desiredRetentionDays != null &&
    input.dailyFrequency != null &&
    effectiveBaseDailyFrequency != null &&
    effectiveBaseDailyFrequency > 0
      ? (fullBackupSizeGB * fullCopies +
          incrementalDailyGB * input.desiredRetentionDays * (input.dailyFrequency / effectiveBaseDailyFrequency)) *
        (1 + (input.dailyChangePercent || 0) / 100)
      : null;
  const estimatedRequiredWithMarginGB =
    estimatedRequiredGB != null
      ? estimatedRequiredGB * (1 + (input.safetyMarginPercent || 0) / 100)
      : null;
  const balanceGB =
    estimatedRequiredWithMarginGB != null && input.capacityGB != null
      ? input.capacityGB - estimatedRequiredWithMarginGB
      : null;

  let maxEstimatedRetentionDays: number | null = null;
  if (
    complete &&
    estimatedRequiredGB != null &&
    incrementalDailyGB != null &&
    input.capacityGB != null &&
    input.dailyFrequency != null &&
    effectiveBaseDailyFrequency != null &&
    effectiveBaseDailyFrequency > 0
  ) {
    for (let days = 1; days <= 3650; days += 1) {
      const loopCopies = getScenarioFullCopies(input.mode, days);
      const loopRequired =
        (fullBackupSizeGB! * loopCopies +
          incrementalDailyGB * days * (input.dailyFrequency / effectiveBaseDailyFrequency)) *
        (1 + (input.dailyChangePercent || 0) / 100) *
        (1 + (input.safetyMarginPercent || 0) / 100);
      if (loopRequired > input.capacityGB) break;
      maxEstimatedRetentionDays = days;
    }
  }

  const status: ExecutiveStatus =
    balanceGB == null || estimatedRequiredWithMarginGB == null || input.capacityGB == null
      ? "Dados insuficientes"
      : balanceGB < 0
        ? "Não atende"
        : estimatedRequiredWithMarginGB / input.capacityGB >= 0.85
          ? "No limite"
          : "Atende";

  const recommendation =
    !complete
      ? "Dados insuficientes para avaliar este cenário."
      : status === "Não atende"
        ? `Cenário insuficiente. Déficit estimado de ${formatGb(Math.abs(balanceGB || 0))}.`
        : status === "No limite"
          ? "Cenário viável, mas com pouca folga para crescimento."
          : input.mode === "Incremental"
            ? "Cenário de menor consumo, porém com tendência de incrementais mais lentos ao longo do tempo."
            : input.mode === "Synthetic Full"
              ? "Incrementais tendem a ser mais leves no dia a dia, com Full semanal intermediário."
              : "Incrementais tendem a ser mais rápidos, porém o Active Full semanal costuma gerar a maior janela operacional.";

  return {
    id: input.id,
    label: input.label,
    mode: input.mode,
    status,
    complete,
    desiredRetentionDays: input.desiredRetentionDays,
    currentRetentionDays: effectiveCurrentRetentionDays,
    dailyFrequency: input.dailyFrequency,
    totalBackupSizeGB: input.totalBackupSizeGB,
    fullBackupSizeGB,
    dailyChangePercent: input.dailyChangePercent,
    safetyMarginPercent: input.safetyMarginPercent,
    incrementalDailyGB,
    estimatedFullCopies: fullCopies,
    estimatedIncrementalExecutionMinutes,
    estimatedFullExecutionMinutes,
    estimatedAverageExecutionMinutes,
    estimatedWeeklyWindowHours,
    estimatedRequiredGB,
    estimatedRequiredWithMarginGB,
    balanceGB,
    maxEstimatedRetentionDays,
    recommendation,
  };
}

function recommendScenario(scenarios: ScenarioResult[], preference: GoalPreference) {
  const viable = scenarios.filter((scenario) => scenario.complete && (scenario.balanceGB ?? -1) >= 0);
  if (viable.length > 0) {
    if (preference === "lower_cost") {
      return [...viable].sort(
        (a, b) => (a.estimatedRequiredWithMarginGB || 0) - (b.estimatedRequiredWithMarginGB || 0),
      )[0];
    }
    if (preference === "more_protection") {
      return viable.find((scenario) => scenario.mode === "Active Full") || viable[0];
    }
    return viable.find((scenario) => scenario.mode === "Synthetic Full") || viable[0];
  }
  return [...scenarios].sort((a, b) => (b.balanceGB || -Infinity) - (a.balanceGB || -Infinity))[0] || null;
}

function getResultLabel(value?: string | null) {
  if (!value) return "—";
  return RESULT_LABELS[value] || value;
}

function toNumberOrNull(value: string) {
  if (!String(value).trim()) return null;
  const normalized = value.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export default function BackupReposPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [hostId, setHostId] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(getTodayInSaoPaulo());
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [savingRepository, setSavingRepository] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<RepositoryPayload | null>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [repositoryForm, setRepositoryForm] = useState<RepositoryForm>(buildRepositoryForm(null));
  const [repositoryDirty, setRepositoryDirty] = useState<Record<RepositoryFieldKey, boolean>>({
    capacityGB: false,
    usedSpaceGB: false,
    freeGB: false,
  });
  const [needForm, setNeedForm] = useState<NeedForm>(buildNeedForm(null));

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingCompanies(true);
    setError(null);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Company[] }>("/companies", token);
        const nextCompanies = Array.isArray(res?.data) ? res.data : [];
        setCompanies(nextCompanies);
        setCompanyId(nextCompanies[0]?.id || "");
      } catch {
        setError("Falha ao carregar empresas.");
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !companyId) {
      setHosts([]);
      setHostId("");
      setPayload(null);
      return;
    }
    setLoadingHosts(true);
    setError(null);
    setPayload(null);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: HostOption[]; error?: string }>(
          `/backup/veeam/hosts?companyId=${companyId}`,
          token,
        );
        if (!res?.ok) {
          setHosts([]);
          setHostId("");
          setError(res?.error || "Falha ao carregar hosts Veeam do Zabbix.");
          return;
        }
        const nextHosts = Array.isArray(res.data) ? res.data : [];
        setHosts(nextHosts);
        setHostId((current) => (nextHosts.some((host) => host.hostId === current) ? current : (nextHosts[0]?.hostId || "")));
      } catch {
        setHosts([]);
        setHostId("");
        setError("Falha ao carregar hosts Veeam do Zabbix.");
      } finally {
        setLoadingHosts(false);
      }
    })();
  }, [companyId]);

  const selectedHost = useMemo(() => hosts.find((host) => host.hostId === hostId) || null, [hosts, hostId]);
  const selectedCompanyLabel = useMemo(() => {
    const company = companies.find((item) => item.id === companyId);
    return company?.fantasyName || company?.name || "Empresa";
  }, [companies, companyId]);
  const selectedRepository = useMemo(
    () => payload?.rows.find((row) => row.repositoryId === selectedRepositoryId) || payload?.rows[0] || null,
    [payload, selectedRepositoryId],
  );
  const snapshotHistoryDate = useMemo(
    () => getSaoPauloDateFromUnixSeconds(payload?.meta.zabbixHistoryClock),
    [payload?.meta.zabbixHistoryClock],
  );
  const snapshotFallbackNotice = useMemo(() => {
    if (!payload?.meta.zabbixHistoryClock || !snapshotDate || !snapshotHistoryDate) return null;
    if (snapshotHistoryDate === snapshotDate) return null;
    return `Nao havia snapshot em ${snapshotDate}. Foi usado o historico mais recente anterior, de ${snapshotHistoryDate}.`;
  }, [payload?.meta.zabbixHistoryClock, snapshotDate, snapshotHistoryDate]);
  const selectedJob = useMemo(
    () => selectedRepository?.jobs.find((job) => job.jobId === selectedJobId) || selectedRepository?.jobs[0] || null,
    [selectedRepository, selectedJobId],
  );

  useEffect(() => {
    if (payload?.rows?.length) {
      setSelectedRepositoryId((current) =>
        payload.rows.some((row) => row.repositoryId === current) ? current : payload.rows[0].repositoryId,
      );
      return;
    }
    setSelectedRepositoryId("");
  }, [payload]);

  useEffect(() => {
    if (selectedRepository?.jobs?.length) {
      setSelectedJobId((current) =>
        selectedRepository.jobs.some((job) => job.jobId === current) ? current : selectedRepository.jobs[0].jobId,
      );
      return;
    }
    setSelectedJobId("");
  }, [selectedRepository]);

  useEffect(() => {
    setRepositoryForm(buildRepositoryForm(selectedRepository));
    setRepositoryDirty({
      capacityGB: false,
      usedSpaceGB: false,
      freeGB: false,
    });
    setNeedForm(buildNeedForm(selectedJob));
  }, [selectedRepository, selectedJob]);

  const scenarioComparison = useMemo(() => {
    if (!selectedRepository || !selectedJob) return [] as ScenarioResult[];
    const base = {
      currentBackupMode: needForm.currentBackupMode,
      capacityGB: selectedRepository.effective.capacityGB,
      desiredRetentionDays: toNumberOrNull(needForm.desiredRetentionDays),
      currentRetentionDays: toNumberOrNull(needForm.currentRetentionDays),
      baseDailyFrequency: selectedJob.planning.frequency.effectiveDailyFrequency,
      dailyFrequency: toNumberOrNull(needForm.dailyFrequency),
      averageExecutionMinutes: toNumberOrNull(needForm.averageExecutionMinutes),
      totalBackupSizeGB: toNumberOrNull(needForm.totalBackupSizeGB),
      fullBackupSizeGB: toNumberOrNull(needForm.fullBackupSizeGB),
      dailyChangePercent: toNumberOrNull(needForm.dailyChangePercent),
      safetyMarginPercent: toNumberOrNull(needForm.safetyMarginPercent),
    };
    return [
      simulatePlanningScenario({ id: "current", label: "Atual projetado", mode: needForm.currentBackupMode, ...base }),
      simulatePlanningScenario({ id: "incremental", label: "Incremental puro", mode: "Incremental", ...base }),
      simulatePlanningScenario({ id: "synthetic", label: "Synthetic Full semanal", mode: "Synthetic Full", ...base }),
      simulatePlanningScenario({ id: "active", label: "Active Full semanal", mode: "Active Full", ...base }),
    ];
  }, [selectedRepository, selectedJob, needForm]);

  const recommendedScenario = useMemo(
    () => recommendScenario(scenarioComparison, needForm.preference),
    [scenarioComparison, needForm.preference],
  );

  function updateRepositoryField(field: RepositoryFieldKey, value: string) {
    setRepositoryForm((current) => ({ ...current, [field]: value }));
    setRepositoryDirty((current) => ({ ...current, [field]: true }));
  }

  async function loadRepositories() {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!companyId || !hostId) return;
    const itemId = selectedHost?.itemId;
    if (!itemId) {
      setError("Item Veeam não identificado para o host selecionado.");
      return;
    }
    setLoadingRepositories(true);
    setError(null);
    try {
      const query = new URLSearchParams({ companyId, hostId, itemId, date: snapshotDate });
      const res = await apiGet<{ ok: boolean; data?: RepositoryPayload; error?: string }>(
        `/backup/veeam/repositories?${query.toString()}`,
        token,
      );
      if (res?.ok && res.data) {
        setPayload(res.data);
      } else {
        setPayload(null);
        setError(res?.error || "Falha ao carregar repositórios do Veeam.");
      }
    } catch {
      setPayload(null);
      setError("Falha ao comunicar com a API.");
    } finally {
      setLoadingRepositories(false);
    }
  }

  async function handleSaveRepository() {
    const token = getToken();
    if (!token || !selectedRepository || !companyId || !hostId) {
      setError("Selecione empresa, host e repositório antes de salvar.");
      return;
    }
    setSavingRepository(true);
    setError(null);
    try {
      const capacityGB = toNumberOrNull(repositoryForm.capacityGB);
      const usedSpaceGB = toNumberOrNull(repositoryForm.usedSpaceGB);
      const freeGB = toNumberOrNull(repositoryForm.freeGB);
      const dirtyFields = (Object.entries(repositoryDirty) as Array<[RepositoryFieldKey, boolean]>)
        .filter(([, dirty]) => dirty)
        .map(([field]) => field);

      let payloadCapacityGB = capacityGB;
      let payloadUsedSpaceGB = usedSpaceGB;
      let payloadFreeGB = freeGB;

      const filledFields = [
        payloadCapacityGB != null ? "capacityGB" : null,
        payloadUsedSpaceGB != null ? "usedSpaceGB" : null,
        payloadFreeGB != null ? "freeGB" : null,
      ].filter(Boolean) as RepositoryFieldKey[];

      if (filledFields.length === 2) {
        const filledSet = new Set(filledFields);
        if (!filledSet.has("capacityGB") && payloadUsedSpaceGB != null && payloadFreeGB != null) {
          payloadCapacityGB = payloadUsedSpaceGB + payloadFreeGB;
        } else if (!filledSet.has("usedSpaceGB") && payloadCapacityGB != null && payloadFreeGB != null) {
          payloadUsedSpaceGB = payloadCapacityGB - payloadFreeGB;
        } else if (!filledSet.has("freeGB") && payloadCapacityGB != null && payloadUsedSpaceGB != null) {
          payloadFreeGB = payloadCapacityGB - payloadUsedSpaceGB;
        }
      } else if (dirtyFields.length === 2) {
        const dirtySet = new Set(dirtyFields);
        if (!dirtySet.has("capacityGB") && usedSpaceGB != null && freeGB != null) {
          payloadCapacityGB = usedSpaceGB + freeGB;
        } else if (!dirtySet.has("usedSpaceGB") && capacityGB != null && freeGB != null) {
          payloadUsedSpaceGB = capacityGB - freeGB;
        } else if (!dirtySet.has("freeGB") && capacityGB != null && usedSpaceGB != null) {
          payloadFreeGB = capacityGB - usedSpaceGB;
        }
      }

      setRepositoryForm((current) => ({
        ...current,
        capacityGB: payloadCapacityGB == null ? "" : String(payloadCapacityGB),
        usedSpaceGB: payloadUsedSpaceGB == null ? "" : String(payloadUsedSpaceGB),
        freeGB: payloadFreeGB == null ? "" : String(payloadFreeGB),
      }));

      const res = await apiPost<{ ok: boolean; error?: string }>(
        "/backup/veeam/repositories/override",
        token,
        {
          companyId,
          hostId,
          repositoryId: selectedRepository.repositoryId,
          repositoryName: selectedRepository.name,
          repositoryType: selectedRepository.type,
          capacityGB: payloadCapacityGB,
          usedSpaceGB: payloadUsedSpaceGB,
          freeGB: payloadFreeGB,
          notes: repositoryForm.notes.trim() || null,
          useManualForPlanning: repositoryForm.useManualForPlanning,
        },
      );
      if (!res?.ok) {
        setError(res?.error || "Falha ao salvar os dados manuais do repositório.");
        return;
      }
      await loadRepositories();
    } catch {
      setError("Falha ao comunicar com a API.");
    } finally {
      setSavingRepository(false);
    }
  }

  async function handleSaveNeed() {
    if (!selectedJob) {
      setError("Selecione uma rotina antes de salvar a necessidade do cliente.");
      return;
    }
    await (async () => {
      const token = getToken();
      if (!token || !selectedRepository || !selectedJob || !companyId || !hostId) {
        setError("Selecione empresa, host, repositório e rotina antes de salvar.");
        return;
      }
      setSavingJob(true);
      setError(null);
      setNotice(null);
      try {
        const res = await apiPost<{ ok: boolean; error?: string }>(
          "/backup/veeam/repositories/job-override",
          token,
          {
            companyId,
            hostId,
            repositoryId: selectedRepository.repositoryId,
            jobId: selectedJob.jobId,
            jobName: selectedJob.name,
            protectedSizeGB: toNumberOrNull(needForm.totalBackupSizeGB),
            fullBackupSizeGB: toNumberOrNull(needForm.fullBackupSizeGB),
            dailyChangePercent: toNumberOrNull(needForm.dailyChangePercent),
            currentRetentionDays: toNumberOrNull(needForm.currentRetentionDays),
            retentionDays: toNumberOrNull(needForm.desiredRetentionDays),
            dailyFrequency: toNumberOrNull(needForm.dailyFrequency),
            backupMode: needForm.currentBackupMode,
            safetyMarginPercent: toNumberOrNull(needForm.safetyMarginPercent),
            notes: selectedJob.planning.manual.notes || null,
            useManualForPlanning: true,
          },
        );
        if (!res?.ok) {
          setError(res?.error || "Falha ao salvar a necessidade do cliente.");
          return;
        }
        setNotice("Necessidade do cliente salva para reutilização futura nesta rotina.");
        await loadRepositories();
      } catch {
        setError("Falha ao comunicar com a API.");
      } finally {
        setSavingJob(false);
      }
    })();
  }

  function handleClearNeed() {
    setNeedForm(buildNeedForm(selectedJob));
    setNotice("Necessidade do cliente restaurada para a base detectada/salva.");
    setError(null);
  }

  return (
    <main>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Repositórios / Planejamento</h1>
          <p className="mt-2 text-sm text-gray-700">
            Repositório define capacidade. Rotina define retenção, frequência e tipo de Full. O planejamento agora é feito por rotina.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gestao/backup" className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50">
            Voltar
          </Link>
          <Link href="/gestao/backup/relatorio" className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50">
            Timeline
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded border border-border bg-card p-4 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-sm font-medium">Cliente</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
              disabled={loadingCompanies}
            >
              <option value="">Selecione...</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.fantasyName || company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Host Veeam / Zabbix</label>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
              disabled={loadingHosts || !companyId}
            >
              <option value="">{loadingHosts ? "Carregando..." : "Selecione..."}</option>
              {hosts.map((host) => (
                <option key={host.hostId} value={host.hostId}>
                  {host.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Data do snapshot</label>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
              disabled={!companyId}
            />
          </div>

          <div className="rounded border border-dashed border-border bg-white px-3 py-2">
            <div className="text-xs text-muted">Última coleta</div>
            <div className="mt-1 text-sm font-medium">{selectedHost ? formatLastClock(selectedHost.lastClock) : "Selecione um host"}</div>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadRepositories}
              disabled={loadingRepositories || !companyId || !hostId}
              className={`w-full rounded px-4 py-2 text-white ${loadingRepositories ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {loadingRepositories ? "Carregando..." : "Atualizar repositórios"}
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-muted">
          Cliente: {selectedCompanyLabel} {selectedHost ? `| Host: ${selectedHost.name}` : ""} | Data selecionada: {snapshotDate}
          {payload?.meta.zabbixHistoryClock ? ` | Histórico: ${formatLastClock(payload.meta.zabbixHistoryClock)}` : ""}
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}
      {notice && <p className="mt-2 text-sm text-green-700">{notice}</p>}
      {snapshotFallbackNotice && <p className="mt-2 text-sm text-amber-700">{snapshotFallbackNotice}</p>}

      <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Total</div>
          <div className="mt-1 text-2xl font-semibold">{payload?.summary.total ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Automáticos</div>
          <div className="mt-1 text-2xl font-semibold text-blue-700">{payload?.summary.automatic ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Manuais</div>
          <div className="mt-1 text-2xl font-semibold text-orange-700">{payload?.summary.manual ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Inferidos por jobs</div>
          <div className="mt-1 text-2xl font-semibold text-gray-700">{payload?.summary.inferred ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Dados incompletos</div>
          <div className="mt-1 text-2xl font-semibold text-gray-700">{payload?.summary.incomplete ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Atenção / Crítico</div>
          <div className="mt-1 text-2xl font-semibold">{(payload?.summary.warning ?? 0) + (payload?.summary.critical ?? 0)}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Rotinas detectadas</div>
          <div className="mt-1 text-2xl font-semibold">{payload?.summary.jobs ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Rotinas com planejamento</div>
          <div className="mt-1 text-2xl font-semibold">{payload?.summary.jobsWithPlanning ?? 0}</div>
        </div>
      </section>

      <section className="mt-6 rounded border border-border bg-card p-4 shadow">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">Repositórios detectados</h2>
            <p className="text-xs text-muted">
              Fonte principal: <code>repositories_states.data</code>, com inferência adicional via <code>jobs_states.data</code>.
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            {payload?.meta.source || "Selecione empresa e host para carregar os repositórios."}
          </div>
        </div>

        {!payload ? (
          <div className="rounded border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            {loadingRepositories ? "Carregando repositórios..." : "Nenhum conjunto de repositórios carregado ainda."}
          </div>
        ) : payload.rows.length === 0 ? (
          <div className="rounded border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Nenhum repositório encontrado no último histórico do item <code>veeam.get.metrics</code>.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="border-b border-r border-border px-3 py-2">Repositório</th>
                  <th className="border-b border-r border-border px-3 py-2">Tipo</th>
                  <th className="border-b border-r border-border px-3 py-2">Caminho</th>
                  <th className="border-b border-r border-border px-3 py-2">Fonte</th>
                  <th className="border-b border-r border-border px-3 py-2 text-right">Capacidade</th>
                  <th className="border-b border-r border-border px-3 py-2 text-right">Usado</th>
                  <th className="border-b border-r border-border px-3 py-2 text-right">Livre</th>
                  <th className="border-b border-r border-border px-3 py-2 text-right">Uso %</th>
                  <th className="border-b border-r border-border px-3 py-2">Rotinas</th>
                  <th className="border-b border-r border-border px-3 py-2">Status</th>
                  <th className="border-b border-border px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((row) => (
                  <tr
                    key={row.repositoryId}
                    className={`align-top ${selectedRepository?.repositoryId === row.repositoryId ? "bg-blue-50" : "bg-white"}`}
                  >
                    <td className="border-b border-r border-border px-3 py-2">
                      <div className="font-medium">{row.name}</div>
                      {row.description ? <div className="mt-1 text-xs text-muted">{row.description}</div> : null}
                    </td>
                    <td className="border-b border-r border-border px-3 py-2">{row.type}</td>
                    <td className="border-b border-r border-border px-3 py-2">
                      <div className="max-w-[260px] break-all text-xs">{row.path || "—"}</div>
                    </td>
                    <td className="border-b border-r border-border px-3 py-2">
                      <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${sourceBadgeClass(row.source)}`}>
                        {sourceLabel(row.source)}
                      </span>
                    </td>
                    <td className="border-b border-r border-border px-3 py-2 text-right">{formatGb(row.effective.capacityGB)}</td>
                    <td className="border-b border-r border-border px-3 py-2 text-right">{formatGb(row.effective.usedSpaceGB)}</td>
                    <td className="border-b border-r border-border px-3 py-2 text-right">{formatGb(row.effective.freeGB)}</td>
                    <td className="border-b border-r border-border px-3 py-2 text-right">{formatPercent(row.effective.usagePercent)}</td>
                    <td className="border-b border-r border-border px-3 py-2">
                      <div className="text-xs font-medium">{row.jobsCount} rotina(s)</div>
                      <div className="mt-1 text-xs text-muted">{row.jobs.slice(0, 2).map((job) => job.name).join(", ") || "—"}</div>
                    </td>
                    <td className="border-b border-r border-border px-3 py-2">
                      <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${statusBadgeClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="border-b border-border px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => setSelectedRepositoryId(row.repositoryId)}
                          className="rounded border border-border bg-white px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          Editar repositório
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRepositoryId(row.repositoryId);
                            setSelectedJobId(row.jobs[0]?.jobId || "");
                          }}
                          className="rounded border border-border bg-white px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          Planejar rotinas
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRepository && (
        <>
          <section className="mt-6 rounded border border-border bg-card p-4 shadow">
            <h2 className="font-semibold">Rotinas vinculadas ao repositório</h2>
            <p className="mt-1 text-xs text-muted">
              Repositório selecionado: <strong>{selectedRepository.name}</strong>
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {selectedRepository.jobs.length === 0 ? (
                <div className="rounded border border-dashed border-border px-4 py-6 text-sm text-muted">
                  Nenhuma rotina vinculada foi identificada neste último histórico.
                </div>
              ) : (
                selectedRepository.jobs.map((job) => (
                  <button
                    type="button"
                    key={`${selectedRepository.repositoryId}-${job.jobId}`}
                    onClick={() => {
                      setSelectedJobId(job.jobId);
                    }}
                    className={`rounded border p-3 text-left ${selectedJob?.jobId === job.jobId ? "border-blue-300 bg-blue-50" : "border-border bg-white hover:bg-gray-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{job.name}</div>
                      <span className="rounded border border-border bg-white px-2 py-1 text-xs">
                        {job.planning.manual.updatedAt ? "Planejamento salvo" : "Sem planejamento"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      Resultado: {getResultLabel(job.lastResult)} | Última execução: {formatDateTime(job.lastRun)}
                    </div>
                    <div className="mt-1 text-xs text-muted">Objetos: {job.objectsCount ?? "—"}</div>
                    <div className="mt-1 text-xs text-muted">
                      Frequência observada: {formatCount(job.frequency.autoDailyFrequency)} execução(ões)/dia
                      {job.frequency.autoDailyFrequencyObservedDate ? ` em ${job.frequency.autoDailyFrequencyObservedDate}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Frequência efetiva: {formatCount(job.planning.frequency.effectiveDailyFrequency)} execução(ões)/dia
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Tempo médio observado: {formatMinutes(job.runtime.averageExecutionMinutes)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {selectedJob ? (
            <>
              <section className="mt-6 rounded border border-border bg-card p-4 shadow">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="font-semibold">Resumo executivo</h2>
                    <p className="mt-1 text-sm text-muted">
                      {recommendedScenario?.status === "Atende"
                        ? `A capacidade atual do repositório ${selectedRepository.name} suporta a política desejada para a rotina ${selectedJob.name}.`
                        : recommendedScenario?.status === "No limite"
                          ? "O ambiente consegue atender a retenção desejada, porém com pouca folga operacional."
                          : recommendedScenario?.status === "Não atende"
                            ? `Com o storage atual, o repositório ${selectedRepository.name} não sustenta a política informada.`
                            : "Ainda faltam dados para recomendar a melhor configuração com segurança."}
                    </p>
                  </div>
                  <span className={`inline-flex rounded border px-3 py-1 text-sm font-medium ${executiveBadgeClass(recommendedScenario?.status || "Dados insuficientes")}`}>
                    {recommendedScenario?.status || "Dados insuficientes"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded border border-border bg-white p-4">
                    <div className="text-xs text-muted">Cenário recomendado</div>
                    <div className="mt-1 text-lg font-semibold">{recommendedScenario?.label || "—"}</div>
                    <p className="mt-2 text-sm text-muted">
                      {recommendedScenario?.status === "Atende"
                        ? "Use este cenário como base da recomendação e só depois avance para ajustes finos."
                        : recommendedScenario?.status === "No limite"
                          ? "Avalie aumentar storage, reduzir retenção ou escolher um cenário de menor consumo."
                          : recommendedScenario?.status === "Não atende"
                            ? "Compare os cenários abaixo para decidir entre ampliar storage, reduzir retenção ou mudar o tipo de full semanal."
                            : "Complete os dados do repositório e da rotina se a leitura automática não for suficiente."}
                    </p>
                  </div>
                  <div className="rounded border border-border bg-white p-4">
                    <div className="text-xs text-muted">Necessário com margem</div>
                    <div className="mt-1 text-lg font-semibold">{formatGb(recommendedScenario?.estimatedRequiredWithMarginGB)}</div>
                    <p className="mt-2 text-sm text-muted">Sobra / déficit: {formatGb(recommendedScenario?.balanceGB)}</p>
                  </div>
                  <div className="rounded border border-border bg-white p-4">
                    <div className="text-xs text-muted">Retenção máxima estimada</div>
                    <div className="mt-1 text-lg font-semibold">
                      {recommendedScenario?.maxEstimatedRetentionDays == null ? "—" : `${recommendedScenario.maxEstimatedRetentionDays} dia(s)`}
                    </div>
                    <p className="mt-2 text-sm text-muted">Rotina analisada: {selectedJob.name}</p>
                  </div>
                </div>
              </section>

              <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="rounded border border-border bg-card p-4 shadow">
                  <h2 className="font-semibold">Visão da rotina</h2>
                  <p className="mt-1 text-xs text-muted">
                    Centralize aqui a leitura atual da rotina e o que você quer projetar. Os cenários recalculam automaticamente abaixo, incluindo estimativa de tempo baseada em histórico e tamanho dos backups.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Retenção desejada (dias)</label>
                      <input value={needForm.desiredRetentionDays} onChange={(e) => setNeedForm((current) => ({ ...current, desiredRetentionDays: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Retenção atual (dias)</label>
                      <input value={needForm.currentRetentionDays} onChange={(e) => setNeedForm((current) => ({ ...current, currentRetentionDays: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Execuções por dia</label>
                      <input value={needForm.dailyFrequency} onChange={(e) => setNeedForm((current) => ({ ...current, dailyFrequency: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                      <p className="mt-1 text-xs text-muted">Observado automaticamente: {formatCount(selectedJob.planning.frequency.effectiveDailyFrequency)} execução(ões)/dia.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tipo atual do backup</label>
                      <select value={needForm.currentBackupMode} onChange={(e) => setNeedForm((current) => ({ ...current, currentBackupMode: e.target.value as ScenarioMode }))} className="w-full rounded border border-border px-3 py-2">
                        <option value="Incremental">Incremental</option>
                        <option value="Synthetic Full">Synthetic Full</option>
                        <option value="Active Full">Active Full</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tempo médio estimado atual (min)</label>
                      <input value={needForm.averageExecutionMinutes} onChange={(e) => setNeedForm((current) => ({ ...current, averageExecutionMinutes: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                      <p className="mt-1 text-xs text-muted">Estimativa baseada no JSON: {formatMinutes(selectedJob.runtime.averageExecutionMinutes)} em {formatCount(selectedJob.runtime.samples)} execução(ões).</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Objetivo da análise</label>
                      <select value={needForm.preference} onChange={(e) => setNeedForm((current) => ({ ...current, preference: e.target.value as GoalPreference }))} className="w-full rounded border border-border px-3 py-2">
                        <option value="balance">Equilibrar custo e proteção</option>
                        <option value="lower_cost">Priorizar menor consumo</option>
                        <option value="more_protection">Priorizar proteção</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tamanho total do backup (GB)</label>
                      <input value={needForm.totalBackupSizeGB} onChange={(e) => setNeedForm((current) => ({ ...current, totalBackupSizeGB: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                      <p className="mt-1 text-xs text-muted">Informe quanto a cadeia desta rotina ocupa hoje no repositório.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tamanho do Full (GB)</label>
                      <input value={needForm.fullBackupSizeGB} onChange={(e) => setNeedForm((current) => ({ ...current, fullBackupSizeGB: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                      <p className="mt-1 text-xs text-muted">Se nao informar, a ferramenta assume o mesmo valor do tamanho total atual.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Crescimento estimado (%)</label>
                      <input value={needForm.dailyChangePercent} onChange={(e) => setNeedForm((current) => ({ ...current, dailyChangePercent: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                      <p className="mt-1 text-xs text-muted">Use `0` para projetar mantendo o volume atual da cadeia.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Margem de segurança (%)</label>
                      <input value={needForm.safetyMarginPercent} onChange={(e) => setNeedForm((current) => ({ ...current, safetyMarginPercent: e.target.value }))} className="w-full rounded border border-border px-3 py-2" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveNeed}
                      disabled={savingJob}
                      className={`rounded px-4 py-2 text-white ${savingJob ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      {savingJob ? "Salvando..." : "Salvar necessidade"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearNeed}
                      className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Limpar
                    </button>
                  </div>
                </section>

                <section className="rounded border border-border bg-card p-4 shadow">
                  <h2 className="font-semibold">Base atual detectada</h2>
                  <p className="mt-1 text-xs text-muted">
                    Esta é a fotografia do ambiente usada como referência para comparar consumo e janela operacional.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded border border-border bg-white p-4">
                      <div className="text-xs text-muted">Repositório em uso</div>
                      <div className="mt-1 text-lg font-semibold">{selectedRepository.name}</div>
                      <div className="mt-2 text-sm text-muted">Tipo: {selectedRepository.type}</div>
                      <div className="mt-1 text-sm text-muted">Fonte: {sourceLabel(selectedRepository.source)}</div>
                      <div className="mt-1 text-sm text-muted">Capacidade: {formatGb(selectedRepository.effective.capacityGB)}</div>
                      <div className="mt-1 text-sm text-muted">Usado: {formatGb(selectedRepository.effective.usedSpaceGB)}</div>
                      <div className="mt-1 text-sm text-muted">Livre: {formatGb(selectedRepository.effective.freeGB)}</div>
                    </div>
                    <div className="rounded border border-border bg-white p-4">
                      <div className="text-xs text-muted">Rotina selecionada</div>
                      <div className="mt-1 text-lg font-semibold">{selectedJob.name}</div>
                      <div className="mt-2 text-sm text-muted">Resultado: {getResultLabel(selectedJob.lastResult)}</div>
                      <div className="mt-1 text-sm text-muted">Última execução: {formatDateTime(selectedJob.lastRun)}</div>
                      <div className="mt-1 text-sm text-muted">Frequência observada: {formatCount(selectedJob.frequency.autoDailyFrequency)} execução(ões)/dia</div>
                      <div className="mt-1 text-sm text-muted">Tempo médio observado: {formatMinutes(selectedJob.runtime.averageExecutionMinutes)}</div>
                      <div className="mt-1 text-sm text-muted">Tipo atual considerado: {needForm.currentBackupMode}</div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="mt-6 rounded border border-border bg-card p-4 shadow">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">Cenários e recomendação</h2>
                    <p className="mt-1 text-xs text-muted">
                      Compare a configuração atual com as alternativas mais comuns antes de alterar o ambiente.
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Os cenários recalculam automaticamente conforme os campos acima. A estimativa separa o comportamento do incremental diário e do Full semanal, com impacto maior no Active Full.
                    </p>
                  </div>
                  <span className="inline-flex rounded border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                    Decisão assistida
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {scenarioComparison.map((scenario) => (
                    <div key={scenario.id} className={`rounded border p-4 ${recommendedScenario?.id === scenario.id ? "border-blue-300 bg-blue-50" : "border-border bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{scenario.label}</div>
                          <div className="mt-1 text-xs text-muted">Modo: {scenario.mode}</div>
                        </div>
                        <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${executiveBadgeClass(scenario.status)}`}>
                          {scenario.status}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Necessário com margem</div>
                          <div className="mt-1 font-semibold">{formatGb(scenario.estimatedRequiredWithMarginGB)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Sobra / déficit</div>
                          <div className={`mt-1 font-semibold ${(scenario.balanceGB ?? 0) < 0 ? "text-red-700" : "text-green-700"}`}>
                            {formatGb(scenario.balanceGB)}
                          </div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Fulls considerados</div>
                          <div className="mt-1 font-semibold">{formatCount(scenario.estimatedFullCopies)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Incremental médio por dia</div>
                          <div className="mt-1 font-semibold">{formatGb(scenario.incrementalDailyGB)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Tempo do incremental</div>
                          <div className="mt-1 font-semibold">{formatMinutes(scenario.estimatedIncrementalExecutionMinutes)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Tempo do Full semanal</div>
                          <div className="mt-1 font-semibold">
                            {scenario.mode === "Incremental" ? "Nao se aplica" : formatMinutes(scenario.estimatedFullExecutionMinutes)}
                          </div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Média geral da semana</div>
                          <div className="mt-1 font-semibold">{formatMinutes(scenario.estimatedAverageExecutionMinutes)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Janela semanal estimada</div>
                          <div className="mt-1 font-semibold">{formatHours(scenario.estimatedWeeklyWindowHours)}</div>
                        </div>
                        <div className="rounded border border-border bg-card p-3">
                          <div className="text-xs text-muted">Retenção máxima estimada</div>
                          <div className="mt-1 font-semibold">
                            {scenario.maxEstimatedRetentionDays == null ? "—" : `${scenario.maxEstimatedRetentionDays} dia(s)`}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-muted">{scenario.recommendation}</p>
                      {recommendedScenario?.id === scenario.id ? (
                        <div className="mt-3">
                          <span className="inline-flex rounded border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                            Recomendado
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          <div className="mt-6">
            <details className="rounded border border-border bg-card p-4 shadow">
              <summary className="cursor-pointer list-none font-semibold">Ajustes manuais avançados do repositório</summary>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Dados do repositório</h2>
                  <p className="mt-1 text-xs text-muted">
                    Use esta área para ajustar apenas capacidade, usado e livre.
                  </p>
                </div>
                <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${sourceBadgeClass(selectedRepository.source)}`}>
                  {sourceLabel(selectedRepository.source)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Capacidade total (GB)</label>
                  <input value={repositoryForm.capacityGB} onChange={(e) => updateRepositoryField("capacityGB", e.target.value)} className="w-full rounded border border-border px-3 py-2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Espaço usado (GB)</label>
                  <input value={repositoryForm.usedSpaceGB} onChange={(e) => updateRepositoryField("usedSpaceGB", e.target.value)} className="w-full rounded border border-border px-3 py-2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Espaço livre (GB)</label>
                  <input value={repositoryForm.freeGB} onChange={(e) => updateRepositoryField("freeGB", e.target.value)} className="w-full rounded border border-border px-3 py-2" />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium">Observações do repositório</label>
                <textarea
                  value={repositoryForm.notes}
                  onChange={(e) => setRepositoryForm((current) => ({ ...current, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded border border-border px-3 py-2"
                />
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={repositoryForm.useManualForPlanning}
                  onChange={(e) => setRepositoryForm((current) => ({ ...current, useManualForPlanning: e.target.checked }))}
                />
                Usar valores manuais deste repositório no planejamento
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={handleSaveRepository}
                  disabled={savingRepository}
                  className={`rounded px-4 py-2 text-white ${savingRepository ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {savingRepository ? "Salvando..." : "Salvar repositório"}
                </button>
                <button
                  onClick={() => {
                    setRepositoryForm(buildRepositoryForm(selectedRepository));
                    setRepositoryDirty({
                      capacityGB: false,
                      usedSpaceGB: false,
                      freeGB: false,
                    });
                  }}
                  className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Recarregar valores salvos
                </button>
              </div>

              <div className="mt-4 rounded border border-dashed border-border bg-white p-3 text-xs text-muted">
                Atual automático: capacidade {formatGb(selectedRepository.automatic.capacityGB)} | usado {formatGb(selectedRepository.automatic.usedSpaceGB)} | livre {formatGb(selectedRepository.automatic.freeGB)} | uso {formatPercent(selectedRepository.automatic.usagePercent)}
              </div>
            </details>
          </div>
        </>
      )}
    </main>
  );
}
