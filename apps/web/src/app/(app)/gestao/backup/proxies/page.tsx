"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type Site = { id: string; name: string };
type Proxy = { id: string; hostname: string; cores: number; memoryGB: number; throughputMBps?: number; concurrency?: number; transportMode?: string };

export default function BackupProxiesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [list, setList] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hostname, setHostname] = useState("");
  const [cores, setCores] = useState<number>(4);
  const [memoryGB, setMemoryGB] = useState<number>(16);
  const [throughputMBps, setThroughputMBps] = useState<string>("");
  const [concurrency, setConcurrency] = useState<string>("");
  const [transportMode, setTransportMode] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    (async () => {
      try {
        const cr = await apiGet<{ ok: boolean; data?: Company[] }>("/companies", token);
        const arr = Array.isArray(cr?.data) ? cr.data : [];
        setCompanies(arr);
        const first = arr[0]?.id || "";
        setCompanyId(first);
      } catch { setError("Falha ao carregar empresas."); }
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !companyId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sr = await apiGet<any[]>(`/sites?companyId=${companyId}`, token);
        setSites(Array.isArray(sr) ? sr : []);
      } catch { setSites([]); }
      try {
        const rr = await apiGet<{ ok: boolean; data?: Proxy[] }>(`/backup/proxies?companyId=${companyId}`, token);
        setList(rr?.data || []);
      } catch { setError("Falha ao carregar proxies."); }
      setLoading(false);
    })();
  }, [companyId]);

  async function onCreateProxy() {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    setLoading(true);
    setError(null);
    try {
      const body = {
        companyId,
        siteId: siteId || undefined,
        hostname,
        cores,
        memoryGB,
        throughputMBps: throughputMBps ? Number(throughputMBps) : undefined,
        concurrency: concurrency ? Number(concurrency) : undefined,
        transportMode: transportMode || undefined,
        notes: notes || undefined,
      };
      const res = await apiPost<{ ok: boolean; data?: { id: string } }>(`/backup/proxies`, token, body);
      if (res?.ok) {
        const rr = await apiGet<{ ok: boolean; data?: Proxy[] }>(`/backup/proxies?companyId=${companyId}`, token);
        setList(rr?.data || []);
        setHostname(""); setCores(4); setMemoryGB(16); setThroughputMBps(""); setConcurrency(""); setTransportMode(""); setSiteId(""); setNotes("");
      } else {
        setError("Falha ao criar proxy.");
      }
    } catch {
      setError("Falha ao comunicar com a API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Backup — Proxies</h1>
      <div className="mt-3 flex gap-3 items-center">
        <label className="text-sm">Empresa</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="px-3 py-2 border rounded">
          {companies.map((c) => (<option key={c.id} value={c.id}>{c.fantasyName || c.name}</option>))}
        </select>
      </div>

      {error && (<p className="mt-3 text-sm text-error">{error}</p>)}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Cadastrar proxy</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Hostname</label>
                <input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="flex-1">
                <label className="text-sm">Site</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">—</option>
                  {sites.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-32">
                <label className="text-sm">Cores</label>
                <input type="number" value={cores} onChange={(e) => setCores(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-32">
                <label className="text-sm">Memória (GB)</label>
                <input type="number" value={memoryGB} onChange={(e) => setMemoryGB(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-40">
                <label className="text-sm">Throughput (MB/s)</label>
                <input value={throughputMBps} onChange={(e) => setThroughputMBps(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-32">
                <label className="text-sm">Concorrência</label>
                <input value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-40">
                <label className="text-sm">Modo</label>
                <select value={transportMode} onChange={(e) => setTransportMode(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">—</option>
                  <option value="hotadd">HotAdd</option>
                  <option value="nbd">NBD</option>
                  <option value="san">SAN</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm">Notas</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            <div>
              <button onClick={onCreateProxy} disabled={loading} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>Salvar</button>
            </div>
          </div>
        </section>

        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Proxies</h2>
          {loading ? (
            <div className="text-sm text-muted">Carregando…</div>
          ) : (
            <table className="min-w-full border rounded text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Hostname</th>
                  <th className="px-3 py-2 border-b text-right">Cores</th>
                  <th className="px-3 py-2 border-b text-right">Memória</th>
                  <th className="px-3 py-2 border-b text-right">Throughput</th>
                  <th className="px-3 py-2 border-b text-right">Concorrência</th>
                  <th className="px-3 py-2 border-b">Modo</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{r.hostname}</td>
                    <td className="px-3 py-2 border-b text-right">{r.cores}</td>
                    <td className="px-3 py-2 border-b text-right">{r.memoryGB}</td>
                    <td className="px-3 py-2 border-b text-right">{r.throughputMBps ?? ""}</td>
                    <td className="px-3 py-2 border-b text-right">{r.concurrency ?? ""}</td>
                    <td className="px-3 py-2 border-b">{r.transportMode ?? ""}</td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td className="px-3 py-2 border-b" colSpan={6}>Nenhum proxy.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
