"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { getToken } from '@/lib/auth';

type Company = { id: string; name: string };

export default function ZabbixConfigPage() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [url, setUrl] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [groupPrefix, setGroupPrefix] = useState('');
  const [maskedToken, setMaskedToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ totalHosts?: number; addedOrUpdated?: number } | null>(null);
  const [debugData, setDebugData] = useState<any | null>(null);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [dnsFallback, setDnsFallback] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const res = await apiGet<{ ok: boolean; data: any[] }>(`/companies`, token);
      if (res?.ok) setCompanies(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      if (!token || !companyId) { setUrl(''); setGroupPrefix(''); setMaskedToken(''); setTokenInput(''); setSyncResult(null); return; }
      try {
        const cfg = await apiGet<{ ok: boolean; data?: { url?: string; groupPrefix?: string; maskedToken?: string } }>(`/integrations/zabbix/config?companyId=${companyId}`, token);
        if (cfg?.ok && cfg.data) {
          setUrl(cfg.data.url || '');
          setGroupPrefix(cfg.data.groupPrefix || '');
          setMaskedToken(cfg.data.maskedToken || '');
          setTokenInput('');
        } else {
          setUrl(''); setGroupPrefix(''); setMaskedToken(''); setTokenInput('');
        }
      } catch {
        setUrl(''); setGroupPrefix(''); setMaskedToken(''); setTokenInput('');
      }
    })();
  }, [token, companyId]);

  const saveConfig = async () => {
    if (!token || !companyId) return;
    setLoading(true); setMessage(''); setError('');
    try {
      if (!url || !tokenInput) { setError('Informe URL e Token.'); return; }
      const res = await apiPost<{ ok: boolean; error?: string }>(`/integrations/zabbix/config`, token, { companyId, url, token: tokenInput, groupPrefix: groupPrefix || undefined });
      if (res?.ok) {
        setMessage('Configuração salva.');
        setMaskedToken(tokenInput.length > 8 ? `${tokenInput.slice(0,3)}****${tokenInput.slice(-4)}` : '****');
        setTokenInput('');
      } else {
        setError(res?.error || 'Falha ao salvar configuração.');
      }
    } catch {
      setError('Falha ao comunicar com a API.');
    } finally {
      setLoading(false);
    }
  };

  const runSync = async () => {
    if (!token || !companyId) return;
    setSyncing(true); setSyncResult(null); setError(''); setMessage('');
    try {
      const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/integrations/zabbix/sync`, token, { companyId, debug: true, dnsFallback });
      if (res?.ok && res.data) {
        setSyncResult({ totalHosts: res.data.totalHosts, addedOrUpdated: res.data.addedOrUpdated });
        setDebugData(res.data);
        setMessage(`Sincronização concluída.`);
        
      } else {
        setError(res?.error || 'Falha na sincronização.');
      }
    } catch {
      setError('Falha ao comunicar com a API.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Integração Zabbix</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded p-4">
          <div className="mb-3">
            <label className="block text-sm mb-1">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Selecione...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">URL do Zabbix (ex.: https://zabbix.exemplo.com)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Token de API</label>
            <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={maskedToken ? `Atual: ${maskedToken}` : ''} className="w-full border border-border rounded px-2 py-2" />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Prefixo de grupo (opcional)</label>
            <input value={groupPrefix} onChange={(e) => setGroupPrefix(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: TGM" />
            <div className="text-xs text-muted mt-1">Ajuda a limitar a sincronização aos grupos do cliente (ex.: TGM/...).</div>
          </div>
        <div className="flex gap-2">
          <button onClick={saveConfig} disabled={loading || !companyId} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar Configuração'}</button>
          <button onClick={runSync} disabled={syncing || !companyId} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{syncing ? 'Sincronizando...' : 'Sincronizar Zabbix'}</button>
        </div>
        <div className="mt-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dnsFallback} onChange={(e) => setDnsFallback(e.target.checked)} />
            Usar fallback DNS (mais lento)
          </label>
        </div>
          {message && (<div className="mt-2 text-sm text-green-700">{message}</div>)}
          {error && (<div className="mt-2 text-sm text-red-700">{error}</div>)}
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-2">Resultado da Sincronização</h2>
          {!syncResult ? (
            <div className="text-sm text-muted">Nenhuma sincronização executada ainda.</div>
          ) : (
            <div className="text-sm">
              Total de hosts: {syncResult.totalHosts || 0}<br />
              Adicionados/Atualizados: {syncResult.addedOrUpdated || 0}
              {debugData && (
                <div className="mt-2 text-xs text-muted">
                  Subnets (empresa): {debugData.subnetsTotal ?? 0} · Filtro grupos: {debugData.groupPrefix ?? '—'} ({debugData.groupIdsCount ?? 0} grupos) · Removidos pelo filtro: {debugData.groupFiltered ?? 0}
                  <br />Sem IP: {debugData.ipMissing ?? 0} · Fora de faixa: {debugData.unmatched ?? 0}
                </div>
              )}
            </div>
          )}
          {debugData && Array.isArray(debugData.unmatchedSamples) && debugData.unmatchedSamples.length > 0 && (
            <div className="mt-3">
              <div className="font-semibold mb-1">Amostras de hosts fora de faixa</div>
              <div className="text-xs text-muted mb-2">Crie os subnets correspondentes na empresa para estes IPs e re-sincronize.</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border"><th className="py-1">Host</th><th className="py-1">IP</th></tr>
                </thead>
                <tbody>
                  {debugData.unmatchedSamples.slice(0,10).map((s: any, idx: number) => (
                    <tr key={idx} className="border-b border-border"><td className="py-1">{s.host || '—'}</td><td className="py-1">{s.ip || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
