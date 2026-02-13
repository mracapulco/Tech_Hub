"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Assessment = {
  id: string;
  date: string; // YYYY-MM-DD
  companyId: string;
  companyName: string;
  createdAt: string; // ISO
  totalScore?: number;
  maxScore?: number;
  answers?: Record<string, 0 | 1 | 2>;
  hasAnalysis?: boolean;
};

const STORAGE_KEY = 'cyber:maturity:list';

function formatDate(yyyyMmDd: string) {
  // Expecting YYYY-MM-DD
  const [y, m, d] = yyyyMmDd.split('-');
  if (!y || !m || !d) return yyyyMmDd;
  return `${d}/${m}/${y}`;
}

export default function MaturidadeListPage() {
  const [items, setItems] = useState<Assessment[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);
  const [hasImported, setHasImported] = useState(false);
  

  useEffect(() => {
    fetchItems();
    computePermissions();
  }, []);

  async function fetchItems() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: Assessment[] }>(`/maturity`, token);
      if (res?.ok) setItems(res.data || []);
    } catch {}
  }

  async function computePermissions() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string }[];
      setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
      setIsTech(memberships.some((m) => m.role === 'TECHNICIAN'));
    } catch {
      setIsAdmin(false);
      setIsTech(false);
    }
  }

  // Importa itens locais (anteriores) para o servidor quando admin/tech acessar
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (!(isAdmin || isTech)) return;
    if (hasImported) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const local: Assessment[] = raw ? JSON.parse(raw) : [];
      const serverIds = new Set(items.map((i) => i.id));
      const missing = (Array.isArray(local) ? local : []).filter((l) => !serverIds.has(l.id));
      (async () => {
        for (const m of missing) {
          try { await apiPost(`/maturity`, token, m); } catch {}
        }
        if (missing.length > 0) await fetchItems();
        setHasImported(true);
      })();
    } catch { setHasImported(true); }
  }, [isAdmin, isTech, items]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      // Sort by date desc then createdAt desc
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [items]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Maturidade de Segurança</h1>
        <div className="flex gap-2">
          {(isAdmin || isTech) && (
            <Link href="/seguranca/maturidade/nova" className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
              Novo
            </Link>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-gray-600">Nenhum teste de maturidade cadastrado ainda.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 border-b">Data</th>
                <th className="px-3 py-2 border-b">Empresa</th>
                <th className="px-3 py-2 border-b">Pontuação geral</th>
                <th className="px-3 py-2 border-b">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const ans = item.answers || {};
                const values = Object.values(ans) as number[];
                const computedSum = values.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                const max = typeof item.maxScore === 'number' ? item.maxScore : 58;
                const total = typeof item.totalScore === 'number' ? item.totalScore : computedSum;
                const percent = Math.round((total / max) * 100);
                let level = 'Inicial';
                let levelClass = 'bg-red-600 text-white';
                if (percent <= 24) { level = 'Inicial'; levelClass = 'bg-red-600 text-white'; }
                else if (percent <= 49) { level = 'Gerenciado'; levelClass = 'bg-yellow-500 text-white'; }
                else if (percent <= 74) { level = 'Definido'; levelClass = 'bg-blue-600 text-white'; }
                else { level = 'Adaptativo'; levelClass = 'bg-green-600 text-white'; }
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{formatDate(item.date)}</td>
                    <td className="px-3 py-2 border-b">{item.companyName}</td>
                    <td className="px-3 py-2 border-b">
                      <span className={`inline-block px-2 py-1 rounded ${levelClass}`}>{percent}% {level}</span>
                    </td>
                    <td className="px-3 py-2 border-b">
                      <div className="flex gap-2">
                        <Link href={`/seguranca/maturidade/${item.id}`} className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-black">
                          Visualizar
                        </Link>
                        {item.hasAnalysis && (
                          <Link href={`/seguranca/maturidade/${item.id}/analise`} className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
                            Análise
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}