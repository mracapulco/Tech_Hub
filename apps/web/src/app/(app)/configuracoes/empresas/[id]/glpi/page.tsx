"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API_URL = "/api";

type Company = {
  id: string;
  name: string;
  fantasyName?: string | null;
};

type GlpiEntity = {
  id: string;
  name: string;
  fullPath?: string | null;
};

type GlpiConfigResponse = {
  baseUrl: string;
  clientId: string;
  callbackUrl: string | null;
  hasClientSecret: boolean;
  maskedClientSecret: string;
  selectedEntityId?: string | null;
  selectedEntityName?: string | null;
  selectedEntityFullPath?: string | null;
  includeSubentities: boolean;
  connectionStatus: string;
  authorized: boolean;
  authorizedAt?: string | null;
  lastTestAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

type TestResult = {
  baseUrl: string;
  apiLabel: string;
  connectionStatus: string;
  authorized: boolean;
  glpiVersion?: string | null;
  authenticatedUser?: string | null;
  entities?: GlpiEntity[];
  selectedEntity?: GlpiEntity | null;
  includeSubentities: boolean;
  hostsInPrimaryEntity: number;
  hostsInSubentities: number;
  totalConsidered: number;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

export default function CompanyGlpiPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = String(params?.id || "");
  const [company, setCompany] = useState<Company | null>(null);
  const [config, setConfig] = useState<GlpiConfigResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState("https://helpdesk.techmaster.inf.br");
  const [clientId, setClientId] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [includeSubentities, setIncludeSubentities] = useState(false);
  const [entities, setEntities] = useState<GlpiEntity[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedEntityName, setSelectedEntityName] = useState("");
  const [selectedEntityFullPath, setSelectedEntityFullPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function loadPage() {
    const token = getToken();
    if (!token || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [companyRes, configRes] = await Promise.all([
        apiGet<{ ok: boolean; data?: Company; error?: string }>(`/companies/${companyId}`, token),
        apiGet<{ ok: boolean; data?: GlpiConfigResponse; error?: string }>(`/companies/${companyId}/glpi`, token),
      ]);
      if (!companyRes?.ok || !companyRes.data) {
        setError(companyRes?.error || "Empresa não encontrada.");
        return;
      }
      setCompany(companyRes.data);
      if (configRes?.ok && configRes.data) {
        setConfig(configRes.data);
        setBaseUrl(configRes.data.baseUrl || "https://helpdesk.techmaster.inf.br");
        setClientId(configRes.data.clientId || "");
        setCallbackUrl(configRes.data.callbackUrl || "");
        setClientSecret("");
        setIncludeSubentities(configRes.data.includeSubentities === true);
        setSelectedEntityId(configRes.data.selectedEntityId || "");
        setSelectedEntityName(configRes.data.selectedEntityName || "");
        setSelectedEntityFullPath(configRes.data.selectedEntityFullPath || "");
      }
    } catch {
      setError("Falha ao carregar a configuração do GLPI.");
    } finally {
      setLoading(false);
    }
  }

  async function loadEntities() {
    const token = getToken();
    if (!token || !companyId) return;
    setLoadingEntities(true);
    try {
      const res = await apiGet<{ ok: boolean; data?: GlpiEntity[]; error?: string }>(`/companies/${companyId}/glpi/entities`, token);
      if (res?.ok) {
        setEntities(res.data || []);
      } else {
        setError(res?.error || "Falha ao carregar entidades do GLPI.");
      }
    } catch {
      setError("Falha ao carregar entidades do GLPI.");
    } finally {
      setLoadingEntities(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [companyId]);

  useEffect(() => {
    if (config?.authorized) {
      loadEntities();
    } else {
      setEntities([]);
    }
  }, [config?.authorized, companyId]);

  useEffect(() => {
    if (searchParams.get("glpiOauth") === "success") {
      setMessage("Autorização OAuth concluída com sucesso.");
      loadPage();
      loadEntities();
      router.replace(`/configuracoes/empresas/${companyId}/glpi`);
    }
  }, [searchParams, companyId, router]);

  const filteredEntities = useMemo(() => {
    const term = entitySearch.trim().toLowerCase();
    if (!term) return entities;
    return entities.filter((item) =>
      `${item.name} ${item.fullPath || ""}`.toLowerCase().includes(term),
    );
  }, [entities, entitySearch]);

  async function handleSave() {
    const token = getToken();
    if (!token || !companyId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const selected = entities.find((item) => item.id === selectedEntityId);
      const res = await apiPost<{ ok: boolean; error?: string }>(
        `/companies/${companyId}/glpi`,
        token,
        {
          baseUrl,
          clientId,
          callbackUrl: callbackUrl.trim() || null,
          clientSecret: clientSecret || null,
          selectedEntityId: selectedEntityId || null,
          selectedEntityName: selected?.name || selectedEntityName || null,
          selectedEntityFullPath: selected?.fullPath || selectedEntityFullPath || null,
          includeSubentities,
        },
      );
      if (!res?.ok) {
        setError(res?.error || "Falha ao salvar a configuração GLPI.");
        return;
      }
      setMessage("Configuração GLPI salva.");
      setClientSecret("");
      await loadPage();
    } catch {
      setError("Falha ao salvar a configuração GLPI.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAuthorize() {
    const token = getToken();
    if (!token || !companyId) return;
    setError(null);
    setMessage(null);
    try {
      const returnTo = `${window.location.origin}/configuracoes/empresas/${companyId}/glpi`;
      const response = await fetch(`${API_URL}/companies/${companyId}/glpi/authorize-url`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnTo,
          callbackUrl: callbackUrl.trim() || null,
        }),
      });
      const res = (await response.json()) as { ok: boolean; data?: { authorizeUrl: string }; error?: string };
      if (!res?.ok || !res.data?.authorizeUrl) {
        setError(res?.error || "Falha ao iniciar a autorização OAuth.");
        return;
      }
      window.location.href = res.data.authorizeUrl;
    } catch {
      setError("Falha ao iniciar a autorização OAuth.");
    }
  }

  async function handleRevoke() {
    const token = getToken();
    if (!token || !companyId) return;
    setRevoking(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(`/companies/${companyId}/glpi/revoke`, token, {});
      if (!res?.ok) {
        setError(res?.error || "Falha ao revogar a autorização.");
        return;
      }
      setMessage("Autorização local removida. Será preciso autorizar novamente para voltar a usar o GLPI.");
      setEntities([]);
      setTestResult(null);
      await loadPage();
    } catch {
      setError("Falha ao revogar a autorização.");
    } finally {
      setRevoking(false);
    }
  }

  async function handleTest() {
    const token = getToken();
    if (!token || !companyId) return;
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiPost<{ ok: boolean; data?: TestResult; error?: string }>(`/companies/${companyId}/glpi/test`, token, {});
      if (!res?.ok || !res.data) {
        setError(res?.error || "Falha ao testar a integração GLPI.");
        return;
      }
      setTestResult(res.data);
      setMessage("Teste do GLPI concluído.");
      if (Array.isArray(res.data.entities)) setEntities(res.data.entities);
      await loadPage();
    } catch {
      setError("Falha ao testar a integração GLPI.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-600">Carregando integração GLPI...</div>;
  if (!company) return <div className="p-4 text-sm text-red-600">{error || "Empresa não encontrada."}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">Configurações &gt; Empresas &gt; GLPI</div>
          <h1 className="text-2xl font-semibold">GLPI - {company.fantasyName || company.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Esta empresa possui no máximo uma configuração GLPI, com uma única entidade-base e opção para incluir hosts das subentidades.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/configuracoes/empresas/${companyId}`} className="rounded border border-border px-4 py-2 text-sm">
            Voltar para empresa
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded border border-border bg-white p-6">
          <h2 className="text-lg font-medium">Configuração</h2>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium">URL base do GLPI</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1 w-full rounded border border-border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Client ID</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 w-full rounded border border-border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Client Secret</label>
              <input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.hasClientSecret ? `Atual: ${config.maskedClientSecret}` : ""}
                className="mt-1 w-full rounded border border-border px-3 py-2"
              />
              <div className="mt-1 text-xs text-gray-500">O segredo fica criptografado no backend e não volta completo para a interface.</div>
            </div>
            <div>
              <label className="block text-sm font-medium">URL de callback do Tech Hub</label>
              <input
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                className="mt-1 w-full rounded border border-border px-3 py-2"
              />
              <div className="mt-1 text-xs text-gray-500">
                Se deixar em branco, o Tech Hub monta a callback automaticamente com base na URL atual de acesso.
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-medium">Entidade do cliente</div>
            <input
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
              placeholder={config?.authorized ? "Pesquisar entidade..." : "Autorize a conexão para listar entidades"}
              disabled={!config?.authorized}
              className="w-full rounded border border-border px-3 py-2 disabled:bg-gray-50"
            />
            <div className="mt-2 max-h-60 overflow-auto rounded border border-border">
              {loadingEntities ? (
                <div className="px-3 py-3 text-sm text-gray-500">Carregando entidades...</div>
              ) : !config?.authorized ? (
                <div className="px-3 py-3 text-sm text-gray-500">A lista de entidades fica habilitada após a autorização OAuth.</div>
              ) : filteredEntities.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500">Nenhuma entidade encontrada.</div>
              ) : (
                filteredEntities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => {
                      setSelectedEntityId(entity.id);
                      setSelectedEntityName(entity.name);
                      setSelectedEntityFullPath(entity.fullPath || "");
                    }}
                    className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
                      selectedEntityId === entity.id ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">{entity.name}</div>
                    <div className="text-xs text-gray-500">{entity.fullPath || "-"}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeSubentities} onChange={(e) => setIncludeSubentities(e.target.checked)} />
              Incluir hosts das subentidades
            </label>
          </div>

          {(message || error) && (
            <div className="mt-4 space-y-2">
              {message && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}
              {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={handleSave} disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={handleAuthorize} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              {config?.authorized ? "Reconectar no GLPI" : "Autorizar conexão no GLPI"}
            </button>
            <button onClick={handleTest} disabled={testing || !config?.authorized} className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-black disabled:opacity-60">
              {testing ? "Testando..." : "Testar configuração"}
            </button>
            <button onClick={handleRevoke} disabled={revoking || !config?.authorized} className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
              {revoking ? "Revogando..." : "Revogar autorização"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded border border-border bg-white p-6">
            <h2 className="text-lg font-medium">Status da conexão</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div><span className="font-medium">Status:</span> {config?.connectionStatus || "NOT_CONFIGURED"}</div>
              <div><span className="font-medium">Autorizado:</span> {config?.authorized ? "sim" : "não"}</div>
              <div><span className="font-medium">Último teste:</span> {formatDateTime(config?.lastTestAt)}</div>
              <div><span className="font-medium">Última sincronização:</span> {formatDateTime(config?.lastSyncAt)}</div>
              <div><span className="font-medium">Último erro:</span> {config?.lastError || "-"}</div>
              <div><span className="font-medium">Entidade selecionada:</span> {config?.selectedEntityFullPath || config?.selectedEntityName || "-"}</div>
            </div>
          </div>

          <div className="rounded border border-border bg-white p-6">
            <h2 className="text-lg font-medium">Resultado do teste</h2>
            {!testResult ? (
              <div className="mt-4 text-sm text-gray-500">Nenhum teste executado ainda.</div>
            ) : (
              <div className="mt-4 space-y-2 text-sm">
                <div><span className="font-medium">GLPI:</span> {testResult.glpiVersion || "11.x / não identificado"}</div>
                <div><span className="font-medium">API:</span> {testResult.apiLabel}</div>
                <div><span className="font-medium">Status:</span> {testResult.authorized ? "autorizado" : "não autorizado"}</div>
                <div><span className="font-medium">Usuário:</span> {testResult.authenticatedUser || "-"}</div>
                <div><span className="font-medium">Entidade:</span> {testResult.selectedEntity?.fullPath || testResult.selectedEntity?.name || "-"}</div>
                <div><span className="font-medium">Incluir subentidades:</span> {testResult.includeSubentities ? "sim" : "não"}</div>
                <div><span className="font-medium">Hosts na entidade principal:</span> {testResult.hostsInPrimaryEntity}</div>
                <div><span className="font-medium">Hosts nas subentidades:</span> {testResult.hostsInSubentities}</div>
                <div><span className="font-medium">Total considerado:</span> {testResult.totalConsidered}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
