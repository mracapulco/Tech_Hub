"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { getToken } from '@/lib/auth';

type Vulnerability = {
  id: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cve?: string | null;
  affectedAsset?: string | null;
  createdAt: string;
};

export default function VulnerabilitiesPage() {
  const [items, setItems] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        // Endpoint futuro: /vulnerabilities
        const res = await apiGet<{ ok: boolean; data?: Vulnerability[] }>(`/vulnerabilities`, token);
        if (res?.ok && Array.isArray(res.data)) setItems(res.data);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Análise de Vulnerabilidades</h1>
        <div className="flex gap-2">
          <Link href="/seguranca/vulnerabilidades/nova" className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
            Nova análise
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted">Carregando...</div>
      ) : (
        <div className="rounded border border-border bg-card">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-muted">Nenhuma análise cadastrada ainda.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">Severidade</th>
                  <th className="text-left px-3 py-2">CVE</th>
                  <th className="text-left px-3 py-2">Ativo afetado</th>
                  <th className="text-left px-3 py-2">Criado em</th>
                  <th className="text-left px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{v.title}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded text-white ${
                        v.severity === 'CRITICAL' ? 'bg-red-700' :
                        v.severity === 'HIGH' ? 'bg-red-600' :
                        v.severity === 'MEDIUM' ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}>
                        {v.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2">{v.cve || '-'}</td>
                    <td className="px-3 py-2">{v.affectedAsset || '-'}</td>
                    <td className="px-3 py-2">{new Date(v.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <Link href={`/seguranca/vulnerabilidades/${v.id}`} className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-black">
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}