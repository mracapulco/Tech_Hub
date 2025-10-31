"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAuth } from '@/lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data?.ok) {
        setMessage('Login realizado com sucesso!');
        if (data.token && data.user) {
          setAuth(data.token, data.user);
        }
        router.push('/dashboard');
      } else {
        setMessage(data?.message || 'Falha no login');
      }
    } catch (err) {
      setMessage('Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm p-6 bg-white shadow rounded">
        <h1 className="text-2xl font-bold">Entrar</h1>
        <div className="mt-4">
          <label className="block text-sm mb-1">Usuário</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="admin"
            required
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-1">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="••••••••"
            required
          />
        </div>
        <button
          type="submit"
          className="mt-6 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
        {message && <p className="mt-3 text-center text-sm text-gray-700">{message}</p>}
      </form>
    </main>
  );
}