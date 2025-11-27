"use client";
import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { getToken, clearAuth, getUser } from '@/lib/auth';

function imgUrl(u?: string | null) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = typeof window !== 'undefined' ? getUser() : null;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
    }
  }, [router]);

  const labelFromPath = (p: string | null): string => {
    if (!p) return 'Módulo';
    if (p.startsWith('/dashboard')) return 'Dashboard';
    if (p.startsWith('/seguranca')) return 'Segurança';
    if (p.startsWith('/configuracoes')) return 'Configurações';
    return 'Tech Hub';
  };

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-white/80 relative">
          <div className="text-sm text-muted">{labelFromPath(pathname)}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100"
            >
              {me?.avatarUrl ? (
                <img src={imgUrl(me.avatarUrl)} alt="Avatar" className="h-7 w-7 rounded-sm object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-sm bg-gray-300 flex items-center justify-center text-xs text-gray-700">
                  {(me?.name || me?.username || 'U').slice(0,1).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-text">{me?.name || me?.username || 'Usuário'}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-4 top-10 w-44 bg-white border border-border rounded shadow z-50">
                <Link href="/perfil" className="block px-3 py-2 text-sm hover:bg-gray-100">Perfil</Link>
                <Link href="/sobre" className="block px-3 py-2 text-sm hover:bg-gray-100">Sobre</Link>
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100">Sair</button>
              </div>
            )}
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}