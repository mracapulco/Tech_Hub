"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiDownload } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type AuditLogRow = {
  id: string;
  createdAt: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description: string;
  changes?: unknown;
  httpMethod?: string | null;
  route?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: "SUCCESS" | "FAILURE";
  errorMessage?: string | null;
  severity: "INFO" | "SECURITY";
};

type CompanyItem = { id: string; name: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDate(d);
}

const emptyFilters = {
  dateFrom: defaultDateFrom(),
  dateTo: isoDate(new Date()),
  companyId: "",
  action: "",
  entityType: "",
  status: "",
  severity: "",
  search: "",
};

export default function AuditoriaPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [filters, setFilters] = useState(emptyFilters);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function buildQuery(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", `${filters.dateTo}T23:59:59.999Z`);
    if (filters.companyId) params.set("companyId", filters.companyId);
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.search) params.set("search", filters.search);
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  }

  async function fetchPage(reset: boolean) {
    const token = getToken();
    if (!token) return;
    if (reset) {
      setLoading(true);
      setErrorMsg(null);
    } else {
      setLoadingMore(true);
    }
    const query = buildQuery(reset ? undefined : cursor ? { cursor } : undefined);
    const res = await apiGet<{ ok: boolean; data?: AuditLogRow[]; nextCursor?: string | null; error?: string }>(`/audit-logs?${query}`, token);
    setLoading(false);
    setLoadingMore(false);
    if (!res?.ok) {
      if (res?.error === "Forbidden") setForbidden(true);
      setErrorMsg(res?.error || "Falha ao carregar o log de auditoria.");
      return;
    }
    setRows((prev) => (reset ? res.data || [] : [...prev, ...(res.data || [])]));
    setCursor(res.nextCursor ?? null);
  }

  async function fetchMeta() {
    const token = getToken();
    if (!token) return;
    const [companiesRes, metaRes] = await Promise.all([
      apiGet<{ ok: boolean; data?: CompanyItem[] }>(`/companies`, token),
      apiGet<{ ok: boolean; data?: { actions: string[]; entityTypes: string[] } }>(`/audit-logs/meta`, token),
    ]);
    if (companiesRes?.ok) setCompanies((companiesRes.data || []).map((c: any) => ({ id: c.id, name: c.name })));
    if (metaRes?.ok && metaRes.data) {
      setActions(metaRes.data.actions || []);
      setEntityTypes(metaRes.data.entityTypes || []);
    }
  }

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setCheckingAccess(false);
      setForbidden(true);
      return;
    }
    (async () => {
      await fetchPage(true);
      await fetchMeta();
      setCheckingAccess(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport() {
    const token = getToken();
    if (!token) return;
    if (!filters.dateFrom || !filters.dateTo) {
      alert("Selecione um período (De/Até) para exportar.");
      return;
    }
    setExporting(true);
    const res = await apiDownload(`/audit-logs/export?${buildQuery()}`, token, "audit-logs.csv");
    setExporting(false);
    if (!res.ok) alert(res.error || "Falha ao exportar.");
  }

  if (checkingAccess) {
    return (
      <main>
        <p className="text-gray-600">Carregando...</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Acesso restrito a administradores.
        </p>
      </main>
    );
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auditoria</h1>
          <p className="mt-2 text-gray-600">Histórico de ações de usuários: autenticação, alterações e leituras sensíveis.</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {exporting ? "Exportando..." : "Exportar CSV"}
        </button>
      </div>

      <section className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 shadow-sm md:grid-cols-4 lg:grid-cols-7">
        <div>
          <label className="block text-xs font-medium text-gray-600">De</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Até</label>
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Empresa</label>
          <select value={filters.companyId} onChange={(e) => setFilters({ ...filters, companyId: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm">
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Ação</label>
          <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm">
            <option value="">Todas</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Entidade</label>
          <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm">
            <option value="">Todas</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Status</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm">
            <option value="">Todos</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="FAILURE">Falha</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Buscar</label>
          <input type="text" placeholder="usuário, descrição..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="mt-1 w-full rounded border border-border px-2 py-1 text-sm" />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-7 flex justify-end">
          <button type="button" onClick={() => fetchPage(true)} className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-800">
            Aplicar filtros
          </button>
        </div>
      </section>

      {errorMsg && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>}

      <section className="mt-4 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Data/Hora</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Usuário</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Empresa</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Ação</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Descrição</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-600">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-600">Nenhum registro encontrado para os filtros selecionados.</td></tr>
            ) : (
              rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    className="border-b border-border odd:bg-white even:bg-gray-50 hover:bg-gray-100 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{new Date(row.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{row.actorName || row.actorUsername || "—"}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{row.companyName || "—"}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      <span className={row.severity === "SECURITY" ? "rounded bg-amber-100 px-2 py-0.5 text-amber-800" : "rounded bg-gray-100 px-2 py-0.5"}>{row.action}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">{row.description}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={row.status === "SUCCESS" ? "rounded bg-green-100 px-2 py-0.5 text-green-800" : "rounded bg-red-100 px-2 py-0.5 text-red-800"}>
                        {row.status === "SUCCESS" ? "Sucesso" : "Falha"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-gray-50 border-b border-border">
                      <td colSpan={6} className="px-3 py-3 text-xs text-gray-700">
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <div><span className="font-medium">IP:</span> {row.ipAddress || "—"}</div>
                          <div><span className="font-medium">Método:</span> {row.httpMethod || "—"}</div>
                          <div><span className="font-medium">Rota:</span> {row.route || "—"}</div>
                          <div><span className="font-medium">Entidade:</span> {row.entityType || "—"} {row.entityId ? `(${row.entityId})` : ""}</div>
                        </div>
                        {row.errorMessage && <div className="mt-2 text-red-700"><span className="font-medium">Erro:</span> {row.errorMessage}</div>}
                        {!!row.changes && (
                          <pre className="mt-2 max-h-64 overflow-auto rounded bg-white border border-border p-2">{JSON.stringify(row.changes, null, 2)}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </section>

      {cursor && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => fetchPage(false)} disabled={loadingMore} className="rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-300 disabled:opacity-60">
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}
    </main>
  );
}
