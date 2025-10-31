"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAuth, getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const router = useRouter();
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed');
      if (stored) setCollapsed(stored === 'true');
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem('sidebarCollapsed', (!v).toString()); } catch {}
      return !v;
    });
  }

  function onLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <aside
      className={`flex flex-col ${collapsed ? 'w-16' : 'w-64'} h-screen bg-white border-r transition-all duration-200`}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-6 w-6">
            {/* Logo simples */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          {!collapsed && <h2 className="text-lg font-bold">Tech Hub</h2>}
        </div>
        <button
          onClick={toggleCollapsed}
          className="rounded p-2 hover:bg-gray-100"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {/* Ícone de recolher/expandir */}
          {collapsed ? (
            // Barra recolhida: mostrar seta para a direita (expandir)
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
              <path d="M4 12h16M14 6l6 6-6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            // Barra expandida: mostrar seta para a esquerda (recolher)
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
              <path d="M4 12h16M10 6l-6 6 6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      {!collapsed && user && (
        <div className="px-3 py-2 border-b text-sm text-gray-600">Olá, {user.name ?? user.username}</div>
      )}

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        <Link href="/dashboard" className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100" title="Dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path d="M3 13h8V3H3v10zm10 8h8V3h-8v18z" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>Dashboard</span>}
        </Link>

        {!collapsed ? (
          <details>
            <summary className="cursor-pointer flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 3l2 4 4 .5-3 3 .7 4.5-3.7-2-3.7 2 .7-4.5-3-3 4-.5 2-4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <span>Configurações</span>
            </summary>
            <div className="mt-1 ml-6 space-y-1">
              <Link href="/configuracoes/usuarios" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Usuários">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm-9 9c0-3.3 5.7-5 9-5s9 1.7 9 5v1H3v-1z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Usuários</span>
              </Link>
              <Link href="/configuracoes/empresas" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Empresas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M3 21V7l9-4 9 4v14H3zm9-10l9-4" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Empresas</span>
              </Link>
            </div>
          </details>
        ) : (
          <>
            <Link href="/configuracoes" className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100" title="Configurações">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 3l2 4 4 .5-3 3 .7 4.5-3.7-2-3.7 2 .7-4.5-3-3 4-.5 2-4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/configuracoes/usuarios" className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100" title="Usuários">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm-9 9c0-3.3 5.7-5 9-5s9 1.7 9 5v1H3v-1z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/configuracoes/empresas" className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100" title="Empresas">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M3 21V7l9-4 9 4v14H3zm9-10l9-4" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </Link>
          </>
        )}

      </nav>
      <div className="p-2 border-t mt-auto space-y-1">
        <Link href="/perfil" className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-100" title="Perfil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm-9 9c0-3.3 5.7-5 9-5s9 1.7 9 5v1H3v-1z" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>Perfil</span>}
        </Link>
        <button onClick={onLogout} className="flex items-center gap-3 w-full px-2 py-2 rounded hover:bg-gray-100 text-red-700" title="Sair">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path d="M10 17l5-5-5-5M4 12h11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}