"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPut, apiDelete, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type UserDetail = { id: string; username?: string | null; name: string; lastName?: string | null; email: string; status?: string; avatarUrl?: string | null; memberships?: { companyId: string; companyName?: string | null; role: string }[] };

export default function UsuarioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', lastName: '', email: '', username: '', password: '', avatarUrl: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function fetchDetail() {
    const token = getToken();
    if (!token) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; data?: UserDetail; error?: string }>(`/users/${id}`, token);
      if (!res?.ok || !res.data) {
        setError(res?.error || 'Usuário não encontrado.');
      } else {
        setUser(res.data);
        setForm({
          name: res.data.name || '',
          lastName: res.data.lastName || '',
          email: res.data.email || '',
          username: res.data.username || '',
          password: '',
          avatarUrl: (res.data.avatarUrl as any) || '',
        });
      }
    } catch {
      setError('Falha ao carregar usuário.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const token = getToken();
    if (!token) {
      setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      lastName: form.lastName.trim() || undefined,
      email: form.email.trim(),
      username: form.username.trim() || undefined,
    };
    if (form.avatarUrl.trim()) payload.avatarUrl = form.avatarUrl.trim();
    if (form.password.trim()) payload.password = form.password;
    try {
      const res = await apiPut<{ ok: boolean; data?: UserDetail; error?: string }>(`/users/${id}`, token, payload);
      if (!res?.ok) {
        setMsg({ type: 'error', text: res?.error || 'Falha ao atualizar usuário.' });
      } else {
        setMsg({ type: 'success', text: 'Usuário atualizado com sucesso.' });
        setEditing(false);
        setUser(res.data!);
      }
    } catch {
      setMsg({ type: 'error', text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const token = getToken();
    if (!token) return;
    if (!window.confirm('Excluir este usuário?')) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/users/${id}`, token);
    if (!res?.ok) {
      alert(res?.error || 'Falha ao excluir usuário.');
      return;
    }
    router.push('/configuracoes/usuarios');
  }

  if (loading) return <p>Carregando...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!user) return <p>Usuário não encontrado.</p>;

  return (
    <main>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={imgUrl(user.avatarUrl as any)} alt="Avatar" className="h-16 w-16 rounded-full object-cover" />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <p className="mt-2 text-gray-600">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">
            Voltar
          </button>
          <button onClick={() => setEditing((v) => !v)} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            {editing ? 'Cancelar Edição' : 'Editar'}
          </button>
          <button onClick={handleDelete} className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700">
            Excluir
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="mt-6 bg-white p-4 rounded shadow">
          <p><strong>Nome:</strong> {user.name}</p>
          <p><strong>Sobrenome:</strong> {user.lastName || '-'}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Username:</strong> {user.username || '-'}</p>
          <p><strong>Status:</strong> {user.status || '-'}</p>
          <div className="mt-4">
            {user.memberships && user.memberships.length > 0 ? (
              <div>
                <p className="font-medium">Perfis</p>
                <ul className="list-disc ml-5">
                  {user.memberships.map((m) => (
                    <li key={`${m.companyId}-${m.role}`}>
                      {(m.companyName || m.companyId)}: {roleLabelPtBr(m.role)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p><strong>Perfil:</strong> -</p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-6 space-y-4 max-w-2xl p-4 bg-white rounded shadow">
          {msg && (
            <div className={msg.type === 'error' ? 'text-red-600' : 'text-green-600'}>{msg.text}</div>
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
                  setMsg({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
                  return;
                }
                setUploadingAvatar(true);
                const res = await apiUpload('/uploads', token, file);
                setUploadingAvatar(false);
                if (!res?.ok || !res.path) {
                  setMsg({ type: 'error', text: res?.error || 'Falha ao enviar avatar.' });
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
            <label className="block text-sm font-medium">Senha (para alterar)</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div className="pt-2 flex gap-2">
            <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded bg-gray-200 px-4 py-2 text-gray-800">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
  function roleLabelPtBr(role?: string) {
    switch (role) {
      case 'ADMIN':
        return 'Administrador';
      case 'TECHNICIAN':
        return 'Técnico';
      case 'CLIENT':
        return 'Cliente';
      default:
        return role || '-';
    }
  }