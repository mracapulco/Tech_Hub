"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

export default function EmpresaNovaPage() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [form, setForm] = useState({
    cnpj: "",
    name: "",
    fantasyName: "",
    address: "",
    city: "",
    state: "",
    zipcode: "",
    phone: "",
    logoUrl: "",
  });

  const [clientProfile, setClientProfile] = useState<any>({
    industry: "",
    region: "",
    preferredStack: {
      monitoring: "",
      antivirus: "",
      backup: "",
    },
    goals: "",
    limitations: "",
    customSolutions: "",
  });

  async function computePermissions() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string }[];
      const admin = memberships.some((m) => m.role === "ADMIN");
      setIsAdmin(admin);
    } catch {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    computePermissions();
  }, []);

  async function handleLookup() {
    setMsg(null);
    const digits = onlyDigits(form.cnpj);
    if (!digits || digits.length !== 14) {
      setMsg({ type: "error", text: "Informe um CNPJ válido com 14 dígitos." });
      return;
    }
    const token = getToken();
    if (!token) {
      setMsg({ type: "error", text: "Sessão expirada. Faça login novamente." });
      return;
    }
    setLoadingLookup(true);
    const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/companies/cnpj/${digits}`, token);
    setLoadingLookup(false);
    if (!res?.ok) {
      setMsg({ type: "error", text: res?.error || "Não foi possível buscar dados pelo CNPJ." });
      return;
    }
    const data = res.data || {};
    setForm((f) => ({
      ...f,
      cnpj: digits,
      name: data.name || f.name,
      fantasyName: data.fantasyName || f.fantasyName,
      address: data.address || f.address,
      city: data.city || f.city,
      state: data.state || f.state,
      zipcode: data.zipcode || f.zipcode,
      phone: data.phone || f.phone,
    }));
    setMsg({ type: "success", text: "Dados pré-preenchidos com base no CNPJ." });
  }

  function hasAnyProfileFieldFilled() {
    const p = clientProfile || {};
    const base = [p.industry, p.region, p.goals, p.limitations, p.customSolutions].some((v: string) => (v || "").trim().length > 0);
    const stack = [p.preferredStack?.monitoring, p.preferredStack?.antivirus, p.preferredStack?.backup].some((v: string) => (v || "").trim().length > 0);
    return base || stack;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const token = getToken();
    if (!token) {
      setMsg({ type: "error", text: "Sessão expirada. Faça login novamente." });
      return;
    }
    if (!form.name?.trim()) {
      setMsg({ type: "error", text: "O campo Nome (Razão Social) é obrigatório." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        cnpj: form.cnpj ? onlyDigits(form.cnpj) : undefined,
        fantasyName: form.fantasyName?.trim() || undefined,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        state: form.state?.trim() || undefined,
        zipcode: form.zipcode?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        logoUrl: form.logoUrl?.trim() || undefined,
      };
      const res = await apiPost<{ ok: boolean; data?: { id: string }; error?: string }>(`/companies`, token, payload);
      if (!res?.ok || !res.data?.id) {
        setMsg({ type: "error", text: res?.error || "Erro ao salvar empresa." });
        setSaving(false);
        return;
      }
      const newId = res.data.id;

      // Se houver campos de perfil preenchidos, salva perfil do cliente
      if (hasAnyProfileFieldFilled()) {
        const pr = await apiPost<{ ok: boolean; error?: string }>(`/admin/settings/client-profile/${newId}`, token, { profile: clientProfile });
        if (!pr?.ok) {
          setMsg({ type: "error", text: pr?.error || "Empresa criada, mas falha ao salvar Perfil de IA." });
          setSaving(false);
          return;
        }
      }

      setMsg({ type: "success", text: "Empresa cadastrada com sucesso." });
      router.push(`/configuracoes/empresas/${newId}`);
    } catch {
      setMsg({ type: "error", text: "Falha de rede ao salvar empresa." });
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <main>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Cadastrar Empresa</h1>
          <button onClick={() => router.back()} className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">Voltar</button>
        </div>
        <div className="mt-6 max-w-2xl p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-700">Você não tem permissão para cadastrar empresas.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cadastrar Empresa</h1>
        <button onClick={() => router.back()} className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">Voltar</button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-2xl p-4 bg-white rounded shadow">
        {msg && (
          <div className={msg.type === "error" ? "text-red-600" : "text-green-600"}>{msg.text}</div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">CNPJ</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="Somente números"
                className="w-full rounded border px-3 py-2"
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={loadingLookup}
                className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {loadingLookup ? "Buscando..." : "Buscar CNPJ"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Razão Social</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Nome Fantasia</label>
            <input value={form.fantasyName} onChange={(e) => setForm({ ...form, fantasyName: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Telefone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Logo (URL)</label>
          <input
            type="text"
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://..."
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Logo (arquivo)</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              const token = getToken();
              if (!token) {
                setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
                return;
              }
              setUploadingLogo(true);
              const res = await apiUpload('/uploads', token, file);
              setUploadingLogo(false);
              if (!res?.ok || !res.path) {
                setMsg({ type: 'error', text: res?.error || 'Falha ao enviar logo.' });
                return;
              }
              setForm((f) => ({ ...f, logoUrl: res.path! }));
            }}
            className="mt-1 w-full rounded border px-3 py-2"
          />
          {uploadingLogo && <p className="text-sm text-gray-500 mt-1">Enviando logo...</p>}
          {form.logoUrl && (
            <div className="mt-2">
              <img src={imgUrl(form.logoUrl)} alt="Prévia do logo" className="h-16 w-auto object-contain" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Endereço</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">CEP</label>
            <input value={form.zipcode} onChange={(e) => setForm({ ...form, zipcode: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Cidade</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">UF</label>
            <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
        </div>

        <section className="mt-8 p-4 border rounded">
          <h2 className="text-lg font-semibold">Perfil de IA do Cliente</h2>
          <p className="mt-1 text-gray-600">Preencha preferências e contexto para personalização da IA.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Setor/Indústria</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={clientProfile.industry}
                onChange={(e) => setClientProfile({ ...clientProfile, industry: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Região</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={clientProfile.region}
                onChange={(e) => setClientProfile({ ...clientProfile, region: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">Stack - Monitoramento</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={clientProfile.preferredStack?.monitoring || ''}
                onChange={(e) => setClientProfile({ ...clientProfile, preferredStack: { ...(clientProfile.preferredStack || {}), monitoring: e.target.value } })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Stack - Antivírus</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={clientProfile.preferredStack?.antivirus || ''}
                onChange={(e) => setClientProfile({ ...clientProfile, preferredStack: { ...(clientProfile.preferredStack || {}), antivirus: e.target.value } })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Stack - Backup</label>
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={clientProfile.preferredStack?.backup || ''}
                onChange={(e) => setClientProfile({ ...clientProfile, preferredStack: { ...(clientProfile.preferredStack || {}), backup: e.target.value } })}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Objetivos</label>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              value={clientProfile.goals}
              onChange={(e) => setClientProfile({ ...clientProfile, goals: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Limitações</label>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              value={clientProfile.limitations}
              onChange={(e) => setClientProfile({ ...clientProfile, limitations: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Soluções personalizadas</label>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              value={clientProfile.customSolutions}
              onChange={(e) => setClientProfile({ ...clientProfile, customSolutions: e.target.value })}
            />
          </div>
        </section>

        <div className="pt-2 flex gap-2">
          <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar Empresa"}
          </button>
          <Link href="/configuracoes/empresas" className="rounded bg-gray-200 px-4 py-2 text-gray-800">
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}