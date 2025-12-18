"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { setAuth } from '@/lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${API_BASE}/auth/login`, {
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

  const isError = !!message && !message.toLowerCase().includes('sucesso');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Painel esquerdo */}
          <section className="flex flex-col justify-center bg-white p-8 sm:p-10">
            <div className="mb-8">
              <Image src="/logo.svg" alt="Tech Hub" width={150} height={40} />
            </div>
            <h1 className="text-2xl font-semibold">Acesso ao sistema</h1>
      <p className="mt-1 text-sm font-medium text-gray-600">Entre com as suas credenciais</p>

            <form onSubmit={onSubmit} className="mt-6">
              <div>
                <label className="sr-only">Usuário</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary"
          placeholder="Usuário"
                  required
                />
              </div>

              <div className="mt-4">
                <label className="sr-only">Senha</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary"
          placeholder="Senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-md px-2 text-gray-600 hover:text-primary"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.82 1 12c.52-1.23 1.24-2.36 2.12-3.36M9.9 4.24C10.58 4.09 11.28 4 12 4c5 0 9.27 3.18 11 8-.58 1.38-1.43 2.63-2.46 3.68M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="mt-6 w-full rounded-lg bg-primary px-3 py-2 text-white transition-colors hover:bg-primaryHover disabled:opacity-60"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    Log In
                  </span>
                ) : (
                  'Log In'
                )}
              </button>

              {message && (
                <div
                  className={
                    `mt-4 rounded-lg border px-3 py-2 text-sm ` +
                    (isError ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700')
                  }
                >
                  {message}
                </div>
              )}

              <div className="mt-3 text-center">
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-primary">Esqueceu a senha?</a>
              </div>
            </form>
          </section>

          {/* Lateral direita com ilustração */}
          <section className="relative hidden lg:flex items-center justify-center p-8">
            <img
              src="/login-illustration-hub.svg"
              alt="Ilustração hub conectada"
              className="w-full h-auto max-h-full max-w-full object-contain"
            />
          </section>
        </div>
      </div>
    </main>
  );
}
