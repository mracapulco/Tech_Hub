"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Company = { id: string; name: string; fantasyName?: string };
type HostOption = { hostId: string; itemId: string; host: string; name: string; lastClock: number };
type TimelineResult = "Success" | "Failed" | "Warning" | "Running" | "Unknown";
type TimelineType = "Backup" | "Replica";
type Bucket = {
  label: string;
  start: string;
  end: string;
  active: boolean;
  result: "" | TimelineResult;
  title: string;
};
type TimelineRow = {
  jobId: string;
  name: string;
  type: TimelineType;
  overallResult: TimelineResult;
  sessionCount: number;
  firstStart: string;
  lastEnd: string;
  sessions: Array<{ id: string; start: string; end: string; result: TimelineResult; message: string; progressPercent: number | null }>;
  buckets: Bucket[];
};
type TimelinePayload = {
  host: { hostId: string; itemId: string; lastClock: number };
  meta: {
    source: string;
    date: string;
    timezone: string;
    bucketMinutes: number;
    bucketCount: number;
    rows: number;
    sessionsConsidered: number;
    zabbixItemId?: string;
    zabbixHistoryClock?: number;
  };
  summary: {
    byType: Record<TimelineType, number>;
    byResult: Record<TimelineResult, number>;
  };
  rows: TimelineRow[];
  message?: string;
};

function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function resultBadgeClass(result: TimelineResult) {
  if (result === "Success") return "bg-green-100 text-green-800 border-green-200";
  if (result === "Failed") return "bg-red-100 text-red-800 border-red-200";
  if (result === "Warning") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (result === "Running") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function cellClass(result: "" | TimelineResult, active: boolean) {
  if (!active) return "bg-white";
  if (result === "Success") return "bg-green-500";
  if (result === "Failed") return "bg-red-500";
  if (result === "Warning") return "bg-yellow-400";
  if (result === "Running") return "bg-blue-500";
  return "bg-gray-400";
}

function formatLastClock(unixSeconds?: number) {
  if (!unixSeconds) return "Sem coleta";
  return new Date(unixSeconds * 1000).toLocaleString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(";") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildCsvContent(timeline: TimelinePayload) {
  const bucketHeaders = timeline.rows[0]?.buckets.map((bucket) => bucket.label) || [];
  const headers = [
    "Rotina",
    "Tipo",
    "Sessoes",
    "Primeiro Inicio",
    "Ultimo Fim",
    ...bucketHeaders,
  ];
  const lines = [headers.map(escapeCsv).join(";")];

  for (const row of timeline.rows) {
    const values = [
      row.name,
      row.type,
      row.sessionCount,
      formatDateTime(row.firstStart),
      formatDateTime(row.lastEnd),
      ...row.buckets.map((bucket) => (bucket.active ? bucket.result || "Ativo" : "")),
    ];
    lines.push(values.map(escapeCsv).join(";"));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

function buildPdfHtml(input: {
  title: string;
  companyLabel: string;
  companyLogo?: string;
  hostLabel: string;
  timeline: TimelinePayload;
}) {
  const { title, companyLabel, companyLogo, hostLabel, timeline } = input;
  const bucketCount = timeline.rows[0]?.buckets.length || 0;
  const majorStep = Math.max(1, Math.round(120 / Math.max(15, timeline.meta.bucketMinutes)));
  const scaleLabels = timeline.rows[0]?.buckets
    .map((bucket, index) => {
      const showLabel = index % majorStep === 0;
      return `<div class="scale-label">${showLabel ? escapeHtml(bucket.label) : "&nbsp;"}</div>`;
    })
    .join("") || "";
  const rowsHtml = timeline.rows
    .map((row) => {
      const timelineCells = row.buckets
        .map((bucket) => {
          const resultClass = bucket.active ? `state-${String(bucket.result || "Unknown").toLowerCase()}` : "";
          return `<div class="timeline-cell ${resultClass}" title="${escapeHtml(bucket.title)}"></div>`;
        })
        .join("");

      return `
        <tr>
          <td class="routine-cell">
            <div class="routine-name">${escapeHtml(row.name)}</div>
            <div class="routine-meta">${escapeHtml(`${row.sessionCount} sessão(ões)`)}</div>
          </td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(`${formatDateTime(row.firstStart)} - ${formatDateTime(row.lastEnd)}`)}</td>
          <td>
            <div class="timeline-grid" style="grid-template-columns: repeat(${Math.max(1, bucketCount)}, minmax(0, 1fr));">
              ${timelineCells}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
          .container { padding: 10mm 12mm; }
          .header {
            display: grid;
            grid-template-columns: 1fr 2fr 1fr;
            gap: 16px;
            align-items: center;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 14px;
          }
          .logo-box {
            min-height: 68px;
            display: flex;
            align-items: center;
          }
          .logo {
            max-height: 58px;
            max-width: 180px;
            object-fit: contain;
          }
          .header-center { text-align: center; }
          .eyebrow {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: #2563eb;
            text-transform: uppercase;
          }
          h1 { font-size: 22px; margin: 6px 0 4px; }
          .subtitle { font-size: 12px; color: #4b5563; }
          .platform-meta {
            text-align: right;
            font-size: 11px;
            color: #4b5563;
            line-height: 1.5;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-top: 14px;
          }
          .info-card, .metric-card {
            border: 1px solid #dbe2ea;
            border-radius: 10px;
            background: #ffffff;
            padding: 10px 12px;
          }
          .label {
            display: block;
            font-size: 10px;
            font-weight: 700;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
          }
          .value {
            font-size: 13px;
            font-weight: 600;
            color: #111827;
          }
          .intro {
            margin-top: 14px;
            padding: 12px 14px;
            border-left: 4px solid #2563eb;
            background: #eff6ff;
            border-radius: 8px;
            font-size: 12px;
            color: #1f2937;
            line-height: 1.6;
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 10px;
            margin-top: 14px;
          }
          .metric-number {
            font-size: 22px;
            font-weight: 700;
            margin-top: 4px;
          }
          .legend {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            align-items: center;
            margin: 14px 0 8px;
            font-size: 11px;
            color: #4b5563;
          }
          .legend-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .legend-swatch {
            width: 12px;
            height: 12px;
            border-radius: 3px;
            border: 1px solid #d1d5db;
          }
          .section-title {
            font-size: 16px;
            font-weight: 700;
            margin: 16px 0 8px;
          }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #dbe2ea; padding: 8px; vertical-align: top; }
          th {
            background: #f8fafc;
            font-size: 11px;
            text-align: left;
            color: #374151;
          }
          td {
            font-size: 11px;
            color: #111827;
          }
          .routine-cell { width: 18%; }
          .routine-name { font-weight: 700; margin-bottom: 4px; }
          .routine-meta { font-size: 10px; color: #6b7280; }
          .scale-grid, .timeline-grid {
            display: grid;
            gap: 2px;
            width: 100%;
          }
          .scale-wrap {
            margin-top: 8px;
            margin-bottom: 8px;
            margin-left: calc(18% + 10% + 16% + 26px);
          }
          .scale-label {
            font-size: 8px;
            color: #6b7280;
            text-align: center;
            line-height: 1;
            white-space: nowrap;
          }
          .timeline-cell {
            height: 14px;
            border-radius: 3px;
            border: 1px solid #e5e7eb;
            background: #ffffff;
          }
          .state-success { background: #22c55e; border-color: #22c55e; }
          .state-failed { background: #ef4444; border-color: #ef4444; }
          .state-warning { background: #facc15; border-color: #facc15; }
          .state-running { background: #3b82f6; border-color: #3b82f6; }
          .state-unknown { background: #9ca3af; border-color: #9ca3af; }
          .footer {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
            font-size: 10px;
            color: #6b7280;
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }
          @media print {
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          @page { size: A4 landscape; margin: 10mm; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-box">
              ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" class="logo" alt="Logo da empresa" />` : ""}
            </div>
            <div class="header-center">
              <div class="eyebrow">Tech Hub Platform</div>
              <h1>${escapeHtml(title)}</h1>
              <div class="subtitle">Relatório operacional de linha do tempo diária das rotinas Veeam monitoradas via Zabbix</div>
            </div>
            <div class="platform-meta">
              <div><strong>Plataforma:</strong> Tech Hub</div>
              <div><strong>Módulo:</strong> Gestão &gt; Backup</div>
              <div><img src="/logo.svg" class="logo" alt="Tech Hub" /></div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-card"><span class="label">Cliente</span><div class="value">${escapeHtml(companyLabel)}</div></div>
            <div class="info-card"><span class="label">Host Veeam / Zabbix</span><div class="value">${escapeHtml(hostLabel)}</div></div>
            <div class="info-card"><span class="label">Data do relatório</span><div class="value">${escapeHtml(timeline.meta.date)}</div></div>
            <div class="info-card"><span class="label">Escala</span><div class="value">${escapeHtml(timeline.meta.bucketMinutes)} minutos</div></div>
            <div class="info-card"><span class="label">Item Zabbix</span><div class="value">${escapeHtml(timeline.meta.zabbixItemId || "-")}</div></div>
            <div class="info-card"><span class="label">Histórico coletado</span><div class="value">${escapeHtml(timeline.meta.zabbixHistoryClock ? formatLastClock(timeline.meta.zabbixHistoryClock) : "-")}</div></div>
            <div class="info-card"><span class="label">Fonte</span><div class="value">${escapeHtml(timeline.meta.source)}</div></div>
            <div class="info-card"><span class="label">Gerado em</span><div class="value">${escapeHtml(new Date().toLocaleString("pt-BR"))}</div></div>
          </div>

          <div class="intro">
            Este documento consolida as execuções de backup e réplica do dia selecionado, com base no histórico do item <strong>veeam.get.metrics</strong> no Zabbix. A linha do tempo abaixo destaca visualmente os intervalos em que cada rotina esteve ativa, facilitando análise operacional, evidência de execução e compartilhamento com o cliente.
          </div>

          <div class="metrics">
            <div class="metric-card"><span class="label">Total de rotinas</span><div class="metric-number">${escapeHtml(timeline.meta.rows)}</div></div>
            <div class="metric-card"><span class="label">Total de sessões</span><div class="metric-number">${escapeHtml(timeline.meta.sessionsConsidered)}</div></div>
            <div class="metric-card"><span class="label">Success</span><div class="metric-number" style="color:#166534;">${escapeHtml(timeline.summary.byResult.Success)}</div></div>
            <div class="metric-card"><span class="label">Failed</span><div class="metric-number" style="color:#b91c1c;">${escapeHtml(timeline.summary.byResult.Failed)}</div></div>
            <div class="metric-card"><span class="label">Warning</span><div class="metric-number" style="color:#a16207;">${escapeHtml(timeline.summary.byResult.Warning)}</div></div>
            <div class="metric-card"><span class="label">Running</span><div class="metric-number" style="color:#1d4ed8;">${escapeHtml(timeline.summary.byResult.Running)}</div></div>
          </div>

          <div class="section-title">Linha do tempo das rotinas</div>
          <div class="legend">
            <span class="legend-item"><span class="legend-swatch" style="background:#22c55e;border-color:#22c55e;"></span>Success</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#ef4444;border-color:#ef4444;"></span>Failed</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#facc15;border-color:#facc15;"></span>Warning</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#3b82f6;border-color:#3b82f6;"></span>Running</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#9ca3af;border-color:#9ca3af;"></span>Unknown</span>
          </div>
          <div class="scale-wrap">
            <div class="scale-grid" style="grid-template-columns: repeat(${Math.max(1, bucketCount)}, minmax(0, 1fr));">
              ${scaleLabels}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:18%;">Rotina</th>
                <th style="width:10%;">Tipo</th>
                <th style="width:16%;">Janela</th>
                <th>Timeline</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            <span>Relatório gerado por Tech Hub</span>
            <span>Documento em orientação horizontal para leitura operacional da timeline</span>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default function BackupReportPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [hostId, setHostId] = useState("");
  const [date, setDate] = useState(getTodayInSaoPaulo());
  const [bucketMinutes, setBucketMinutes] = useState("30");
  const [typeFilter, setTypeFilter] = useState<"all" | TimelineType>("all");
  const [resultFilter, setResultFilter] = useState<"all" | TimelineResult>("all");
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelinePayload | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingCompanies(true);
    setError(null);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Company[] }>("/companies", token);
        const nextCompanies = Array.isArray(res?.data) ? res.data : [];
        setCompanies(nextCompanies);
        setCompanyId(nextCompanies[0]?.id || "");
      } catch {
        setError("Falha ao carregar empresas.");
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !companyId) {
      setHosts([]);
      setHostId("");
      return;
    }
    setLoadingHosts(true);
    setError(null);
    setTimeline(null);
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: HostOption[]; error?: string }>(
          `/backup/veeam/hosts?companyId=${companyId}`,
          token,
        );
        if (!res?.ok) {
          setHosts([]);
          setHostId("");
          setError(res?.error || "Falha ao carregar hosts Veeam do Zabbix.");
          return;
        }
        const nextHosts = Array.isArray(res.data) ? res.data : [];
        setHosts(nextHosts);
        setHostId((current) => (nextHosts.some((host) => host.hostId === current) ? current : (nextHosts[0]?.hostId || "")));
      } catch {
        setHosts([]);
        setHostId("");
        setError("Falha ao carregar hosts Veeam do Zabbix.");
      } finally {
        setLoadingHosts(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    const token = getToken();
    if (!token || !companyId) {
      setCompanyLogoUrl("");
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: { logoUrl?: string | null } }>(`/companies/${companyId}`, token);
        setCompanyLogoUrl(imgUrl(res?.data?.logoUrl || ""));
      } catch {
        setCompanyLogoUrl("");
      }
    })();
  }, [companyId]);

  async function loadTimeline() {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!companyId || !hostId || !date) return;
    const selected = hosts.find((host) => host.hostId === hostId);
    if (!selected?.itemId) {
      setTimeline(null);
      setError("Item Veeam não identificado para o host selecionado.");
      return;
    }
    setLoadingTimeline(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        companyId,
        hostId,
        itemId: selected.itemId,
        date,
        bucketMinutes,
        timezone: "America/Sao_Paulo",
        type: typeFilter,
        result: resultFilter,
      });
      const res = await apiGet<{ ok: boolean; data?: TimelinePayload; error?: string }>(`/backup/veeam/timeline?${query.toString()}`, token);
      if (res?.ok && res.data) {
        setTimeline(res.data);
      } else {
        setTimeline(null);
        setError(res?.error || "Falha ao montar o relatório de backup.");
      }
    } catch {
      setTimeline(null);
      setError("Falha ao comunicar com a API.");
    } finally {
      setLoadingTimeline(false);
    }
  }

  useEffect(() => {
    if (companyId && hostId && date) {
      void loadTimeline();
    }
  }, [companyId, hostId]);

  const selectedCompanyLabel = useMemo(() => {
    const company = companies.find((item) => item.id === companyId);
    return company?.fantasyName || company?.name || "Empresa";
  }, [companies, companyId]);

  const selectedHost = useMemo(() => hosts.find((host) => host.hostId === hostId) || null, [hosts, hostId]);
  const displayedLastClock = timeline?.host?.lastClock || selectedHost?.lastClock || 0;

  function handleExportCsv() {
    if (!timeline || timeline.rows.length === 0) return;
    const fileName = `relatorio-backup-${date}-${(selectedHost?.name || "veeam").replace(/[^a-zA-Z0-9-_]+/g, "_")}.csv`;
    const content = buildCsvContent(timeline);
    downloadFile(fileName, content, "text/csv;charset=utf-8;");
  }

  function handleExportPdf() {
    if (!timeline || timeline.rows.length === 0) return;
    const html = buildPdfHtml({
      title: "Relatório de Backup Veeam",
      companyLabel: selectedCompanyLabel,
      companyLogo: companyLogoUrl,
      hostLabel: selectedHost?.name || "Host não selecionado",
      timeline,
    });
    setError(null);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 1000);
    };

    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (!frameWindow || !frameDocument) {
      cleanup();
      setError("Não foi possível preparar a exportação do PDF.");
      return;
    }

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    }, 400);
  }

  return (
    <main>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Relatório de Backup</h1>
          <p className="mt-2 text-sm text-gray-700">
            Linha do tempo diária das execuções Veeam com dados do item <code>veeam.get.metrics</code> no Zabbix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gestao/backup" className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50">
            Voltar
          </Link>
          <button
            onClick={handleExportCsv}
            disabled={!timeline || timeline.rows.length === 0}
            className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exportar CSV
          </button>
          <button
            onClick={handleExportPdf}
            disabled={!timeline || timeline.rows.length === 0}
            className="rounded border border-border bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted">
        {selectedHost ? `Última coleta: ${formatLastClock(displayedLastClock)}` : "Selecione um host Veeam para carregar o relatório."}
      </div>

      <section className="mt-6 rounded border border-border bg-card p-4 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Cliente</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
              disabled={loadingCompanies}
            >
              <option value="">Selecione...</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.fantasyName || company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Host Veeam / Zabbix</label>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
              disabled={loadingHosts || !companyId}
            >
              <option value="">{loadingHosts ? "Carregando..." : "Selecione..."}</option>
              {hosts.map((host) => (
                <option key={host.hostId} value={host.hostId}>
                  {host.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Data do relatório</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Escala</label>
            <select value={bucketMinutes} onChange={(e) => setBucketMinutes(e.target.value)} className="w-full rounded border border-border px-3 py-2">
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Tipo</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | TimelineType)}
              className="w-full rounded border border-border px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="Backup">Backup</option>
              <option value="Replica">Replica</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Resultado</label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value as "all" | TimelineResult)}
              className="w-full rounded border border-border px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
              <option value="Warning">Warning</option>
              <option value="Running">Running</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-muted">
            Cliente: {selectedCompanyLabel} {selectedHost ? `| Host: ${selectedHost.name}` : ""}
          </div>
          <button
            onClick={loadTimeline}
            disabled={loadingTimeline || !companyId || !hostId || !date}
            className={`rounded px-4 py-2 text-white ${loadingTimeline ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {loadingTimeline ? "Carregando..." : "Atualizar relatório"}
          </button>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Total de rotinas</div>
          <div className="mt-1 text-2xl font-semibold">{timeline?.meta.rows ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Total de sessões</div>
          <div className="mt-1 text-2xl font-semibold">{timeline?.meta.sessionsConsidered ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Success</div>
          <div className="mt-1 text-2xl font-semibold text-green-700">{timeline?.summary.byResult.Success ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Failed</div>
          <div className="mt-1 text-2xl font-semibold text-red-700">{timeline?.summary.byResult.Failed ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Warning</div>
          <div className="mt-1 text-2xl font-semibold text-yellow-700">{timeline?.summary.byResult.Warning ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Running</div>
          <div className="mt-1 text-2xl font-semibold text-blue-700">{timeline?.summary.byResult.Running ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Backup</div>
          <div className="mt-1 text-2xl font-semibold">{timeline?.summary.byType.Backup ?? 0}</div>
        </div>
        <div className="rounded border border-border bg-card p-4 shadow">
          <div className="text-xs text-muted">Replica</div>
          <div className="mt-1 text-2xl font-semibold">{timeline?.summary.byType.Replica ?? 0}</div>
        </div>
      </section>

      <section className="mt-6 rounded border border-border bg-card p-4 shadow">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">Linha do tempo diária</h2>
            <p className="text-xs text-muted">
              Cada célula é marcada quando a sessão cruza o intervalo do bucket. Escala atual: {timeline?.meta.bucketMinutes ?? Number(bucketMinutes)} minutos.
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            {timeline?.meta.source || "Selecione um cliente e um host para carregar o relatório."}
            {timeline?.meta.zabbixItemId ? ` | Item: ${timeline.meta.zabbixItemId}` : ""}
            {timeline?.meta.zabbixHistoryClock ? ` | Histórico: ${formatLastClock(timeline.meta.zabbixHistoryClock)}` : ""}
          </div>
        </div>

        {!timeline ? (
          <div className="rounded border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            {loadingTimeline ? "Carregando relatório..." : "Nenhum relatório carregado ainda."}
          </div>
        ) : timeline.rows.length === 0 ? (
          <div className="rounded border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            {timeline.message || "Nenhuma sessão encontrada para os filtros selecionados."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="min-w-max border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-30 min-w-[280px] border-b border-r border-border bg-gray-50 px-3 py-2 text-left">Rotina</th>
                  <th className="sticky z-30 min-w-[110px] border-b border-r border-border bg-gray-50 px-3 py-2 text-left" style={{ left: 280 }}>Tipo</th>
                  {timeline.rows[0]?.buckets.map((bucket) => (
                    <th key={bucket.start} className="min-w-[58px] border-b border-r border-border bg-gray-50 px-2 py-2 text-center text-xs font-medium">
                      {bucket.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeline.rows.map((row) => (
                  <tr key={row.jobId}>
                    <td className="sticky left-0 z-20 border-b border-r border-border bg-white px-3 py-2 align-top">
                      <div className="font-medium">{row.name}</div>
                      <div className="mt-1 text-xs text-muted">
                        {row.sessionCount} sessão(ões) | {new Date(row.firstStart).toLocaleString("pt-BR")} até {new Date(row.lastEnd).toLocaleString("pt-BR")}
                      </div>
                    </td>
                    <td className="sticky z-20 border-b border-r border-border bg-white px-3 py-2 align-top" style={{ left: 280 }}>
                      <span className="inline-flex rounded border border-border px-2 py-1 text-xs font-medium">
                        {row.type}
                      </span>
                    </td>
                    {row.buckets.map((bucket) => (
                      <td key={`${row.jobId}-${bucket.start}`} className="border-b border-r border-border px-1 py-1">
                        <div
                          title={bucket.title}
                          className={`h-8 w-full min-w-[54px] rounded ${cellClass(bucket.result, bucket.active)} ${bucket.active ? "cursor-help" : ""}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {timeline?.message && timeline.rows.length > 0 && (
        <p className="mt-4 text-xs text-muted">{timeline.message}</p>
      )}
    </main>
  );
}
