"use client";
import { useEffect, useState } from 'react';
import { getToken, getUser, setAuth } from '@/lib/auth';
import { apiGet, apiPut, apiUpload } from '@/lib/api';

function imgUrl(u?: string | null) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type MeResponse = { ok: boolean; user?: { id: string; username?: string | null; name?: string | null; lastName?: string | null; email?: string | null; avatarUrl?: string | null } };
type UpdateResponse = MeResponse;

export default function PerfilPage() {
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiGet<MeResponse>('/users/me', token).then((res) => {
      if (res.ok && res.user) {
        setName(res.user.name ?? '');
        setLastName(res.user.lastName ?? '');
        setEmail(res.user.email ?? '');
        setAvatarUrl((res.user.avatarUrl as any) ?? '');
      }
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const token = getToken();
    if (!token) return;
    try {
      // Monta o corpo apenas com campos válidos para evitar limpar dados com strings vazias
      const body: any = {};
      if (typeof name === 'string' && name.trim()) body.name = name.trim();
      if (typeof lastName === 'string') body.lastName = lastName.trim();
      if (typeof email === 'string' && email.trim()) body.email = email.trim();
      if (avatarUrl) body.avatarUrl = avatarUrl;
      if (password) body.password = password;
      const res = await apiPut<UpdateResponse>('/users/me', token, body);
      if (res.ok && res.user) {
        const current = getUser();
        if (current) {
          setAuth(token, { ...current, name: res.user.name, lastName: res.user.lastName, email: res.user.email, avatarUrl: (res.user.avatarUrl as any) ?? null });
        }
        setMessage('Dados atualizados com sucesso!');
        setPassword('');
      } else {
        const anyRes: any = res as any;
        const detail = anyRes?.error || anyRes?.message;
        setMessage(detail ? `Falha ao atualizar dados: ${detail}` : 'Falha ao atualizar dados');
      }
    } catch {
      setMessage('Erro ao atualizar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="text-2xl font-bold">Meu Perfil</h1>
      <form onSubmit={onSubmit} className="mt-4 max-w-xl p-6 bg-white shadow rounded">
        {avatarUrl && (
          <div className="mb-4 flex items-center gap-3">
            <img src={imgUrl(avatarUrl)} alt="Meu avatar" className="h-16 w-16 rounded-full object-cover" />
            <span className="text-sm text-gray-600">Prévia do avatar</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Nome</label>
            <input className="w-full border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Sobrenome</label>
            <input className="w-full border rounded px-3 py-2" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border rounded px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-1">Avatar (arquivo)</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              const token = getToken();
              if (!token) {
                setMessage('Sessão expirada. Faça login novamente.');
                return;
              }
              setUploadingAvatar(true);
              try {
                const res = await apiUpload('/uploads', token, file);
                if (!res?.ok || !res.path) {
                  setMessage(res?.error ? `Falha ao enviar avatar: ${res.error}` : 'Falha ao enviar avatar.');
                  return;
                }
                setAvatarUrl(res.path!);
              } catch (err: any) {
                setMessage('Erro de rede ao enviar avatar. Verifique sua conexão.');
              } finally {
                setUploadingAvatar(false);
              }
            }}
          />
          {uploadingAvatar && <p className="text-sm text-gray-500 mt-1">Enviando avatar...</p>}
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-1">Avatar (URL)</label>
          <input className="w-full border rounded px-3 py-2" type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-1">Senha (deixe em branco para não alterar)</label>
          <input className="w-full border rounded px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="mt-6 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </form>
    </main>
  );
}