"use client";
import { useState } from 'react';
import Link from 'next/link';
import { apiPost, apiUpload } from '@/lib/api';
import { getToken } from '@/lib/auth';

type NewAnalysis = {
  title: string;
  description?: string;
  source?: 'MANUAL' | 'NESSUS' | 'OPENVAS' | 'OTHER';
  reportUrl?: string | null;
};

export default function NewVulnerabilityAnalysisPage() {
  const [data, setData] = useState<NewAnalysis>({ title: '', source: 'MANUAL' });
  const [uploading, setUploading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const token = getToken();
    if (!token) { setError('Sessão expirada.'); return; }
    setUploading(true); setError(null);
    try {
      const res = await apiUpload(`/uploads`, token, file);
      if (res?.ok && res.path) {
        setData({ ...data, reportUrl: res.path });
      } else {
        setError(res?.error || 'Falha ao enviar arquivo.');
      }
    } catch {
      setError('Erro de rede ao enviar arquivo.');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    const token = getToken();
    if (!token) { setError('Sessão expirada.'); return; }
    if (!data.title.trim()) { setError('Informe um título.'); return; }
    setSaving(true); setError(null);
    try {
      const payload: Record<string, any> = { title: data.title.trim(), source: data.source };
      if (data.description) payload.description = data.description;
      if (data.reportUrl) payload.reportUrl = data.reportUrl;
      // Endpoint futuro: /vulnerabilities
      const res = await apiPost<{ ok: boolean; id?: string; error?: string }>(`/vulnerabilities`, token, payload);
      if (res?.ok && res.id) {
        location.href = `/seguranca/vulnerabilidades/${res.id}`;
      } else {
        setError(res?.error || 'Falha ao salvar análise.');
      }
    } catch {
      setError('Erro de rede ao salvar.');
    }
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Nova análise de vulnerabilidades</h1>
      {error && <div className="px-3 py-2 rounded bg-error/10 text-error text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">Título</label>
          <input className="border border-border rounded px-2 py-1 w-full" value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Origem</label>
          <select className="border border-border rounded px-2 py-1 w-full" value={data.source} onChange={(e) => setData({ ...data, source: e.target.value as NewAnalysis['source'] })}>
            <option value="MANUAL">Manual</option>
            <option value="NESSUS">Nessus</option>
            <option value="OPENVAS">OpenVAS</option>
            <option value="OTHER">Outra</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Descrição (opcional)</label>
        <textarea className="border border-border rounded px-2 py-1 w-full" rows={3} value={data.description || ''} onChange={(e) => setData({ ...data, description: e.target.value })} />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Relatório (opcional)</label>
        <input type="file" className="block" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {data.reportUrl && <div className="mt-2 text-xs text-muted">Arquivo enviado: {data.reportUrl}</div>}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button disabled={saving} onClick={handleSave} className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">Salvar</button>
        <Link href="/seguranca/vulnerabilidades" className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Cancelar</Link>
      </div>
    </div>
  );
}