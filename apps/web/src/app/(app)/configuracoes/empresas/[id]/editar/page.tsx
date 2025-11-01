"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut, apiUpload } from "@/lib/api";
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

type Company = {
  id: string;
  cnpj: string | null;
  name: string;
  fantasyName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
};

export default function EmpresaEditarPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
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

  async function fetchCompany() {
    const token = getToken();
    if (!token) {
      setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await apiGet<{ ok: boolean; data?: Company; error?: string }>(`/companies/${id}`, token);
    setLoading(false);
    if (!res?.ok || !res.data) {
      setMsg({ type: 'error', text: res?.error || 'Empresa não encontrada.' });
      return;
    }
    setCompany(res.data);
    setForm({
      cnpj: res.data.cnpj || '',
      name: res.data.name || '',
      fantasyName: res.data.fantasyName || '',
      address: res.data.address || '',
      city: res.data.city || '',
      state: res.data.state || '',
      zipcode: res.data.zipcode || '',
      phone: res.data.phone || '',
      logoUrl: (res.data as any).logoUrl || '',
    });
  }

  useEffect(() => {
    if (id) {
      fetchCompany();
      computePermissions();
    }
  }, [id]);

  async function computePermissions() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string; companyId: string }[];
      const admin = memberships.some((m) => m.role === 'ADMIN');
      const tech = memberships.some((m) => m.role === 'TECHNICIAN');
      const hasCompany = memberships.some((m) => m.companyId === id);
      setIsAdmin(admin);
      setIsTech(tech);
      setCanEdit(admin || tech || hasCompany);
    } catch {
      setIsAdmin(false);
      setIsTech(false);
      setCanEdit(false);
    }
  }

  async function handleLookup() {
    setMsg(null);
    const digits = onlyDigits(form.cnpj);
    if (!digits || digits.length !== 14) {
      setMsg({ type: 'error', text: 'Informe um CNPJ válido com 14 dígitos.' });
      return;
    }
    const token = getToken();
    if (!token) {
      setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    setLoadingLookup(true);
    const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/companies/cnpj/${digits}`, token);
    setLoadingLookup(false);
    if (!res?.ok) {
      setMsg({ type: 'error', text: res?.error || 'Não foi possível buscar dados pelo CNPJ.' });
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
    setMsg({ type: 'success', text: 'Dados pré-preenchidos com base no CNPJ.' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const token = getToken();
    if (!token) {
      setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    if (!form.name.trim()) {
      setMsg({ type: 'error', text: 'Razão Social (nome) é obrigatória.' });
      return;
    }
    setSaving(true);
    const payload = {
      cnpj: form.cnpj?.trim() || undefined,
      name: form.name.trim(),
      fantasyName: form.fantasyName?.trim() || undefined,
      address: form.address?.trim() || undefined,
      city: form.city?.trim() || undefined,
      state: form.state?.trim() || undefined,
      zipcode: form.zipcode?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      logoUrl: form.logoUrl?.trim() || undefined,
    };
    const res = await apiPut<{ ok: boolean; data?: Company; error?: string }>(`/companies/${id}`, token, payload);
    setSaving(false);
    if (!res?.ok) {
      setMsg({ type: 'error', text: res?.error || 'Falha ao atualizar empresa.' });
      return;
    }
    setMsg({ type: 'success', text: 'Empresa atualizada com sucesso.' });
    // Atualiza estado local e volta para detalhe
    setCompany(res.data!);
    router.push(`/configuracoes/empresas/${id}`);
  }

  if (loading) return <p>Carregando...</p>;
  if (!company) return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editar Empresa</h1>
        <button onClick={() => router.back()} className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">Voltar</button>
      </div>
      {msg && <p className={msg.type === 'error' ? 'text-red-600' : 'text-green-600'}>{msg.text}</p>}
      <p className="mt-4 text-gray-600">Empresa não encontrada.</p>
    </main>
  );

  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Editar Empresa</h1>
        <button onClick={() => router.back()} className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">Voltar</button>
      </div>

      {!canEdit && (
        <div className="mt-6 max-w-2xl p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-700">Você não tem permissão para editar esta empresa.</p>
        </div>
      )}

      {canEdit && (
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-2xl p-4 bg-white rounded shadow">
        {msg && (
          <div className={msg.type === 'error' ? 'text-red-600' : 'text-green-600'}>{msg.text}</div>
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
                {loadingLookup ? 'Buscando...' : 'Buscar CNPJ'}
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

        <div className="pt-2 flex gap-2">
          <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          <button type="button" onClick={() => router.push(`/configuracoes/empresas/${id}`)} className="rounded bg-gray-200 px-4 py-2 text-gray-800">
            Cancelar
          </button>
        </div>
      </form>
      )}
    </main>
  );
}