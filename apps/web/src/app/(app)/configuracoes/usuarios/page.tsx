"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type UserItem = { id: string; username?: string | null; name: string; lastName?: string | null; email: string; status?: string };
type CompanyItem = { id: string; name: string };

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [msgList, setMsgList] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myMemberships, setMyMemberships] = useState<{ companyId: string; role: string }[]>([]);

  const [showClientForm, setShowClientForm] = useState(false);
  const [showAdminTechForm, setShowAdminTechForm] = useState(false);

  const [savingClient, setSavingClient] = useState(false);
  const [msgClientForm, setMsgClientForm] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingAdminTech, setSavingAdminTech] = useState(false);
  const [msgAdminTechForm, setMsgAdminTechForm] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [formClient, setFormClient] = useState({
    name: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    avatarUrl: "",
    companyIds: [] as string[],
  });

  const [formAdminTech, setFormAdminTech] = useState({
    name: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    avatarUrl: "",
    role: "ADMIN",
  });

  async function fetchUsers() {
    setMsgList(null);
    const token = getToken();
    if (!token) {
      setMsgList("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingList(true);
    const res = await apiGet<{ ok: boolean; data?: UserItem[]; error?: string }>(`/users`, token);
    setLoadingList(false);
    if (!res?.ok) {
      setMsgList(res?.error || "Falha ao carregar usuários.");
      return;
    }
    setUsers(res.data || []);
  }

  async function fetchCompanies() {
    const token = getToken();
    if (!token) return;
    const res = await apiGet<{ ok: boolean; data?: CompanyItem[] }>(`/companies`, token);
    if (res?.ok) setCompanies((res.data || []).map((c: any) => ({ id: c.id, name: c.name })));
  }

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
    fetchIsAdmin();
  }, []);

  async function fetchIsAdmin() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { companyId: string; role: string }[];
      setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
      setMyMemberships(memberships);
    } catch {
      setIsAdmin(false);
      setMyMemberships([]);
    }
  }

  async function handleSubmitClient(e: React.FormEvent) {
    e.preventDefault();
    setMsgClientForm(null);
    const token = getToken();
    if (!token) {
      setMsgClientForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    if (!formClient.name.trim() || !formClient.email.trim() || !formClient.password.trim()) {
      setMsgClientForm({ type: 'error', text: 'Nome, Email e Senha são obrigatórios.' });
      return;
    }
    setSavingClient(true);
    const payload: any = {
      name: formClient.name.trim(),
      lastName: formClient.lastName.trim() || undefined,
      email: formClient.email.trim(),
      username: formClient.username.trim() || undefined,
      password: formClient.password,
      avatarUrl: formClient.avatarUrl.trim() || undefined,
    };
    const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/users`, token, payload);
    if (!res?.ok || !res?.data?.id) {
      setSavingClient(false);
      setMsgClientForm({ type: 'error', text: res?.error || 'Falha ao criar usuário.' });
      return;
    }
    const newUserId = res.data.id as string;
    // Vincular às empresas selecionadas como CLIENT
    for (const cid of formClient.companyIds) {
      try {
        await apiPost<{ ok: boolean; data?: any; error?: string }>(`/users/${newUserId}/memberships`, token, { companyId: cid, role: 'CLIENT' });
      } catch {}
    }
    setSavingClient(false);
    setMsgClientForm({ type: 'success', text: 'Cliente criado e vinculado às empresas selecionadas.' });
    setFormClient({ name: '', lastName: '', email: '', username: '', password: '', avatarUrl: '', companyIds: [] });
    await fetchUsers();
    setShowClientForm(false);
  }

  async function handleSubmitAdminTech(e: React.FormEvent) {
    e.preventDefault();
    setMsgAdminTechForm(null);
    const token = getToken();
    if (!token) {
      setMsgAdminTechForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    if (!formAdminTech.name.trim() || !formAdminTech.email.trim() || !formAdminTech.password.trim()) {
      setMsgAdminTechForm({ type: 'error', text: 'Nome, Email e Senha são obrigatórios.' });
      return;
    }
    // Determina empresa âncora automaticamente (não exibimos para o usuário)
    const anchorCompanyId = (myMemberships[0]?.companyId) || '';
    if (!anchorCompanyId) {
      setMsgAdminTechForm({ type: 'error', text: 'Não foi possível atribuir papel global: usuário atual não possui vínculo a nenhuma empresa.' });
      return;
    }
    setSavingAdminTech(true);
    const payload: any = {
      name: formAdminTech.name.trim(),
      lastName: formAdminTech.lastName.trim() || undefined,
      email: formAdminTech.email.trim(),
      username: formAdminTech.username.trim() || undefined,
      password: formAdminTech.password,
      avatarUrl: formAdminTech.avatarUrl.trim() || undefined,
    };
    const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/users`, token, payload);
    if (!res?.ok || !res?.data?.id) {
      setSavingAdminTech(false);
      setMsgAdminTechForm({ type: 'error', text: res?.error || 'Falha ao criar usuário.' });
      return;
    }
    const newUserId = res.data.id as string;
    // Atribui papel global (ADMIN ou TECHNICIAN) sem escolher empresa, usando âncora automática
    const role = formAdminTech.role;
    const linkRes = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/users/${newUserId}/memberships`, token, { companyId: anchorCompanyId, role });
    setSavingAdminTech(false);
    if (!linkRes?.ok) {
      setMsgAdminTechForm({ type: 'error', text: linkRes?.error || 'Usuário criado, mas falha ao atribuir papel.' });
      return;
    }
    setMsgAdminTechForm({ type: 'success', text: 'Usuário criado como Administrador/Técnico.' });
    setFormAdminTech({ name: '', lastName: '', email: '', username: '', password: '', avatarUrl: '', role: 'ADMIN' });
    await fetchUsers();
    setShowAdminTechForm(false);
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    if (!window.confirm('Excluir este usuário?')) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/users/${id}`, token);
    if (!res?.ok) {
      alert(res?.error || 'Falha ao excluir usuário.');
      return;
    }
    await fetchUsers();
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="mt-2 text-gray-600">Gerencie usuários e vínculos com empresas.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => { setShowClientForm(true); setShowAdminTechForm(false); }}
                className="rounded-lg bg-green-600 px-3 py-2 text-white hover:bg-green-700"
              >
                Novo Cliente
              </button>
              <button
                type="button"
                onClick={() => { setShowAdminTechForm(true); setShowClientForm(false); }}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700"
              >
                Novo Administrador/Técnico
              </button>
            </>
          )}
        </div>
      </div>

      {isAdmin && showClientForm && (
        <form onSubmit={handleSubmitClient} className="mt-6 space-y-4 max-w-2xl p-4 rounded-lg border border-border bg-card shadow-sm">
          {msgClientForm && (
            <div className={msgClientForm.type === 'error' ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700' : 'rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700'}>{msgClientForm.text}</div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Nome</label>
              <input value={formClient.name} onChange={(e) => setFormClient({ ...formClient, name: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium">Sobrenome</label>
              <input value={formClient.lastName} onChange={(e) => setFormClient({ ...formClient, lastName: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" value={formClient.email} onChange={(e) => setFormClient({ ...formClient, email: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium">Username</label>
              <input value={formClient.username} onChange={(e) => setFormClient({ ...formClient, username: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Avatar (URL)</label>
            <input type="text" value={formClient.avatarUrl} onChange={(e) => setFormClient({ ...formClient, avatarUrl: e.target.value })} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium">Avatar (arquivo)</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                if (!file) return;
                const token = getToken();
                if (!token) {
                  setMsgClientForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
                  return;
                }
                setUploadingAvatar(true);
                const res = await apiUpload('/uploads', token, file);
                setUploadingAvatar(false);
                if (!res?.ok || !res.path) {
                  setMsgClientForm({ type: 'error', text: res?.error || 'Falha ao enviar avatar.' });
                  return;
                }
                setFormClient((f) => ({ ...f, avatarUrl: res.path! }));
              }}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary"
            />
            {uploadingAvatar && <p className="text-sm text-gray-500 mt-1">Enviando avatar...</p>}
            {formClient.avatarUrl && (
              <div className="mt-2">
                <img src={imgUrl(formClient.avatarUrl)} alt="Prévia do avatar" className="h-16 w-16 rounded-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Senha</label>
            <input type="password" value={formClient.password} onChange={(e) => setFormClient({ ...formClient, password: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-sm font-medium">Empresas (multi-seleção)</label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {companies.map((c) => {
                const checked = formClient.companyIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setFormClient((f) => ({
                          ...f,
                          companyIds: val ? [...f.companyIds, c.id] : f.companyIds.filter((id) => id !== c.id),
                        }));
                      }}
                    />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">O cliente terá acesso às empresas selecionadas.</p>
          </div>

          <div className="pt-2 flex gap-2">
            <button type="submit" disabled={savingClient} className="rounded-lg bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-60">
              {savingClient ? 'Salvando...' : 'Criar Cliente'}
            </button>
            <button type="button" onClick={() => setShowClientForm(false)} className="rounded-lg bg-gray-200 px-3 py-2 text-gray-800 hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {isAdmin && showAdminTechForm && (
        <form onSubmit={handleSubmitAdminTech} className="mt-6 space-y-4 max-w-2xl p-4 rounded-lg border border-border bg-card shadow-sm">
          {msgAdminTechForm && (
            <div className={msgAdminTechForm.type === 'error' ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700' : 'rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700'}>{msgAdminTechForm.text}</div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Nome</label>
              <input value={formAdminTech.name} onChange={(e) => setFormAdminTech({ ...formAdminTech, name: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium">Sobrenome</label>
              <input value={formAdminTech.lastName} onChange={(e) => setFormAdminTech({ ...formAdminTech, lastName: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" value={formAdminTech.email} onChange={(e) => setFormAdminTech({ ...formAdminTech, email: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium">Username</label>
              <input value={formAdminTech.username} onChange={(e) => setFormAdminTech({ ...formAdminTech, username: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Avatar (URL)</label>
            <input type="text" value={formAdminTech.avatarUrl} onChange={(e) => setFormAdminTech({ ...formAdminTech, avatarUrl: e.target.value })} placeholder="https://..." className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium">Avatar (arquivo)</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                if (!file) return;
                const token = getToken();
                if (!token) {
                  setMsgAdminTechForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
                  return;
                }
                setUploadingAvatar(true);
                const res = await apiUpload('/uploads', token, file);
                setUploadingAvatar(false);
                if (!res?.ok || !res.path) {
                  setMsgAdminTechForm({ type: 'error', text: res?.error || 'Falha ao enviar avatar.' });
                  return;
                }
                setFormAdminTech((f) => ({ ...f, avatarUrl: res.path! }));
              }}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary"
            />
            {uploadingAvatar && <p className="text-sm text-gray-500 mt-1">Enviando avatar...</p>}
            {formAdminTech.avatarUrl && (
              <div className="mt-2">
                <img src={imgUrl(formAdminTech.avatarUrl)} alt="Prévia do avatar" className="h-16 w-16 rounded-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Senha</label>
            <input type="password" value={formAdminTech.password} onChange={(e) => setFormAdminTech({ ...formAdminTech, password: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium">Perfil</label>
            <select value={formAdminTech.role} onChange={(e) => setFormAdminTech({ ...formAdminTech, role: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary">
              <option value="ADMIN">Administrador</option>
              <option value="TECHNICIAN">Técnico</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">Perfis de Administrador/Técnico são globais e não exigem seleção de empresa.</p>
          </div>

          <div className="pt-2 flex gap-2">
            <button type="submit" disabled={savingAdminTech} className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:opacity-60">
              {savingAdminTech ? 'Salvando...' : 'Criar Administrador/Técnico'}
            </button>
            <button type="button" onClick={() => setShowAdminTechForm(false)} className="rounded-lg bg-gray-200 px-3 py-2 text-gray-800 hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Usuários cadastrados</h2>
            <p className="mt-1 text-sm font-medium text-gray-600">Lista de usuários e ações disponíveis.</p>
          </div>
          <button type="button" onClick={fetchUsers} className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">
            Atualizar lista
          </button>
        </div>
        {msgList && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msgList}</p>}
        {loadingList ? (
          <p className="mt-4 text-gray-600">Carregando...</p>
        ) : users.length === 0 ? (
          <div className="mt-4 rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-gray-700">Nenhum usuário cadastrado ainda.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setShowClientForm(true)} className="rounded-lg bg-green-600 px-3 py-2 text-white hover:bg-green-700">Novo Cliente</button>
              <button type="button" onClick={() => setShowAdminTechForm(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700">Novo Administrador/Técnico</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-border">Nome</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-border">Sobrenome</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-border">Email</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-border">Username</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b border-border">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                    <td className="px-4 py-2 text-sm text-gray-700">{u.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{u.lastName || '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{u.email}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{u.username || '-'}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link href={`/configuracoes/usuarios/${u.id}`} className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700">
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}