"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getToken } from '@/lib/auth';

type VulnerabilityDetail = {
  id: string;
  title: string;
  description?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cve?: string | null;
  affectedAsset?: string | null;
  reportUrl?: string | null;
  createdAt: string;
};

export default function VulnerabilityDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || '';
  const [item, setItem] = useState<VulnerabilityDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        // Endpoint futuro: /vulnerabilities/:id
        const res = await apiGet<{ ok: boolean; data?: VulnerabilityDetail }>(`/vulnerabilities/${id}`, token);
        if (res?.ok && res.data) setItem(res.data);
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Detalhe da análise</h1>
        <Link href="/seguranca/vulnerabilidades" className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Voltar</Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted">Carregando...</div>
      ) : !item ? (
        <div className="text-sm text-error">Análise não encontrada.</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{item.title}</span>
            <span className={`px-2 py-1 rounded text-white ${
              item.severity === 'CRITICAL' ? 'bg-red-700' :
              item.severity === 'HIGH' ? 'bg-red-600' :
              item.severity === 'MEDIUM' ? 'bg-yellow-600' :
              'bg-green-600'
            }`}>
              {item.severity}
            </span>
          </div>
          {item.cve && <div className="text-sm"><span className="text-muted">CVE:</span> {item.cve}</div>}
          {item.affectedAsset && <div className="text-sm"><span className="text-muted">Ativo:</span> {item.affectedAsset}</div>}
          {item.reportUrl && (
            <div className="text-sm">
              <span className="text-muted">Relatório:</span> <a className="underline" href={item.reportUrl} target="_blank" rel="noreferrer">download</a>
            </div>
          )}
          {item.description && (
            <div className="text-sm whitespace-pre-line border rounded p-3 bg-card">{item.description}</div>
          )}
          <div className="text-xs text-muted">Criado em {new Date(item.createdAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}