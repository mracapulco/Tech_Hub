"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type Site = { id: string; name: string };
type Repo = { id: string; name: string; type: string; capacityGB: number; usedGB: number; siteId?: string };

export default function BackupReposPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [list, setList] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("SOBR");
  const [capacityGB, setCapacityGB] = useState<number>(0);
  const [usedGB, setUsedGB] = useState<number>(0);
  const [siteId, setSiteId] = useState<string>("");
  const [retentionPolicy, setRetentionPolicy] = useState<string>("");
  const [compressionRatio, setCompressionRatio] = useState<string>("");
  const [dedupeRatio, setDedupeRatio] = useState<string>("");
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
        const rr = await apiGet<{ ok: boolean; data?: Repo[] }>(`/backup/repositories?companyId=${companyId}`, token);
        setList(rr?.data || []);
      } catch { setError("Falha ao carregar repositórios."); }
      setLoading(false);
    })();
  }, [companyId]);

  async function onCreateRepo() {
    const token = getToken();
    if (!token) { setError("Sessão expirada."); return; }
    setLoading(true);
    setError(null);
    try {
      const body = {
        companyId,
        siteId: siteId || undefined,
        name,
        type,
        capacityGB,
        usedGB,
        retentionPolicy: retentionPolicy || undefined,
        compressionRatio: compressionRatio ? Number(compressionRatio) : undefined,
        dedupeRatio: dedupeRatio ? Number(dedupeRatio) : undefined,
        notes: notes || undefined,
      };
      const res = await apiPost<{ ok: boolean; data?: { id: string } }>(`/backup/repositories`, token, body);
      if (res?.ok) {
        const rr = await apiGet<{ ok: boolean; data?: Repo[] }>(`/backup/repositories?companyId=${companyId}`, token);
        setList(rr?.data || []);
        setName(""); setType("SOBR"); setCapacityGB(0); setUsedGB(0); setSiteId(""); setRetentionPolicy(""); setCompressionRatio(""); setDedupeRatio(""); setNotes("");
      } else {
        setError("Falha ao criar repositório.");
      }
    } catch {
      setError("Falha ao comunicar com a API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Backup — Repositórios</h1>
      <div className="mt-3 flex gap-3 items-center">
        <label className="text-sm">Empresa</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="px-3 py-2 border rounded">
          {companies.map((c) => (<option key={c.id} value={c.id}>{c.fantasyName || c.name}</option>))}
        </select>
      </div>

      {error && (<p className="mt-3 text-sm text-error">{error}</p>)}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Cadastrar repositório</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-40">
                <label className="text-sm">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="SOBR">SOBR</option>
                  <option value="DirectAttach">DirectAttach</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-40">
                <label className="text-sm">Capacidade (GB)</label>
                <input type="number" value={capacityGB} onChange={(e) => setCapacityGB(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-40">
                <label className="text-sm">Em uso (GB)</label>
                <input type="number" value={usedGB} onChange={(e) => setUsedGB(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
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
              <div className="flex-1">
                <label className="text-sm">Retenção</label>
                <input value={retentionPolicy} onChange={(e) => setRetentionPolicy(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div className="w-40">
                <label className="text-sm">Compressão</label>
                <input value={compressionRatio} onChange={(e) => setCompressionRatio(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: 1.3" />
              </div>
              <div className="w-40">
                <label className="text-sm">Dedupe</label>
                <input value={dedupeRatio} onChange={(e) => setDedupeRatio(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="ex.: 1.5" />
              </div>
            </div>
            <div>
              <label className="text-sm">Notas</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded" rows={3} />
            </div>
            <div>
              <button onClick={onCreateRepo} disabled={loading} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>Salvar</button>
            </div>
          </div>
        </section>

        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-3">Repositórios</h2>
          {loading ? (
            <div className="text-sm text-muted">Carregando…</div>
          ) : (
            <table className="min-w-full border rounded text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Nome</th>
                  <th className="px-3 py-2 border-b">Tipo</th>
                  <th className="px-3 py-2 border-b text-right">Capacidade</th>
                  <th className="px-3 py-2 border-b text-right">Em uso</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{r.name}</td>
                    <td className="px-3 py-2 border-b">{r.type}</td>
                    <td className="px-3 py-2 border-b text-right">{r.capacityGB}</td>
                    <td className="px-3 py-2 border-b text-right">{r.usedGB}</td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td className="px-3 py-2 border-b" colSpan={4}>Nenhum repositório.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
