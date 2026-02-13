"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type ClientProfile = {
  industry?: string;
  region?: string;
  stack?: {
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
  customSolutions?: string;
  limitations?: string;
  goals?: string;
};

export default function ClientProfilePage() {
  const params = useParams();
  const companyId = String(params?.companyId || "");
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);
  const [profile, setProfile] = useState<ClientProfile>({ stack: {} });
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setHasAccess(false);
      setLoadingPerms(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string; companyId?: string }[];
        const isAdmin = memberships.some((m) => m.role === "ADMIN");
        const member = memberships.some((m) => String(m.companyId) === companyId);
        setHasAccess(isAdmin || member);
      } catch {}
      setLoadingPerms(false);
    })();
  }, [companyId]);

  useEffect(() => {
    const token = getToken();
    if (!token || !hasAccess || !companyId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: ClientProfile }>(`/admin/settings/client-profile/${companyId}`, token);
        if (res?.data) setProfile(res.data);
      } catch {}
      setLoading(false);
    })();
  }, [hasAccess, companyId]);

  async function onSave() {
    const token = getToken();
    if (!token) {
      setMsg("Sessão expirada. Faça login novamente.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(`/admin/settings/client-profile/${companyId}`, token, { profile });
      if (res?.ok) {
        setMsg("Perfil do cliente salvo com sucesso.");
      } else {
        setMsg(res?.error || "Falha ao salvar perfil do cliente.");
      }
    } catch {
      setMsg("Falha ao comunicar com a API.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingPerms) return <div className="p-6">Verificando permissões...</div>;
  if (!hasAccess) return <div className="p-6 text-red-600">Acesso restrito. É necessário ser ADMIN ou vinculado à empresa.</div>;

  const s = profile.stack || {};

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Perfil do Cliente</h1>
      <p className="text-muted mb-6">Empresa: {companyId}</p>

      {msg && <div className="mb-4 text-sm text-blue-700">{msg}</div>}
      {loading && <div className="mb-4">Carregando perfil...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Setor</label>
          <input className="mt-1 w-full border rounded p-2" value={profile.industry || ""} onChange={(e) => setProfile({ ...profile, industry: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Região</label>
          <input className="mt-1 w-full border rounded p-2" value={profile.region || "BR"} onChange={(e) => setProfile({ ...profile, region: e.target.value })} />
        </div>

        <div>
          <label className="block text-sm font-medium">Inventário/Helpdesk</label>
          <input className="mt-1 w-full border rounded p-2" value={s.inventory || "GLPI"} onChange={(e) => setProfile({ ...profile, stack: { ...s, inventory: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Antivírus</label>
          <input className="mt-1 w-full border rounded p-2" value={s.antivirus || "Kaspersky ou Microsoft Defender"} onChange={(e) => setProfile({ ...profile, stack: { ...s, antivirus: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Monitoramento</label>
          <input className="mt-1 w-full border rounded p-2" value={s.monitoring || "Zabbix + Grafana"} onChange={(e) => setProfile({ ...profile, stack: { ...s, monitoring: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Backup</label>
          <input className="mt-1 w-full border rounded p-2" value={s.backup || "Veeam"} onChange={(e) => setProfile({ ...profile, stack: { ...s, backup: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Servidores físicos</label>
          <input className="mt-1 w-full border rounded p-2" value={s.servers || "Dell"} onChange={(e) => setProfile({ ...profile, stack: { ...s, servers: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Ferramentas corporativas</label>
          <input className="mt-1 w-full border rounded p-2" value={s.productivity || "Microsoft 365"} onChange={(e) => setProfile({ ...profile, stack: { ...s, productivity: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Virtualização</label>
          <input className="mt-1 w-full border rounded p-2" value={s.virtualization || "Hyper-V ou VMware"} onChange={(e) => setProfile({ ...profile, stack: { ...s, virtualization: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">Firewall</label>
          <input className="mt-1 w-full border rounded p-2" value={s.firewall || "Sophos"} onChange={(e) => setProfile({ ...profile, stack: { ...s, firewall: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium">VPN</label>
          <input className="mt-1 w-full border rounded p-2" value={s.vpn || "IPSec"} onChange={(e) => setProfile({ ...profile, stack: { ...s, vpn: e.target.value } })} />
        </div>
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium">Soluções próprias (texto)</label>
        <textarea className="mt-1 w-full border rounded p-2" rows={3} value={profile.customSolutions || ""} onChange={(e) => setProfile({ ...profile, customSolutions: e.target.value })} />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium">Limitações/Restrições</label>
        <textarea className="mt-1 w-full border rounded p-2" rows={3} value={profile.limitations || ""} onChange={(e) => setProfile({ ...profile, limitations: e.target.value })} />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium">Metas/Objetivos</label>
        <textarea className="mt-1 w-full border rounded p-2" rows={3} value={profile.goals || ""} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} />
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="bg-primary text-white px-4 py-2 rounded hover:bg-primaryHover" onClick={onSave} disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</button>
      </div>
    </div>
  );
}