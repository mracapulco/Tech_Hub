"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

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

export default function AISettingsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);
  const [standards, setStandards] = useState<Standards>({ domains: {} });
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      } catch {}
      setLoadingPerms(false);
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !isAdmin) return;
    setLoading(true);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Standards }>(`/admin/settings/company-standards`, token);
        if (res?.data) setStandards(res.data);
      } catch {}
      setLoading(false);
    })();
  }, [isAdmin]);

  async function onSave() {
    const token = getToken();
    if (!token) {
      setMsg("Sessão expirada. Faça login novamente.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(`/admin/settings/company-standards`, token, { standards });
      if (res?.ok) {
        setMsg("Configurações de IA salvas com sucesso.");
      } else {
        setMsg(res?.error || "Falha ao salvar configurações de IA.");
      }
    } catch {
      setMsg("Falha ao comunicar com a API.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingPerms) return <div className="p-6">Verificando permissões...</div>;
  if (!isAdmin) return <div className="p-6 text-red-600">Acesso restrito. Somente administradores podem editar configurações de IA.</div>;

  const d = standards.domains || {};

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">IA</h1>
      <p className="text-muted mb-6">Defina padrões corporativos (Tech Master) que orientarão recomendações da IA.</p>

      {msg && <div className="mb-4 text-sm text-blue-700">{msg}</div>}
      {loading && <div className="mb-4">Carregando configurações...</div>}

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

      <div className="mt-6 flex items-center gap-4">
        <button className="bg-primary text-white px-4 py-2 rounded hover:bg-primaryHover" onClick={onSave} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</button>
      </div>
    </div>
  );
}