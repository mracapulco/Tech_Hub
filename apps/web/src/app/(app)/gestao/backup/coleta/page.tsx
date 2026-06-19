"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type HostOption = { hostId: string; itemId: string; host: string; name: string; lastClock: number };

type CollectionConfig = {
  id: string;
  scope: string;
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  allowManualRun: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastTriggerType: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type CollectionHistoryRow = {
  id: string;
  companyId: string;
  zabbixHostId: string;
  zabbixHostName: string | null;
  itemId: string;
  itemName: string | null;
  sourceClock: number;
  triggerType: string;
  payloadHash: string;
  createdAt: string;
  company?: {
    id: string;
    name: string;
    fantasyName?: string | null;
  };
};

type CollectionRunResult = {
  triggerType: "manual" | "scheduled";
  startedAt: string;
  finishedAt: string;
  hostsConsidered: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  snapshotsUnchanged: number;
  deletedSnapshots: number;
  errors: Array<{ companyId: string; hostId?: string; message: string }>;
};

type RunScope = "global" | "company" | "host";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function formatClock(unixSeconds?: number | null) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString("pt-BR");
}

export default function BackupCollectionPage() {
  const [config, setConfig] = useState<CollectionConfig | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [history, setHistory] = useState<CollectionHistoryRow[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [hostId, setHostId] = useState("");
  const [runScope, setRunScope] = useState<RunScope>("global");
  const [form, setForm] = useState({
    enabled: true,
    intervalHours: "12",
    retentionDays: "30",
    allowManualRun: true,
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [hostsError, setHostsError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<CollectionRunResult | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningCollection, setRunningCollection] = useState(false);

  const selectedCompanyLabel = useMemo(() => {
    const company = companies.find((item) => item.id === companyId);
    return company?.fantasyName || company?.name || "Todas as empresas";
  }, [companies, companyId]);

  const storageUnavailable = config?.id === "in-memory-global";
  const storageNotice = storageUnavailable
    ? "Persistencia da coleta ainda nao esta habilitada neste banco. Voce pode consultar o ambiente ao vivo, mas salvar configuracao, rodar coleta manual e manter historico exigem aplicar o schema novo."
    : null;

  async function loadHistory(nextCompanyId?: string, nextHostId?: string) {
    const token = getToken();
    if (!token) {
      setPageError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingHistory(true);
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (nextCompanyId) query.set("companyId", nextCompanyId);
      if (nextHostId) query.set("hostId", nextHostId);
      const res = await apiGet<{ ok: boolean; data?: CollectionHistoryRow[]; error?: string }>(
        `/backup/veeam/collection/history?${query.toString()}`,
        token,
      );
      if (!res?.ok) {
        setHistory([]);
        setPageError(res?.error || "Falha ao carregar o histórico da coleta.");
        return;
      }
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      setHistory([]);
      setPageError("Falha ao carregar o histórico da coleta.");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoadingPage(false);
      setPageError("Sessão expirada. Faça login novamente.");
      return;
    }
    (async () => {
      setLoadingPage(true);
      setPageError(null);
      try {
        const [configRes, companiesRes] = await Promise.all([
          apiGet<{ ok: boolean; data?: CollectionConfig; error?: string }>("/backup/veeam/collection/config", token),
          apiGet<{ ok: boolean; data?: Company[]; error?: string }>("/companies", token),
        ]);
        if (!configRes?.ok || !configRes.data) {
          setPageError(configRes?.error || "Falha ao carregar a configuração da coleta.");
          setConfig(null);
        } else {
          setConfig(configRes.data);
          setForm({
            enabled: Boolean(configRes.data.enabled),
            intervalHours: String(configRes.data.intervalHours ?? 12),
            retentionDays: String(configRes.data.retentionDays ?? 30),
            allowManualRun: Boolean(configRes.data.allowManualRun),
          });
        }
        const nextCompanies = Array.isArray(companiesRes?.data) ? companiesRes.data : [];
        setCompanies(nextCompanies);
        await loadHistory();
      } catch {
        setPageError("Falha ao carregar a tela de coleta.");
      } finally {
        setLoadingPage(false);
      }
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (!companyId) {
      setHosts([]);
      setHostId("");
      setHostsError(null);
      void loadHistory("", "");
      return;
    }
    setLoadingHosts(true);
    setHostsError(null);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: HostOption[]; error?: string }>(
          `/backup/veeam/hosts?companyId=${companyId}`,
          token,
        );
        if (!res?.ok) {
          setHosts([]);
          setHostId("");
          setHostsError(res?.error || "Falha ao carregar os hosts Veeam para a empresa selecionada.");
          await loadHistory(companyId, "");
          return;
        }
        const nextHosts = Array.isArray(res.data) ? res.data : [];
        setHosts(nextHosts);
        setHostId((current) => (nextHosts.some((item) => item.hostId === current) ? current : ""));
        await loadHistory(companyId, "");
      } catch {
        setHosts([]);
        setHostId("");
        setHostsError("Falha ao carregar os hosts Veeam para a empresa selecionada.");
      } finally {
        setLoadingHosts(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    void loadHistory(companyId, hostId);
  }, [hostId]);

  async function refreshConfig() {
    const token = getToken();
    if (!token) return;
    const res = await apiGet<{ ok: boolean; data?: CollectionConfig; error?: string }>("/backup/veeam/collection/config", token);
    if (res?.ok && res.data) {
      setConfig(res.data);
      setForm({
        enabled: Boolean(res.data.enabled),
        intervalHours: String(res.data.intervalHours ?? 12),
        retentionDays: String(res.data.retentionDays ?? 30),
        allowManualRun: Boolean(res.data.allowManualRun),
      });
    }
  }

  async function handleSaveConfig() {
    const token = getToken();
    if (!token) {
      setConfigMessage("Sessão expirada. Faça login novamente.");
      return;
    }
    if (storageUnavailable) {
      setConfigMessage("A persistencia da coleta ainda nao esta disponivel neste banco.");
      return;
    }
    const intervalHours = Number(form.intervalHours);
    const retentionDays = Number(form.retentionDays);
    if (!Number.isFinite(intervalHours) || intervalHours < 1) {
      setConfigMessage("Informe um intervalo automático válido em horas.");
      return;
    }
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      setConfigMessage("Informe uma retenção válida em dias.");
      return;
    }
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const res = await apiPost<{ ok: boolean; data?: CollectionConfig; error?: string }>(
        "/backup/veeam/collection/config",
        token,
        {
          enabled: form.enabled,
          intervalHours,
          retentionDays,
          allowManualRun: form.allowManualRun,
        },
      );
      if (!res?.ok || !res.data) {
        setConfigMessage(res?.error || "Falha ao salvar a configuração da coleta.");
        return;
      }
      setConfig(res.data);
      setConfigMessage("Configuração da coleta atualizada com sucesso.");
    } catch {
      setConfigMessage("Falha ao salvar a configuração da coleta.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRunManualCollection() {
    const token = getToken();
    if (!token) {
      setRunMessage("Sessão expirada. Faça login novamente.");
      return;
    }
    if (storageUnavailable) {
      setRunMessage("A coleta manual depende do schema novo aplicado no banco.");
      return;
    }
    const body: { companyId?: string; hostId?: string } = {};
    if (runScope === "company") {
      if (!companyId) {
        setRunMessage("Selecione uma empresa para rodar a coleta nesse escopo.");
        return;
      }
      body.companyId = companyId;
    }
    if (runScope === "host") {
      if (!companyId || !hostId) {
        setRunMessage("Selecione empresa e host para rodar a coleta nesse escopo.");
        return;
      }
      body.companyId = companyId;
      body.hostId = hostId;
    }

    setRunningCollection(true);
    setRunMessage(null);
    setLastRunResult(null);
    try {
      const res = await apiPost<{ ok: boolean; data?: CollectionRunResult; error?: string }>(
        "/backup/veeam/collection/run",
        token,
        body,
      );
      if (!res?.ok || !res.data) {
        setRunMessage(res?.error || "Falha ao executar a coleta manual.");
        return;
      }
      setLastRunResult(res.data);
      const errorsCount = Array.isArray(res.data.errors) ? res.data.errors.length : 0;
      setRunMessage(
        `Coleta manual concluída. Hosts consultados: ${res.data.hostsConsidered}. Novos snapshots: ${res.data.snapshotsCreated}. Atualizados: ${res.data.snapshotsUpdated}. Falhas: ${errorsCount}.`,
      );
      await Promise.all([refreshConfig(), loadHistory(companyId, hostId)]);
    } catch {
      setRunMessage("Falha ao executar a coleta manual.");
    } finally {
      setRunningCollection(false);
    }
  }

  return (
    <main>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Coleta Veeam</h1>
          <p className="mt-2 text-sm text-gray-700">
            Ajuste a coleta automática do histórico do Veeam e rode coletas manuais quando precisar atualizar os dados na hora.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/gestao/backup"
            className="rounded border border-border bg-card px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Voltar
          </Link>
          <Link
            href="/gestao/backup/repositorios"
            className="rounded border border-border bg-card px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Repositórios
          </Link>
        </div>
      </div>

      {pageError ? (
        <div className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</div>
      ) : null}

      {storageNotice ? (
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{storageNotice}</div>
      ) : null}

      <section className="mt-6 rounded border border-border bg-card p-6 shadow">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded border border-dashed border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-500">Última execução</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{formatDateTime(config?.lastRunAt)}</div>
          </div>
          <div className="rounded border border-dashed border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-500">Último sucesso</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{formatDateTime(config?.lastSuccessAt)}</div>
          </div>
          <div className="rounded border border-dashed border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-500">Próximo intervalo</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{config?.intervalHours ?? 12}h</div>
          </div>
          <div className="rounded border border-dashed border-gray-200 px-4 py-3">
            <div className="text-sm text-gray-500">Retenção</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{config?.retentionDays ?? 30} dias</div>
          </div>
        </div>
        {config?.lastError && !storageUnavailable ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {config.lastError}
          </div>
        ) : null}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded border border-border bg-card p-6 shadow">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Coleta automática</h2>
              <p className="mt-1 text-sm text-gray-600">
                Defina se a rotina fica ativa, o intervalo em horas e por quantos dias os snapshots serão mantidos.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-800">Coleta automática habilitada</span>
            </label>
            <label className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3">
              <input
                type="checkbox"
                checked={form.allowManualRun}
                onChange={(event) => setForm((current) => ({ ...current, allowManualRun: event.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-800">Permitir coleta manual</span>
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-gray-700">Intervalo automático (horas)</div>
              <input
                value={form.intervalHours}
                onChange={(event) => setForm((current) => ({ ...current, intervalHours: event.target.value }))}
                type="number"
                min={1}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-gray-700">Retenção inicial (dias)</div>
              <input
                value={form.retentionDays}
                onChange={(event) => setForm((current) => ({ ...current, retentionDays: event.target.value }))}
                type="number"
                min={1}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || loadingPage || storageUnavailable}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingConfig ? "Salvando..." : "Salvar configuração"}
            </button>
            {configMessage ? <span className="text-sm text-gray-700">{configMessage}</span> : null}
          </div>
        </section>

        <section className="rounded border border-border bg-card p-6 shadow">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Coleta manual</h2>
            <p className="mt-1 text-sm text-gray-600">
              Dispare uma coleta global, por empresa ou por host para atualizar os snapshots sem esperar o próximo ciclo automático.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { id: "global", label: "Todas as empresas" },
                { id: "company", label: "Empresa selecionada" },
                { id: "host", label: "Host selecionado" },
              ].map((option) => (
                <label key={option.id} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="runScope"
                    checked={runScope === option.id}
                    onChange={() => setRunScope(option.id as RunScope)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-gray-700">Empresa</div>
                <select
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
                >
                  <option value="">Todas</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.fantasyName || company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-gray-700">Host Veeam / Zabbix</div>
                <select
                  value={hostId}
                  onChange={(event) => setHostId(event.target.value)}
                  disabled={!companyId || loadingHosts}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">{loadingHosts ? "Carregando..." : "Todos"}</option>
                  {hosts.map((host) => (
                    <option key={host.hostId} value={host.hostId}>
                      {host.name || host.host}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Escopo atual:{" "}
              {runScope === "global"
                ? "todas as empresas com integração ativa"
                : runScope === "company"
                  ? `empresa ${selectedCompanyLabel}`
                  : hostId
                    ? `host ${hosts.find((item) => item.hostId === hostId)?.name || hostId}`
                    : "selecione uma empresa e um host"}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRunManualCollection}
                disabled={runningCollection || loadingPage || storageUnavailable}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {runningCollection ? "Executando..." : "Rodar coleta manual"}
              </button>
              {runMessage ? <span className="text-sm text-gray-700">{runMessage}</span> : null}
            </div>

            {hostsError ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{hostsError}</div>
            ) : null}

            {lastRunResult ? (
              <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <div>Início: {formatDateTime(lastRunResult.startedAt)}</div>
                <div>Fim: {formatDateTime(lastRunResult.finishedAt)}</div>
                <div>Hosts consultados: {lastRunResult.hostsConsidered}</div>
                <div>Snapshots novos: {lastRunResult.snapshotsCreated}</div>
                <div>Snapshots atualizados: {lastRunResult.snapshotsUpdated}</div>
                <div>Snapshots sem alteração: {lastRunResult.snapshotsUnchanged}</div>
                <div>Snapshots removidos pela retenção: {lastRunResult.deletedSnapshots}</div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded border border-border bg-card p-6 shadow">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Histórico recente</h2>
            <p className="mt-1 text-sm text-gray-600">
              Últimos snapshots persistidos da coleta Veeam. Use os filtros acima para restringir por empresa ou host.
            </p>
          </div>
          <button
            onClick={() => void loadHistory(companyId, hostId)}
            disabled={loadingHistory}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingHistory ? "Atualizando..." : "Atualizar histórico"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Host</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Origem</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Histórico do item</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Persistido em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    {loadingHistory ? "Carregando histórico..." : "Nenhum snapshot persistido até o momento."}
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-gray-800">{row.company?.fantasyName || row.company?.name || row.companyId}</td>
                    <td className="px-3 py-2 text-gray-800">{row.zabbixHostName || row.zabbixHostId}</td>
                    <td className="px-3 py-2 text-gray-600">{row.triggerType === "manual" ? "Manual" : "Automática"}</td>
                    <td className="px-3 py-2 text-gray-600">{formatClock(row.sourceClock)}</td>
                    <td className="px-3 py-2 text-gray-600">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
