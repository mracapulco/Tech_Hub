"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";

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

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msgForm, setMsgForm] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [form, setForm] = useState({
    name: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    companyId: "",
    role: "CLIENT",
    avatarUrl: "",
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
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsgForm(null);
    const token = getToken();
    if (!token) {
      setMsgForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setMsgForm({ type: 'error', text: 'Nome, Email e Senha são obrigatórios.' });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      lastName: form.lastName.trim() || undefined,
      email: form.email.trim(),
      username: form.username.trim() || undefined,
      password: form.password,
      avatarUrl: form.avatarUrl.trim() || undefined,
    };
    if (form.companyId) payload.companyId = form.companyId;
    if (form.role) payload.role = form.role;
    const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/users`, token, payload);
    setSaving(false);
    if (!res?.ok) {
      setMsgForm({ type: 'error', text: res?.error || 'Falha ao criar usuário.' });
      return;
    }
    setMsgForm({ type: 'success', text: 'Usuário criado com sucesso.' });
    setForm({ name: '', lastName: '', email: '', username: '', password: '', companyId: '', role: 'CLIENT', avatarUrl: '' });
    await fetchUsers();
    setShowForm(false);
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
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Novo Usuário
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-2xl p-4 bg-white rounded shadow">
          {msgForm && (
            <div className={msgForm.type === 'error' ? 'text-red-600' : 'text-green-600'}>{msgForm.text}</div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Sobrenome</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Username</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Avatar (URL)</label>
            <input type="text" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://..." className="mt-1 w-full rounded border px-3 py-2" />
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
                  setMsgForm({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
                  return;
                }
                setUploadingAvatar(true);
                const res = await apiUpload('/uploads', token, file);
                setUploadingAvatar(false);
                if (!res?.ok || !res.path) {
                  setMsgForm({ type: 'error', text: res?.error || 'Falha ao enviar avatar.' });
                  return;
                }
                setForm((f) => ({ ...f, avatarUrl: res.path! }));
              }}
              className="mt-1 w-full rounded border px-3 py-2"
            />
            {uploadingAvatar && <p className="text-sm text-gray-500 mt-1">Enviando avatar...</p>}
            {form.avatarUrl && (
              <div className="mt-2">
                <img src={imgUrl(form.avatarUrl)} alt="Prévia do avatar" className="h-16 w-16 rounded-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Senha</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Empresa</label>
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                <option value="">Selecione (opcional)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Perfil</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                <option value="ADMIN">Administrador</option>
                <option value="TECHNICIAN">Técnico</option>
                <option value="CLIENT">Cliente</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60">
              {saving ? 'Salvando...' : 'Criar Usuário'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded bg-gray-200 px-4 py-2 text-gray-800">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Usuários cadastrados</h2>
          <button type="button" onClick={fetchUsers} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">
            Atualizar lista
          </button>
        </div>
        {msgList && <p className="mt-2 text-sm text-red-600">{msgList}</p>}
        {loadingList ? (
          <p className="mt-4 text-gray-600">Carregando...</p>
        ) : users.length === 0 ? (
          <p className="mt-4 text-gray-600">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border bg-white">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Nome</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Sobrenome</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Email</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Username</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="px-4 py-2 text-sm">{u.name}</td>
                    <td className="px-4 py-2 text-sm">{u.lastName || '-'}</td>
                    <td className="px-4 py-2 text-sm">{u.email}</td>
                    <td className="px-4 py-2 text-sm">{u.username || '-'}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link href={`/configuracoes/usuarios/${u.id}`} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700">
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