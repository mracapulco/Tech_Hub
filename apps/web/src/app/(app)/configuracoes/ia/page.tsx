"use client";
import React, { useEffect, useState } from "react";
import { getToken as getAuthToken, getUser } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Usa o util oficial de autenticação para obter o token salvo em localStorage
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return getAuthToken();
}

export default function IntegracoesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);
  const [masked, setMasked] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [provider, setProvider] = useState<string>("openai");
  const [baseURL, setBaseURL] = useState<string>("");
  const [model, setModel] = useState<string>("gpt-4o-mini");

  // Padrões corporativos (Tech Master) para IA
  type Standards = {
    domains?: {
      inventory?: string;
      antivirus?: string;
      monitoring?: string;
      backup?: string;
      servers?: string;
      productivity?: string;
      virtualization?: string;
      firewall?: string;
      vpn?: string;
    };
    baseline?: string;
    version?: string;
  };
  const [standards, setStandards] = useState<Standards>({ domains: {} });
  const [stdLoading, setStdLoading] = useState<boolean>(false);
  const [stdSaving, setStdSaving] = useState<boolean>(false);
  const [stdMsg, setStdMsg] = useState<string | null>(null);

  // Verifica permissões (somente ADMIN)
  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setIsAdmin(false);
      setLoadingPerms(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === "ADMIN"));
      } catch {
        setIsAdmin(false);
      }
      setLoadingPerms(false);
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !isAdmin) {
      if (!token) setError("Token ausente. Faça login como ADMIN.");
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/admin/settings/ai-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          const d = j.data;
          setProvider(d.provider || "openai");
          setBaseURL(d.baseURL || "");
          setModel(d.model || "gpt-4o-mini");
          setMasked(d.openaiKeyMasked || "(não configurada)");
        } else {
          setError(j?.error || "Falha ao carregar configurações.");
        }
      })
      .catch(() => setError("Erro de rede ao consultar API."))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  // Carrega padrões corporativos
  useEffect(() => {
    const token = getToken();
    if (!token || !isAdmin) return;
    setStdLoading(true);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Standards }>(`/admin/settings/company-standards`, token);
        if (res?.data) setStandards(res.data);
      } catch {}
      setStdLoading(false);
    })();
  }, [isAdmin]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("");
    setError("");
    const token = getToken();
    if (!token) {
      setError("Token ausente. Faça login como ADMIN.");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/settings/ai-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          baseURL,
          model,
          openaiKey: provider === "openai" && openaiKey ? openaiKey : undefined,
        }),
      });
      const j = await resp.json();
      if (j?.ok) {
        setStatus("Configurações salvas com sucesso.");
        if (provider === "openai" && openaiKey) {
          setMasked(`${openaiKey.slice(0, 3)}****${openaiKey.slice(-4)}`);
          setOpenaiKey("");
        }
      } else {
        setError(j?.error || "Falha ao salvar configurações.");
      }
    } catch {
      setError("Erro de rede ao salvar configurações.");
    } finally {
      setLoading(false);
    }
  };

  async function onSaveStandards() {
    const token = getToken();
    if (!token) {
      setStdMsg("Sessão expirada. Faça login novamente.");
      return;
    }
    setStdSaving(true);
    setStdMsg(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(`/admin/settings/company-standards`, token, { standards });
      if (res?.ok) {
        setStdMsg("Padrões corporativos salvos com sucesso.");
      } else {
        setStdMsg(res?.error || "Falha ao salvar padrões corporativos.");
      }
    } catch {
      setStdMsg("Falha ao comunicar com a API.");
    } finally {
      setStdSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      {loadingPerms ? (
        <div>Verificando permissões...</div>
      ) : !isAdmin ? (
        <div className="text-red-600">Acesso restrito. Somente administradores podem editar configurações.</div>
      ) : (
        <>
      <h1 className="text-2xl font-semibold">IA</h1>
      <div className="mt-4 border rounded p-4">
        <h2 className="text-lg font-medium">Configuração de IA</h2>
        <p className="text-sm text-gray-600 mt-1">
          Se desejar rodar localmente, selecione um provedor compatível (ex.: LM Studio) e informe o <span className="font-mono">baseURL</span> e o modelo.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="provider">Provedor</label>
            <select
              id="provider"
              className="w-full border rounded px-3 py-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="openai">OpenAI (nuvem)</option>
              <option value="lmstudio">LM Studio (local)</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="baseurl">Base URL</label>
            <input
              id="baseurl"
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="http://localhost:1234/v1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="model">Modelo</label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="gpt-4o-mini ou qwen2.5:7b-instruct"
            />
          </div>

          {provider === "openai" && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="openai-key">Chave OpenAI</label>
              <input
                id="openai-key"
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="sk-..."
              />
              <p className="text-xs text-gray-600 mt-1">Chave atual: {masked || "(carregando...)"}</p>
            </div>
          )}

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar configurações"}
          </button>
        </form>

        {status && <p className="mt-3 text-green-700 text-sm">{status}</p>}
        {error && <p className="mt-3 text-red-700 text-sm">{error}</p>}
      </div>

      <div className="mt-6 border rounded p-4">
        <h2 className="text-lg font-medium">Padrões corporativos (Tech Master)</h2>
        {stdMsg && <div className="mb-3 text-sm text-blue-700">{stdMsg}</div>}
        {stdLoading && <div className="mb-3">Carregando padrões...</div>}

        {(() => {
          const d = standards.domains || {};
          return (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">Inventário/Helpdesk</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.inventory || "GLPI"} onChange={(e) => setStandards({ ...standards, domains: { ...d, inventory: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Antivírus</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.antivirus || "Kaspersky ou Microsoft Defender"} onChange={(e) => setStandards({ ...standards, domains: { ...d, antivirus: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Monitoramento</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.monitoring || "Zabbix + Grafana"} onChange={(e) => setStandards({ ...standards, domains: { ...d, monitoring: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Backup</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.backup || "Veeam"} onChange={(e) => setStandards({ ...standards, domains: { ...d, backup: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Servidores físicos</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.servers || "Dell"} onChange={(e) => setStandards({ ...standards, domains: { ...d, servers: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Ferramentas corporativas</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.productivity || "Microsoft 365"} onChange={(e) => setStandards({ ...standards, domains: { ...d, productivity: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Virtualização</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.virtualization || "Hyper-V ou VMware"} onChange={(e) => setStandards({ ...standards, domains: { ...d, virtualization: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">Firewall</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.firewall || "Sophos"} onChange={(e) => setStandards({ ...standards, domains: { ...d, firewall: e.target.value } })} />
                </div>
                <div>
                  <label className="block text-sm font-medium">VPN</label>
                  <input className="mt-1 w-full border rounded p-2" value={d.vpn || "IPSec"} onChange={(e) => setStandards({ ...standards, domains: { ...d, vpn: e.target.value } })} />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium">Baseline (texto opcional)</label>
                <textarea className="mt-1 w-full border rounded p-2" rows={4} value={standards.baseline || ""} onChange={(e) => setStandards({ ...standards, baseline: e.target.value })} />
              </div>

              <div className="mt-4">
                <button className="bg-primary text-white px-4 py-2 rounded hover:bg-primaryHover" onClick={onSaveStandards} disabled={stdSaving}>{stdSaving ? "Salvando..." : "Salvar padrões"}</button>
              </div>
            </>
          );
        })()}
      </div>
        </>
      )}
    </div>
  );
}