"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getUser, getToken } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import Image from 'next/image';

export default function Sidebar() {
  const router = useRouter();
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed');
      if (stored) setCollapsed(stored === 'true');
    } catch (e) {}
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? getToken() : null;
    if (!token || !user?.id) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [user?.id]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem('sidebarCollapsed', (!prev).toString());
      } catch (e) {}
      return !prev;
    });
  };

  const onLogout = () => {
    clearAuth();
    router.push('/login');
  };

  return (
    <div className={`flex flex-col ${collapsed ? 'w-16' : 'w-56'} h-screen bg-sidebar text-white border-r border-border transition-all duration-200`}>
      <div className={`flex items-center h-16 py-0 ${collapsed ? 'px-1 justify-center' : 'px-3 justify-center'}`}>
        <div className={`flex items-center justify-center w-full`}>
          {collapsed ? (
            <Image src="/logo_white.svg" alt="Tech Hub" width={32} height={22} priority />
          ) : (
            <Image src="/logo_white.svg" alt="Tech Hub" width={88} height={62} priority />
          )}
        </div>
      </div>

      

      <nav className="flex-1 px-2 pt-0 pb-2 space-y-1 overflow-y-auto">
        <Link
          href="/dashboard"
          className={`flex items-center w-full ${collapsed ? 'justify-center' : 'gap-3'} px-2 pt-0 pb-2 rounded hover:bg-sidebarHover`}
          title="Dashboard"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path d="M3 13h8V3H3v10zm10 8h8V3h-8v18z" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>Dashboard</span>}
        </Link>

        {/* Segurança → Maturidade / Vulnerabilidades */}
        {!collapsed ? (
          <details>
            <summary className="cursor-pointer flex items-center justify-between px-2 py-2 rounded hover:bg-primary/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <span className="ml-3">Segurança</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 ml-auto">
                <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="mt-1 ml-6 space-y-1">
              <Link href="/seguranca/maturidade" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-primary/10" title="Maturidade">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Maturidade</span>
              </Link>
              <Link href="/seguranca/vulnerabilidades" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-primary/10" title="Vulnerabilidades">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Vulnerabilidades</span>
              </Link>
            </div>
          </details>
        ) : (
          <div className="relative group">
            <Link
              href="/seguranca"
              className={`flex items-center w-full ${collapsed ? 'justify-center' : 'gap-3'} px-2 py-2 rounded hover:bg-sidebarHover`}
              title="Segurança"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="absolute left-full top-0 ml-2 w-48 bg-card border border-border rounded shadow p-2 hidden group-hover:block z-50 text-text">
              <div className="text-xs text-muted px-1 pb-1">Segurança</div>
              <Link href="/seguranca/maturidade" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Maturidade">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Maturidade</span>
              </Link>
              <Link href="/seguranca/vulnerabilidades" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Vulnerabilidades">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 2l9 4-9 4-9-4 9-4zm0 8l9-4v8l-9 4-9-4V6l9 4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Vulnerabilidades</span>
              </Link>
            </div>
          </div>
        )}

        {/* Configurações — manter sempre abaixo dos outros itens */}
        {!collapsed ? (
          <details>
            <summary className="cursor-pointer flex items-center justify-between px-2 py-2 rounded hover:bg-sidebarHover">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 3l2 4 4 .5-3 3 .7 4.5-3.7-2-3.7 2 .7-4.5-3-3 4-.5 2-4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <span className="ml-3">Configurações</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 ml-auto">
                <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="mt-1 ml-6 space-y-1">
              <Link href="/configuracoes/usuarios" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="Usuários">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm-9 9c0-3.3 5.7-5 9-5s9 1.7 9 5v1H3v-1z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Usuários</span>
              </Link>
              <Link href="/configuracoes/empresas" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="Empresas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M3 21V7l9-4 9 4v14H3zm9-10l9-4" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Empresas</span>
              </Link>
              <Link href="/configuracoes/marcas" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="Marcas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M4 6h16M4 12h12M4 18h8" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Marcas</span>
              </Link>
              <Link href="/configuracoes/dispositivos" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="Dispositivos">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M6 3h12v14H6zM9 20h6" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Dispositivos</span>
              </Link>
              <Link href="/configuracoes/tipo-dispositivo" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="Tipo de dispositivo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M4 4h16v6H4zM4 14h10v6H4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Tipo de dispositivo</span>
              </Link>
              {isAdmin && (
                <Link href="/configuracoes/ia" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-sidebarHover" title="IA">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path d="M4 6h16M4 12h12M4 18h8" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>IA</span>
                </Link>
              )}
            </div>
          </details>
        ) : (
          <div className="relative group">
            <Link
              href="/configuracoes"
              className={`flex items-center w-full ${collapsed ? 'justify-center' : 'gap-3'} px-2 py-2 rounded hover:bg-sidebarHover`}
              title="Configurações"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path d="M12 3l2 4 4 .5-3 3 .7 4.5-3.7-2-3.7 2 .7-4.5-3-3 4-.5 2-4z" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="absolute left-full top-0 ml-2 w-48 bg-card border border-border rounded shadow p-2 hidden group-hover:block z-50 text-text">
              <div className="text-xs text-muted px-1 pb-1">Configurações</div>
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
              <Link href="/configuracoes/marcas" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Marcas">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M4 6h16M4 12h12M4 18h8" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Marcas</span>
              </Link>
              <Link href="/configuracoes/dispositivos" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Dispositivos">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M6 3h12v14H6zM9 20h6" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Dispositivos</span>
              </Link>
              <Link href="/configuracoes/tipo-dispositivo" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="Tipo de dispositivo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M4 4h16v6H4zM4 14h10v6H4z" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Tipo de dispositivo</span>
              </Link>
              {isAdmin && (
                <Link href="/configuracoes/ia" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100" title="IA">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path d="M4 6h16M4 12h12M4 18h8" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>IA</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      <div className="p-2 mt-auto space-y-1">
        <button
          onClick={toggleCollapsed}
          className={`flex items-center w-full ${collapsed ? 'justify-center' : 'gap-3'} px-2 py-2 rounded hover:bg-sidebarHover`}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {!collapsed && <span>{collapsed ? 'Expandir' : 'Recolher'}</span>}
        </button>
      </div>
    </div>
  );
}