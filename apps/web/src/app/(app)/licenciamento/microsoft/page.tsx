"use client";

import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import {
  Company,
  MicrosoftAgreement,
  MicrosoftConnection,
  MicrosoftCustomerMap,
  MicrosoftOverviewContext,
  MicrosoftSyncRun,
  agreementTypeLabel,
  daysUntil,
  expirationLabel,
  expirationTone,
  formatBillingPeriod,
  formatCurrency,
  formatDate,
  formatDateTime,
  microsoftAgreementStatuses,
  microsoftProviders,
  microsoftSubscriptionTypes,
  statusLabel,
  statusTone,
} from "./_lib";

type ApiList<T> = { ok: boolean; data?: T; error?: string };

type ConnectionDraft = {
  environment: string;
  apiBaseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiPass: string;
  marketplace: string;
  clientId: string;
  clientSecret: string;
  customerNumber: string;
  countryCode: string;
  senderId: string;
  apiKey: string;
};

type MapEditorState = {
  id: string;
  companyId: string;
  notes: string;
};

type ScheduleDraft = {
  enabled: boolean;
  intervalHours: number;
};

const emptyScheduleDraft: ScheduleDraft = { enabled: false, intervalHours: 6 };

const syncFrequencyOptions = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 168];

function formatFrequencyLabel(hours: number) {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days} dia${days > 1 ? "s" : ""} (${hours}h)`;
}

const emptyConnectionDraft: ConnectionDraft = {
  environment: "production",
  apiBaseUrl: "",
  subscriptionKey: "",
  apiUser: "",
  apiPass: "",
  marketplace: "br",
  clientId: "",
  clientSecret: "",
  customerNumber: "",
  countryCode: "",
  senderId: "",
  apiKey: "",
};

function isActiveSubscription(item: MicrosoftAgreement) {
  return String(item.providerStatus || "").toLowerCase() === "active";
}

export default function MicrosoftLicPage() {
  const token = typeof window !== "undefined" ? getToken() : null;
  const user = typeof window !== "undefined" ? getUser() : null;

  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agreements, setAgreements] = useState<MicrosoftAgreement[]>([]);
  const [connections, setConnections] = useState<MicrosoftConnection[]>([]);
  const [customerMaps, setCustomerMaps] = useState<MicrosoftCustomerMap[]>([]);
  const [syncRuns, setSyncRuns] = useState<MicrosoftSyncRun[]>([]);
  const [overviewContext, setOverviewContext] = useState<MicrosoftOverviewContext | null>(null);
  const [syncingProviders, setSyncingProviders] = useState<string[]>([]);

  const [companyId, setCompanyId] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [onlyExpiringDays, setOnlyExpiringDays] = useState("30");
  const [activeView, setActiveView] = useState<"overview" | "connections" | "maps" | "sync">("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, ConnectionDraft>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [savingSchedule, setSavingSchedule] = useState<string[]>([]);
  const [mapEditor, setMapEditor] = useState<MapEditorState | null>(null);
  const [syncPage, setSyncPage] = useState(1);
  const [syncTotalPages, setSyncTotalPages] = useState(1);

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!res?.data?.isGlobalAdmin;
          setIsAdminOrTech(isGlobalAdmin || memberships.some((item) => item.role === "ADMIN" || item.role === "TECHNICIAN" || item.role === "COMERCIAL"));
        } catch {}
      }

      const companyRes = await apiGet<ApiList<any[]>>("/companies", token);
      const nextCompanies = companyRes?.ok ? (companyRes.data || []).map((item: any) => ({ id: item.id, name: item.name })) : [];
      setCompanies(nextCompanies);
      if (nextCompanies.length === 1) setCompanyId(nextCompanies[0].id);
      setLoading(false);
    })();
  }, [token, user?.id]);

  useEffect(() => {
    if (!token || loading) return;
    void refreshData();
  }, [token, loading, isAdminOrTech, companyId, provider, status, type, onlyExpiringDays]);

  useEffect(() => {
    setSyncPage(1);
  }, [provider]);

  useEffect(() => {
    if (!token || loading || !isAdminOrTech) return;
    void refreshSyncRuns(syncPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPage]);

  useEffect(() => {
    if (!token || loading) return;
    const handle = setTimeout(() => {
      void refreshAgreements();
    }, 250);
    return () => clearTimeout(handle);
  }, [token, loading, search]);

  useEffect(() => {
    if (!token || !isAdminOrTech || syncingProviders.length === 0) return;
    const handle = window.setInterval(() => {
      void Promise.all([refreshSyncRuns(), refreshOverviewContext()]);
    }, 2000);
    return () => window.clearInterval(handle);
  }, [token, isAdminOrTech, syncingProviders.length, provider, companyId]);

  async function refreshData() {
    await refreshAgreements();
    if (isAdminOrTech) {
      await Promise.all([refreshConnections(), refreshCustomerMaps(), refreshSyncRuns(), refreshOverviewContext()]);
    }
  }

  async function refreshAgreements() {
    if (!token) return;
    const query = new URLSearchParams();
    if (companyId) query.set("companyId", companyId);
    if (provider) query.set("provider", provider);
    if (status) query.set("status", status);
    if (type) query.set("type", type);
    if (search) query.set("search", search);
    if (onlyExpiringDays) query.set("onlyExpiringDays", onlyExpiringDays);
    const res = await apiGet<ApiList<MicrosoftAgreement[]>>(`/licensing/microsoft/agreements?${query.toString()}`, token);
    if (res?.ok) setAgreements(res.data || []);
  }

  async function refreshConnections() {
    if (!token) return;
    const res = await apiGet<ApiList<MicrosoftConnection[]>>("/licensing/microsoft/connections", token);
    if (!res?.ok) return;
    const nextConnections = res.data || [];
    setConnections(nextConnections);
    setConnectionDrafts((current) => {
      const next = { ...current };
      for (const item of nextConnections) {
        next[item.provider] = {
          environment: item.environment || "production",
          apiBaseUrl: item.apiBaseUrl || "",
          subscriptionKey: "",
          apiUser: item.apiUser || "",
          apiPass: "",
          marketplace: item.marketplace || "br",
          clientId: item.clientId || "",
          clientSecret: "",
          customerNumber: item.customerNumber || "",
          countryCode: item.countryCode || "",
          senderId: item.senderId || "",
          apiKey: "",
        };
      }
      return next;
    });
    setScheduleDrafts((current) => {
      const next = { ...current };
      for (const item of nextConnections) {
        // Não sobrescreve enquanto o usuário está editando (evita "puxar" o valor de volta durante o polling).
        if (savingSchedule.includes(item.provider)) continue;
        next[item.provider] = {
          enabled: !!item.autoSyncEnabled,
          intervalHours: item.autoSyncIntervalHours || emptyScheduleDraft.intervalHours,
        };
      }
      return next;
    });
  }

  async function refreshCustomerMaps() {
    if (!token) return;
    const query = new URLSearchParams();
    if (provider) query.set("provider", provider);
    const res = await apiGet<ApiList<MicrosoftCustomerMap[]>>(`/licensing/microsoft/customer-maps?${query.toString()}`, token);
    if (res?.ok) setCustomerMaps(res.data || []);
  }

  async function refreshSyncRuns(page = syncPage) {
    if (!token) return;
    const query = new URLSearchParams();
    if (provider) query.set("provider", provider);
    query.set("page", String(page));
    query.set("pageSize", "10");
    const res = await apiGet<ApiList<MicrosoftSyncRun[]> & { page?: number; totalPages?: number }>(
      `/licensing/microsoft/sync-runs?${query.toString()}`,
      token,
    );
    if (res?.ok) {
      setSyncRuns(res.data || []);
      setSyncTotalPages(res.totalPages || 1);
      if (res.page) setSyncPage(res.page);
    }
  }

  async function refreshOverviewContext() {
    if (!token) return;
    const query = new URLSearchParams();
    if (provider) query.set("provider", provider);
    if (companyId) query.set("companyId", companyId);
    const res = await apiGet<ApiList<MicrosoftOverviewContext>>(`/licensing/microsoft/overview-context?${query.toString()}`, token);
    if (res?.ok && res.data) setOverviewContext(res.data);
  }

  function setToast(type: "success" | "error", text: string) {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 5000);
  }

  function updateConnectionDraft(providerKey: string, field: keyof ConnectionDraft, value: string) {
    setConnectionDrafts((current) => ({
      ...current,
      [providerKey]: {
        ...(current[providerKey] || emptyConnectionDraft),
        [field]: value,
      },
    }));
  }

  async function saveConnection(providerKey: string) {
    if (!token) return;
    const body = connectionDrafts[providerKey] || emptyConnectionDraft;
    const res = await apiPost<ApiList<any>>(`/licensing/microsoft/connections/${providerKey}`, token, body);
    if (!res?.ok) {
      setToast("error", res?.error || `Falha ao salvar conexão ${providerKey}.`);
      return;
    }
    await refreshConnections();
    setToast("success", `${statusLabel(providerKey)} salva com sucesso.`);
  }

  function updateScheduleDraft(providerKey: string, patch: Partial<ScheduleDraft>) {
    setScheduleDrafts((current) => ({
      ...current,
      [providerKey]: { ...(current[providerKey] || emptyScheduleDraft), ...patch },
    }));
  }

  async function saveSchedule(providerKey: string) {
    if (!token) return;
    const draft = scheduleDrafts[providerKey] || emptyScheduleDraft;
    setSavingSchedule((current) => (current.includes(providerKey) ? current : [...current, providerKey]));
    try {
      const res = await apiPut<ApiList<MicrosoftConnection>>(`/licensing/microsoft/connections/${providerKey}/schedule`, token, {
        enabled: draft.enabled,
        intervalHours: draft.intervalHours,
      });
      if (!res?.ok) {
        setToast("error", res?.error || `Falha ao salvar o agendamento de ${statusLabel(providerKey)}.`);
        return;
      }
      await refreshConnections();
      setToast("success", draft.enabled ? `Sincronização automática habilitada para ${statusLabel(providerKey)}.` : `Sincronização automática desabilitada para ${statusLabel(providerKey)}.`);
    } finally {
      setSavingSchedule((current) => current.filter((item) => item !== providerKey));
    }
  }

  async function testConnection(providerKey: string) {
    if (!token) return;
    const res = await apiPost<ApiList<any>>(`/licensing/microsoft/connections/${providerKey}/test`, token, {});
    await refreshConnections();
    if (res?.ok) setToast("success", `${statusLabel(providerKey)} validada com sucesso.`);
    else setToast("error", res?.error || `Falha ao testar ${statusLabel(providerKey)}.`);
  }

  async function syncProvider(providerKey: string) {
    if (!token) return;
    setSyncingProviders((current) => (current.includes(providerKey) ? current : [...current, providerKey]));
    await refreshSyncRuns();
    try {
      const res = await apiPost<ApiList<any>>(`/licensing/microsoft/connections/${providerKey}/sync`, token, {});
      await Promise.all([refreshConnections(), refreshSyncRuns(), refreshCustomerMaps(), refreshAgreements(), refreshOverviewContext()]);
      if (res?.ok) setToast("success", `${statusLabel(providerKey)} sincronizada com sucesso.`);
      else setToast("error", res?.error || `Falha ao sincronizar ${statusLabel(providerKey)}.`);
    } finally {
      setSyncingProviders((current) => current.filter((item) => item !== providerKey));
      await refreshSyncRuns();
    }
  }

  async function removeAgreement(id: string) {
    if (!token || !window.confirm("Excluir este acordo manual?")) return;
    const res = await apiDelete<ApiList<any>>(`/licensing/microsoft/agreements/${id}`, token);
    if (!res?.ok) {
      setToast("error", res?.error || "Falha ao excluir o acordo.");
      return;
    }
    await refreshAgreements();
    setToast("success", "Acordo manual removido.");
  }

  function startMapEditor(item: MicrosoftCustomerMap) {
    setMapEditor({
      id: item.id,
      companyId: item.companyId || item.suggestedCompanyId || "",
      notes: item.notes || "",
    });
  }

  async function saveMapEditor() {
    if (!token || !mapEditor?.companyId) return;
    const res = await apiPost<ApiList<any>>(`/licensing/microsoft/customer-maps/${mapEditor.id}/confirm`, token, {
      companyId: mapEditor.companyId,
      notes: mapEditor.notes,
    });
    if (!res?.ok) {
      setToast("error", res?.error || "Falha ao salvar o mapeamento.");
      return;
    }
    setMapEditor(null);
    await Promise.all([refreshCustomerMaps(), refreshAgreements(), refreshOverviewContext()]);
    setToast("success", "Mapeamento salvo.");
  }

  async function markMapReview(id: string) {
    if (!token) return;
    const res = await apiPost<ApiList<any>>(`/licensing/microsoft/customer-maps/${id}/review`, token, {});
    if (!res?.ok) {
      setToast("error", res?.error || "Falha ao marcar para revisão.");
      return;
    }
    await refreshCustomerMaps();
    setToast("success", "Mapeamento marcado para revisão.");
  }

  async function clearMap(id: string) {
    if (!token) return;
    const res = await apiPost<ApiList<any>>(`/licensing/microsoft/customer-maps/${id}/ignore`, token, {});
    if (!res?.ok) {
      setToast("error", res?.error || "Falha ao desfazer o vínculo.");
      return;
    }
    if (mapEditor?.id === id) setMapEditor(null);
    await Promise.all([refreshCustomerMaps(), refreshAgreements()]);
    setToast("success", "Vínculo removido.");
  }

  function exportCsv() {
    const header = [
      "Empresa",
      "Cliente externo",
      "Produto",
      "Categoria",
      "Quantidade",
      "Cobranca",
      "Valor da cobranca",
      "Data de criacao",
      "Data de expiracao",
      "Status",
      "Tipo",
      "Subscription ID",
      "Vendor Subscription ID",
      "MPN",
    ];
    const rows = agreements.map((item) => [
      item.companyName || "",
      item.externalCustomerName || "",
      item.productName || "",
      item.category || "",
      item.quantityPurchased ?? "",
      formatBillingPeriod(item.billingModel),
      item.billingAmount ?? "",
      formatDate(item.startDate || item.createdAt),
      formatDate(item.expiresAt),
      statusLabel(item.providerStatus || item.status),
      agreementTypeLabel(item),
      item.externalSubscriptionId || "",
      item.vendorSubscriptionId || "",
      item.mpn || item.sku || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "microsoft-subscriptions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(() => {
    const active = agreements.filter((item) => isActiveSubscription(item));
    const recurring = active.filter((item) => item.isRecurring);
    const nonRecurring = active.filter((item) => !item.isRecurring);
    const renewing30 = recurring.filter((item) => {
      const days = daysUntil(item.renewalDate);
      return days != null && days >= 0 && days <= 30;
    });
    return {
      active: active.length,
      renewing30: renewing30.length,
      recurring: recurring.length,
      nonRecurring: nonRecurring.length,
    };
  }, [agreements]);

  const selectedProviderLabel = microsoftProviders.find((item) => item.value === provider)?.label || "Todos os fornecedores";
  const visibleProviders = useMemo(() => microsoftProviders.filter((item) => !provider || item.value === provider), [provider]);
  const filteredCustomerMaps = useMemo(() => customerMaps.filter((item) => !provider || item.provider === provider), [customerMaps, provider]);
  const filteredSyncRuns = useMemo(() => syncRuns.filter((item) => !provider || item.provider === provider), [syncRuns, provider]);
  const selectedMap = useMemo(() => filteredCustomerMaps.find((item) => item.id === mapEditor?.id) || null, [filteredCustomerMaps, mapEditor?.id]);
  const sortedAgreements = useMemo(() => {
    return [...agreements].sort((a, b) => {
      const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.productName || "").localeCompare(String(b.productName || ""), "pt-BR");
    });
  }, [agreements]);
  const runningSyncProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const item of filteredSyncRuns) {
      if (String(item.status || "").toUpperCase() === "RUNNING") providers.add(item.provider);
    }
    for (const item of syncingProviders) {
      if (!provider || item === provider) providers.add(item);
    }
    return Array.from(providers);
  }, [filteredSyncRuns, syncingProviders, provider]);

  if (!token) {
    return <div className="p-4 text-sm text-muted">Faça login para acessar o módulo Microsoft.</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Licenciamento - Microsoft</h1>
          <p className="text-sm text-muted">Assinaturas, renovação, mapeamento de clientes externos e integrações com distribuidores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdminOrTech && (
            <a href="/licenciamento/microsoft/nova" className="px-3 py-2 rounded bg-primary text-white">
              Novo acordo manual
            </a>
          )}
          {isAdminOrTech && provider && (
            <button onClick={() => syncProvider(provider)} className="px-3 py-2 rounded bg-border text-text">
              Sincronizar agora
            </button>
          )}
          <button onClick={exportCsv} className="px-3 py-2 rounded bg-border text-text">
            Exportar CSV
          </button>
        </div>
      </div>

      {message && <div className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>{message.text}</div>}

      <div className="bg-card border border-border rounded p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <FieldSelect
            label="Empresa"
            value={companyId}
            onChange={setCompanyId}
            options={[{ value: "", label: "Todas" }, ...companies.map((item) => ({ value: item.id, label: item.name }))]}
          />
          <FieldSelect
            label="Fornecedor"
            value={provider}
            onChange={setProvider}
            options={[{ value: "", label: "Todos" }, ...microsoftProviders.map((item) => ({ value: item.value, label: item.label }))]}
          />
          <FieldSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "Todos" }, ...microsoftAgreementStatuses.map((item) => ({ value: item, label: statusLabel(item) }))]}
          />
          <FieldSelect
            label="Tipo"
            value={type}
            onChange={setType}
            options={microsoftSubscriptionTypes.map((item) => ({ value: item === "Todos" ? "" : item, label: item }))}
          />
          <FieldSelect
            label="Janela de renovação"
            value={onlyExpiringDays}
            onChange={setOnlyExpiringDays}
            options={[
              { value: "", label: "Sem filtro" },
              { value: "30", label: "30 dias" },
              { value: "60", label: "60 dias" },
              { value: "90", label: "90 dias" },
            ]}
          />
          <div>
            <label className="block text-sm mb-1">Busca</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Produto, cliente, MPN, SKU, IDs..."
              className="w-full border border-border rounded px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Assinaturas ativas" value={String(stats.active)} helper="Somente status ativo" />
          <StatCard label="Renovam em 30 dias" value={String(stats.renewing30)} helper="Ativas e recorrentes" />
          <StatCard label="Recorrentes" value={String(stats.recurring)} helper="Com renovação controlada" />
          <StatCard label="Não recorrentes" value={String(stats.nonRecurring)} helper="Sem renovação recorrente" />
        </div>
        <div className="bg-card border border-border rounded p-4">
          <div className="text-xs text-muted mb-2">Contexto atual</div>
          {!provider ? (
            <div className="space-y-3 text-sm">
              <div className="font-medium">Todos os fornecedores</div>
              {(overviewContext?.integrations || connections).map((item) => (
                <div key={item.provider} className="border border-border rounded p-3">
                  <div className="font-medium">{statusLabel(item.provider)}</div>
                  <div className="text-xs text-muted mt-1">
                    <span className={`inline-flex px-2 py-1 rounded ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                  </div>
                  <div className="text-xs text-muted mt-1">Última sincronização: {formatDate(item.lastSyncAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{selectedProviderLabel}</div>
              <div>
                <span className={`inline-flex px-2 py-1 rounded text-xs ${statusTone(connections.find((item) => item.provider === provider)?.status)}`}>
                  {statusLabel(connections.find((item) => item.provider === provider)?.status)}
                </span>
              </div>
              <div className="text-xs text-muted">Clientes externos: {overviewContext?.externalCustomers ?? filteredCustomerMaps.length}</div>
              <div className="text-xs text-muted">Assinaturas ativas: {overviewContext?.activeSubscriptions ?? stats.active}</div>
              <div className="text-xs text-muted">Última sincronização: {formatDate(overviewContext?.latestSyncRun?.finishedAt || connections.find((item) => item.provider === provider)?.lastSyncAt)}</div>
              <div className="text-xs text-muted">
                Última execução: {overviewContext?.latestSyncRun ? statusLabel(overviewContext.latestSyncRun.status) : "-"}
              </div>
              <div className="text-xs text-muted">Erros: {overviewContext?.latestSyncRun?.errorCount ?? 0}</div>
            </div>
          )}
        </div>
      </div>

      {isAdminOrTech && (
        <div className="bg-card border border-border rounded p-2">
          <div className="flex flex-wrap gap-2">
            <ViewButton label="Visão geral" active={activeView === "overview"} onClick={() => setActiveView("overview")} />
            <ViewButton label="Integrações" active={activeView === "connections"} onClick={() => setActiveView("connections")} />
            <ViewButton label="Mapeamentos" active={activeView === "maps"} onClick={() => setActiveView("maps")} />
            <ViewButton label="Histórico sync" active={activeView === "sync"} onClick={() => setActiveView("sync")} />
          </div>
        </div>
      )}

      {(!isAdminOrTech || activeView === "overview") && (
        <div className="bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Assinaturas de licenciamento</h2>
            <span className="text-xs text-muted">{sortedAgreements.length} registro(s)</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[1180px] table-fixed">
              <thead>
                <tr className="text-center border-b border-border">
                  <th className="py-2 w-[18%]">Empresa</th>
                  <th className="py-2 w-[19%]">Produto</th>
                  <th className="py-2 w-[8%]">Categoria</th>
                  <th className="py-2 w-[6%] text-center">QTD</th>
                  <th className="py-2 w-[11%] text-center">Compromisso</th>
                  <th className="py-2 w-[11%]">Cobrança</th>
                  <th className="py-2 w-[8%] text-center">Criação</th>
                  <th className="py-2 w-[8%] text-center">Expiração</th>
                  <th className="py-2 w-[6%]">Status</th>
                  <th className="py-2 w-[5%]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgreements.map((item) => {
                  const expirationDays = daysUntil(item.expiresAt);
                  return (
                    <tr key={item.id} className="border-b border-border align-middle">
                      <td className="py-3 align-middle text-center">
                        <div>{item.companyName || "Não mapeado"}</div>
                        <div className="text-xs text-muted">{titleCase(item.externalCustomerName) || "—"}</div>
                        <div className="text-xs text-muted">{item.microsoftDomain || item.tenantDomain || "—"}</div>
                      </td>
                      <td className="py-3 align-middle text-center">
                        <div className="font-medium whitespace-normal break-words leading-snug">{item.productName}</div>
                        <div className="text-xs text-muted whitespace-normal break-words leading-snug">{item.mpn || item.sku || "—"}</div>
                      </td>
                      <td className="py-3 align-middle text-center">
                        <div className="whitespace-normal break-words leading-snug">{item.category || "Outros"}</div>
                        <div className="text-xs text-muted whitespace-normal break-words leading-snug">{agreementTypeLabel(item)}</div>
                      </td>
                      <td className="py-3 text-center align-middle">
                        <div className="font-medium">{item.quantityPurchased ?? "—"}</div>
                      </td>
                      <td className="py-3 text-center align-middle">
                        <div>{formatBillingPeriod(item.subscriptionPeriod)}</div>
                      </td>
                      <td className="py-3 align-middle text-center">
                        <div>{formatCurrency(item.billingAmount ?? item.totalPrice, item.currency)}</div>
                        <div className="text-xs text-muted">{formatBillingPeriod(item.billingModel)}</div>
                      </td>
                      <td className="py-3 text-center align-middle">
                        <div>{formatDate(item.startDate || item.createdAt)}</div>
                      </td>
                      <td className="py-3 text-center align-middle">
                        <div className={`font-medium ${expirationTone(expirationDays)}`}>{expirationLabel(expirationDays)}</div>
                        <div className="text-xs text-muted">{formatDate(item.expiresAt)}</div>
                      </td>
                      <td className="py-3 align-middle">
                        <span className={`inline-flex px-2 py-1 rounded text-xs ${statusTone(item.providerStatus || item.status)}`}>
                          {statusLabel(item.providerStatus || item.status)}
                        </span>
                      </td>
                      <td className="py-3 align-middle">
                        <div className="flex flex-wrap gap-2">
                          <a href={`/licenciamento/microsoft/${item.id}`} className="px-2 py-1 rounded bg-border text-text">
                            Abrir
                          </a>
                          {isAdminOrTech && !item.isReadOnly && (
                            <>
                              <a href={`/licenciamento/microsoft/${item.id}/editar`} className="px-2 py-1 rounded bg-primary text-white">
                                Editar
                              </a>
                              <button onClick={() => removeAgreement(item.id)} className="px-2 py-1 rounded bg-red-600 text-white">
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedAgreements.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-sm text-muted">
                      Nenhuma assinatura encontrada com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdminOrTech && activeView === "connections" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visibleProviders.map((item) => {
            const connection = connections.find((entry) => entry.provider === item.value);
            const draft = connectionDrafts[item.value] || emptyConnectionDraft;
            return (
              <div key={item.value} className="bg-card border border-border rounded p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-semibold">{item.label}</h2>
                    <div className="text-xs text-muted">
                      Status atual: <span className={`inline-flex px-2 py-1 rounded ${statusTone(connection?.status)}`}>{statusLabel(connection?.status)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    Último teste: {formatDate(connection?.lastTestAt)}
                    <br />
                    Último sync: {formatDate(connection?.lastSyncAt)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {item.value === "INGRAM" ? (
                    <>
                      <Input label="API URL" value={draft.apiBaseUrl} onChange={(value) => updateConnectionDraft(item.value, "apiBaseUrl", value)} />
                      <Input
                        label={connection?.hasSubscriptionKey ? `Chave (${connection.maskedSubscriptionKey})` : "Chave"}
                        value={draft.subscriptionKey}
                        type="password"
                        onChange={(value) => updateConnectionDraft(item.value, "subscriptionKey", value)}
                      />
                      <Input label="Usuário" value={draft.apiUser} onChange={(value) => updateConnectionDraft(item.value, "apiUser", value)} />
                      <Input
                        label={connection?.hasApiPass ? `Senha (${connection.maskedApiPass})` : "Senha"}
                        value={draft.apiPass}
                        type="password"
                        onChange={(value) => updateConnectionDraft(item.value, "apiPass", value)}
                      />
                      <Input label="País" value={draft.marketplace} onChange={(value) => updateConnectionDraft(item.value, "marketplace", value.toLowerCase())} />
                    </>
                  ) : (
                    <>
                      <Input label="Ambiente" value={draft.environment} onChange={(value) => updateConnectionDraft(item.value, "environment", value)} />
                      <Input label="Client ID" value={draft.clientId} onChange={(value) => updateConnectionDraft(item.value, "clientId", value)} />
                      <Input
                        label={connection?.hasClientSecret ? `Client Secret (${connection.maskedClientSecret})` : "Client Secret"}
                        value={draft.clientSecret}
                        type="password"
                        onChange={(value) => updateConnectionDraft(item.value, "clientSecret", value)}
                      />
                      <Input label="Customer Number" value={draft.customerNumber} onChange={(value) => updateConnectionDraft(item.value, "customerNumber", value)} />
                      <Input label="Country Code" value={draft.countryCode} onChange={(value) => updateConnectionDraft(item.value, "countryCode", value.toUpperCase())} />
                      <Input label="Sender ID" value={draft.senderId} onChange={(value) => updateConnectionDraft(item.value, "senderId", value)} />
                      <Input
                        label={connection?.hasApiKey ? `API Key (${connection.maskedApiKey})` : "API Key"}
                        value={draft.apiKey}
                        type="password"
                        onChange={(value) => updateConnectionDraft(item.value, "apiKey", value)}
                      />
                    </>
                  )}
                </div>

                {connection?.lastError && <div className="mt-3 text-sm text-red-600">{connection.lastError}</div>}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => saveConnection(item.value)} className="px-3 py-2 rounded bg-primary text-white">
                    Salvar conexão
                  </button>
                  <button onClick={() => testConnection(item.value)} className="px-3 py-2 rounded bg-border text-text">
                    Testar
                  </button>
                  <button onClick={() => syncProvider(item.value)} disabled={syncingProviders.includes(item.value)} className="px-3 py-2 rounded bg-border text-text disabled:opacity-60">
                    {syncingProviders.includes(item.value) ? "Sincronizando..." : "Sincronizar agora"}
                  </button>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-sm font-medium mb-2">Sincronização automática</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(scheduleDrafts[item.value] || emptyScheduleDraft).enabled}
                        onChange={(e) => updateScheduleDraft(item.value, { enabled: e.target.checked })}
                      />
                      Habilitada
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      A cada
                      <select
                        value={(scheduleDrafts[item.value] || emptyScheduleDraft).intervalHours}
                        onChange={(e) => updateScheduleDraft(item.value, { intervalHours: Number(e.target.value) })}
                        disabled={!(scheduleDrafts[item.value] || emptyScheduleDraft).enabled}
                        className="px-2 py-1 rounded border border-border bg-card text-text disabled:opacity-60"
                      >
                        {syncFrequencyOptions.map((hours) => (
                          <option key={hours} value={hours}>
                            {formatFrequencyLabel(hours)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => saveSchedule(item.value)}
                      disabled={savingSchedule.includes(item.value)}
                      className="px-3 py-2 rounded bg-border text-text disabled:opacity-60"
                    >
                      {savingSchedule.includes(item.value) ? "Salvando..." : "Salvar agendamento"}
                    </button>
                  </div>
                  {connection?.autoSyncEnabled && (
                    <div className="mt-2 text-xs text-muted">
                      Próxima sincronização automática: {formatDateTime(connection.nextSyncAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdminOrTech && activeView === "maps" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="bg-card border border-border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Mapeamentos</h2>
              <span className="text-xs text-muted">{filteredCustomerMaps.length} registro(s)</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-2">Cliente externo</th>
                    <th className="py-2">ID externo</th>
                    <th className="py-2">Tenant detectado</th>
                    <th className="py-2">Empresa Tech Hub</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerMaps.map((item) => (
                    <tr key={item.id} className="border-b border-border align-top">
                      <td className="py-3">
                        <div>{titleCase(item.externalCustomerName)}</div>
                        <div className="text-xs text-muted">{statusLabel(item.provider)}</div>
                      </td>
                      <td className="py-3">{item.externalCustomerId}</td>
                      <td className="py-3">{item.externalTenantDomain || "—"}</td>
                      <td className="py-3">{item.companyName || "—"}</td>
                      <td className="py-3">
                        <span className={`inline-flex px-2 py-1 rounded text-xs ${statusTone(item.matchStatus)}`}>
                          {statusLabel(item.matchStatus)}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => startMapEditor(item)} className="px-2 py-1 rounded bg-border text-text">
                            {item.companyId ? "Alterar" : "Mapear"}
                          </button>
                          <button onClick={() => markMapReview(item.id)} className="px-2 py-1 rounded bg-border text-text">
                            Revisar
                          </button>
                          {item.companyId && (
                            <button onClick={() => clearMap(item.id)} className="px-2 py-1 rounded bg-red-600 text-white">
                              Desvincular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomerMaps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-muted">
                        Nenhum cliente externo encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-border rounded p-4 sticky top-4 self-start">
            <h2 className="font-semibold mb-3">{selectedMap ? "Mapear cliente externo" : "Selecione um cliente externo"}</h2>
            {!selectedMap || !mapEditor ? (
              <div className="text-sm text-muted">Use os botões da lista para mapear ou revisar um cliente descoberto pela sincronização.</div>
            ) : (
              <div className="space-y-3">
                <ReadonlyField label="Fornecedor" value={statusLabel(selectedMap.provider)} />
                <ReadonlyField label="Cliente externo" value={titleCase(selectedMap.externalCustomerName)} />
                <ReadonlyField label="ID externo" value={selectedMap.externalCustomerId} />
                <ReadonlyField label="CNPJ detectado" value={selectedMap.externalTaxId || "—"} />
                <ReadonlyField label="Tenant detectado" value={selectedMap.externalTenantDomain || "—"} />

                {selectedMap.suggestedCompanyName && !selectedMap.companyId && (
                  <div className="border border-border rounded p-3 text-sm">
                    <div className="font-medium">Sugestão</div>
                    <div className="text-xs text-muted mt-1">
                      Possível empresa: {selectedMap.suggestedCompanyName}
                      {selectedMap.suggestedConfidence != null ? ` (${Math.round(selectedMap.suggestedConfidence * 100)}%)` : ""}
                    </div>
                    <button
                      onClick={() => setMapEditor((current) => (current ? { ...current, companyId: selectedMap.suggestedCompanyId || "" } : current))}
                      className="mt-2 px-2 py-1 rounded bg-border text-text"
                    >
                      Usar sugestão
                    </button>
                  </div>
                )}

                <FieldSelect
                  label="Empresa Tech Hub"
                  value={mapEditor.companyId}
                  onChange={(value) => setMapEditor((current) => (current ? { ...current, companyId: value } : current))}
                  options={[{ value: "", label: "Selecione..." }, ...companies.map((item) => ({ value: item.id, label: item.name }))]}
                />

                <div>
                  <label className="block text-sm mb-1">Notas</label>
                  <textarea
                    rows={4}
                    value={mapEditor.notes}
                    onChange={(e) => setMapEditor((current) => (current ? { ...current, notes: e.target.value } : current))}
                    className="w-full border border-border rounded px-3 py-2"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={saveMapEditor} disabled={!mapEditor.companyId} className="px-3 py-2 rounded bg-primary text-white disabled:opacity-60">
                    Salvar mapeamento
                  </button>
                  <button onClick={() => setMapEditor(null)} className="px-3 py-2 rounded bg-border text-text">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdminOrTech && activeView === "sync" && (
        <div className="bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Histórico de sincronização</h2>
            <span className="text-xs text-muted">Últimas execuções</span>
          </div>
          {runningSyncProviders.length > 0 && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sincronização em andamento: {runningSyncProviders.map((item) => statusLabel(item)).join(", ")}
            </div>
          )}
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[1180px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Data/hora</th>
                  <th className="py-2">Fornecedor</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Clientes externos</th>
                  <th className="py-2">Assinaturas</th>
                  <th className="py-2">Ativas</th>
                  <th className="py-2">Criadas</th>
                  <th className="py-2">Atualizadas</th>
                  <th className="py-2">Não encontradas</th>
                  <th className="py-2">Erros</th>
                  <th className="py-2">Duração</th>
                </tr>
              </thead>
              <tbody>
                {filteredSyncRuns.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-3">{formatDateTime(item.startedAt)}</td>
                    <td className="py-3">{statusLabel(item.provider)}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 rounded text-xs ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                    </td>
                    <td className="py-3">{item.customersProcessed}</td>
                    <td className="py-3">{item.subscriptionsFound}</td>
                    <td className="py-3">{item.activeSubscriptions}</td>
                    <td className="py-3">{item.recordsCreated}</td>
                    <td className="py-3">{item.recordsUpdated}</td>
                    <td className="py-3">{item.markedNotFound}</td>
                    <td className="py-3">{item.errorCount}</td>
                    <td className="py-3">{item.durationMs != null ? `${Math.round(item.durationMs / 1000)} s` : "—"}</td>
                  </tr>
                ))}
                {filteredSyncRuns.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-sm text-muted">
                      Nenhuma execução registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredSyncRuns[0]?.errorSummary && <div className="mt-3 text-sm text-muted">Resumo: {filteredSyncRuns[0].errorSummary}</div>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              Página {syncPage} de {syncTotalPages}
            </span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: syncTotalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setSyncPage(p)}
                  className={`px-3 py-1 rounded text-sm ${p === syncPage ? "bg-primary text-white" : "bg-border text-text"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="bg-card border border-border rounded p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-muted mt-2">{helper}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input value={value} type={type} onChange={(e) => onChange(e.target.value)} className="w-full border border-border rounded px-3 py-2" />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-border rounded px-3 py-2">
        {options.map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ViewButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-2 rounded text-sm ${active ? "bg-primary text-white" : "bg-border text-text"}`}>
      {label}
    </button>
  );
}
