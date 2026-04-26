"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type Repo = { id: string; name: string };
type Proxy = { id: string; hostname: string };
type Job = { id: string; name: string; type: string; repositoryId: string; proxyId?: string; enabled: boolean };
type Run = { id: string; status: string; startAt: string; endAt?: string; processedGB?: number; transferredGB?: number };

export default function BackupRotinasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("vm");
  const [schedule, setSchedule] = useState("");
  const [retentionPolicy, setRetentionPolicy] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [proxyId, setProxyId] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [bulkJobId, setBulkJobId] = useState("");
  const [runsJson, setRunsJson] = useState("");

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
        const rr = await apiGet<{ ok: boolean; data?: Repo[] }>(`/backup/repositories?companyId=${companyId}`, token);
        setRepos(rr?.data || []);
      } catch { setRepos([]); }
      try {
        const pr = await apiGet<{ ok: boolean; data?: Proxy[] }>(`/backup/proxies?companyId=${companyId}`, token);
        setProxies(pr?.data || []);
      } catch { setProxies([]); }
      try {
        const jr = await apiGet<{ ok: boolean; data?: Job[] }>(`/backup/jobs?companyId=${companyId}`, token);
        setJobs(jr?.data || []);
      } catch { setJobs([]); }
      try {
        const since = new Date(); since.setDate(since.getDate() - 30);
        const sr = await apiGet<{ ok: boolean; data?: Run[] }>(`/backup/runs?companyId=${companyId}&since=${since.toISOString()}`, token);
        setRuns(sr?.data || []);
      } catch { setRuns([]); }
      setLoading(false);
    })();
  }, [companyId]);

  async function onCreateJob() {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    setLoading(true);
    setError(null);
    try {
      const body = {
        companyId,
        name,
        type,
        schedule: schedule || undefined,
        retentionPolicy: retentionPolicy || undefined,
        repositoryId,
        proxyId: proxyId || undefined,
        enabled,
      };
      const res = await apiPost<{ ok: boolean; data?: { id: string } }>(`/backup/jobs`, token, body);
      if (res?.ok) {
        const jr = await apiGet<{ ok: boolean; data?: Job[] }>(`/backup/jobs?companyId=${companyId}`, token);
        setJobs(jr?.data || []);
        setName(""); setType("vm"); setSchedule(""); setRetentionPolicy(""); setRepositoryId(""); setProxyId(""); setEnabled(true);
      } else {
        setError("Falha ao criar job.");
      }
    } catch { setError("Falha ao comunicar com a API."); } finally { setLoading(false); }
  }

  async function onBulkRuns() {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    setLoading(true);
    setError(null);
    try {
      const arr = JSON.parse(runsJson);
      if (!Array.isArray(arr)) { setError("JSON inválido: use um array."); setLoading(false); return; }
      const res = await apiPost<{ ok: boolean; data?: any }>(`/backup/runs/bulk/${bulkJobId}`, token, { runs: arr });
      if (res?.ok) {
        const since = new Date(); since.setDate(since.getDate() - 30);
        const sr = await apiGet<{ ok: boolean; data?: Run[] }>(`/backup/runs?companyId=${companyId}&since=${since.toISOString()}`, token);
        setRuns(sr?.data || []);
        setRunsJson("");
      } else {
        setError("Falha ao importar execuções.");
      }
    } catch { setError("Falha ao comunicar com a API ou JSON inválido."); } finally { setLoading(false); }
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Backup — Rotinas</h1>
      <div className="mt-3 flex gap-3 items-center">
        <label className="text-sm">Empresa</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="px-3 py-2 border rounded">
          {companies.map((c) => (<option key={c.id} value={c.id}>{c.fantasyName || c.name}</option>))}
        </select>
      </div>

      {error && (<p className="mt-3 text-sm text-error">{error}</p>)}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Cadastrar job</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-40">
                <label className="text-sm">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="vm">VM</option>
                  <option value="agent">Agent</option>
                  <option value="sql">SQL</option>
                  <option value="file">File</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Agendamento</label>
                <input value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: diariamente 22:00" />
              </div>
              <div className="flex-1">
                <label className="text-sm">Retenção</label>
                <input value={retentionPolicy} onChange={(e) => setRetentionPolicy(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: 30 dias" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Repositório</label>
                <select value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">—</option>
                  {repos.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm">Proxy</label>
                <select value={proxyId} onChange={(e) => setProxyId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">—</option>
                  {proxies.map((p) => (<option key={p.id} value={p.id}>{p.hostname}</option>))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input id="enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <label htmlFor="enabled">Ativado</label>
            </div>
            <div>
              <button onClick={onCreateJob} disabled={loading} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>Salvar</button>
            </div>
          </div>
        </section>

        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Importar execuções (JSON)</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Job</label>
                <select value={bulkJobId} onChange={(e) => setBulkJobId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">—</option>
                  {jobs.map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                </select>
              </div>
            </div>
            <div>
              <textarea value={runsJson} onChange={(e) => setRunsJson(e.target.value)} className="w-full px-3 py-2 border rounded" rows={8} placeholder='[{"startAt":"2026-02-01T02:00:00Z","endAt":"2026-02-01T02:30:00Z","status":"SUCCESS","processedGB":120,"avgSpeedMBps":85}]' />
            </div>
            <div>
              <button onClick={onBulkRuns} disabled={loading || !bulkJobId} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>Importar</button>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Jobs</h2>
          {loading ? (
            <div className="text-sm text-muted">Carregando…</div>
          ) : (
            <table className="min-w-full border rounded text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Nome</th>
                  <th className="px-3 py-2 border-b">Tipo</th>
                  <th className="px-3 py-2 border-b">Repo</th>
                  <th className="px-3 py-2 border-b">Proxy</th>
                  <th className="px-3 py-2 border-b">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{j.name}</td>
                    <td className="px-3 py-2 border-b">{j.type}</td>
                    <td className="px-3 py-2 border-b">{repos.find(r => r.id === j.repositoryId)?.name || ""}</td>
                    <td className="px-3 py-2 border-b">{proxies.find(p => p.id === j.proxyId)?.hostname || ""}</td>
                    <td className="px-3 py-2 border-b">{j.enabled ? "Sim" : "Não"}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr><td className="px-3 py-2 border-b" colSpan={5}>Nenhum job.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Execuções (30 dias)</h2>
          {loading ? (
            <div className="text-sm text-muted">Carregando…</div>
          ) : (
            <table className="min-w-full border rounded text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Job</th>
                  <th className="px-3 py-2 border-b">Status</th>
                  <th className="px-3 py-2 border-b">Início</th>
                  <th className="px-3 py-2 border-b">Fim</th>
                  <th className="px-3 py-2 border-b text-right">Processado (GB)</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const j = jobs.find(x => x.id === (r as any).jobId);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b">{j?.name || ""}</td>
                      <td className="px-3 py-2 border-b">{r.status}</td>
                      <td className="px-3 py-2 border-b">{new Date(r.startAt).toLocaleString()}</td>
                      <td className="px-3 py-2 border-b">{r.endAt ? new Date(r.endAt).toLocaleString() : ""}</td>
                      <td className="px-3 py-2 border-b text-right">{r.processedGB ?? ""}</td>
                    </tr>
                  );
                })}
                {runs.length === 0 && (
                  <tr><td className="px-3 py-2 border-b" colSpan={5}>Nenhuma execução.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
