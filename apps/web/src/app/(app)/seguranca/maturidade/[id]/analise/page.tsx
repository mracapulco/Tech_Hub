"use client";
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type DomainBlock = {
  summary?: { current_state?: string; key_gaps?: string[] };
  actions?: Array<{
    title?: string;
    description?: string;
    framework_refs?: Array<{ framework?: string; control?: string; category?: string }>;
    priority?: string;
    effort_hours?: number;
    owner_role?: string;
    timeline_days?: number;
    dependencies?: string[];
    risks?: string[];
    metrics?: string[];
    recommended_tools?: Array<{ name?: string; type?: string; purpose?: string }>;
  }>;
};

export default function AnaliseMaturidadePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [content, setContent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [assessment, setAssessment] = useState<{ companyId?: string; companyName?: string; date?: string; createdAt?: string } | null>(null);

  function imgUrl(u?: string | null) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
    return u;
  }

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      // ainda tentar carregar análise mesmo sem papéis (pode falhar por auth)
      (async () => {
        setLoading(true);
        setError(null);
      try {
        const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/maturity/${id}/analysis`, token || '');
        if (res?.ok) {
          setContent(res.data?.content || null);
        } else {
          setError(res?.error || 'Falha ao obter análise.');
        }
      } catch {
        setError('Falha ao comunicar com a API.');
      } finally {
        setLoading(false);
      }
    })();
    return;
    }
    (async () => {
      try {
        const userRes = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (userRes?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
        setIsTech(memberships.some((m) => m.role === 'TECHNICIAN'));
      } catch {
        setIsAdmin(false);
        setIsTech(false);
      }
      // Obter dados da avaliação para cabeçalho e export (empresa, datas)
      try {
        const det = await apiGet<{ ok: boolean; data?: any }>(`/maturity/${id}`, token);
        if (det?.ok && det.data) {
          setAssessment({
            companyId: det.data.companyId,
            companyName: det.data.companyName,
            date: det.data.date,
            createdAt: det.data.createdAt,
          });
        }
      } catch {}
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/maturity/${id}/analysis`, token);
        if (res?.ok) {
          setContent(res.data?.content || null);
        } else {
          setError(res?.error || 'Falha ao obter análise.');
        }
      } catch {
        setError('Falha ao comunicar com a API.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function reanalyze() {
    const token = getToken();
    if (!token) {
      alert('Sessão expirada. Faça login novamente.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/maturity/analysis`, token, { assessmentId: id });
      if (res?.ok) {
        setContent(res.data || null);
      } else {
        setError(res?.error || 'Falha na análise por IA.');
      }
    } catch {
      setError('Falha ao comunicar com a API.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteAnalysis() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/maturity/${id}/analysis`, token);
      if (res?.ok) {
        setContent(null);
        alert('Análise excluída.');
      } else {
        alert(res?.error || 'Falha ao excluir análise.');
      }
    } catch {
      alert('Falha ao comunicar com a API.');
    }
  }

  function formatPriority(p?: string) {
    const v = String(p || '').toLowerCase();
    if (v.includes('alta')) return 'Alta';
    if (v.includes('méd') || v.includes('med')) return 'Média';
    if (v.includes('baixa')) return 'Baixa';
    return p || '';
  }

  // Resumo do roadmap (somatórios)
  const roadmapSummary = useMemo(() => {
    const domains = ['identify', 'protect', 'detect', 'respond', 'recover', 'governance'] as const;
    let totalEffort = 0;
    let totalDays = 0;
    let totalActions = 0;
    domains.forEach((d) => {
      const acts = (content?.[d]?.actions || []) as Array<any>;
      acts.forEach((a) => {
        if (typeof a.effort_hours === 'number') totalEffort += a.effort_hours;
        if (typeof a.timeline_days === 'number') totalDays += a.timeline_days;
        totalActions += 1;
      });
    });
    return { totalEffort, totalDays, totalActions };
  }, [content]);

  function csvEscape(v: any) {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCSV() {
    if (!content) return;
    const lines: string[] = [];
    lines.push(['Empresa', assessment?.companyName || 'Empresa'].map(csvEscape).join(','));
    if (assessment?.date) lines.push(['Data', assessment.date].map(csvEscape).join(','));
    if (assessment?.createdAt) lines.push(['Criado em', new Date(assessment.createdAt).toLocaleString()].map(csvEscape).join(','));
    lines.push(['Total de ações', roadmapSummary.totalActions].map(csvEscape).join(','));
    lines.push(['Esforço total (h)', roadmapSummary.totalEffort].map(csvEscape).join(','));
    lines.push(['Prazo total (dias)', roadmapSummary.totalDays].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Domínio', 'Ação', 'Descrição', 'Prioridade', 'Esforço (h)', 'Prazo (dias)', 'Responsável', 'Ferramentas', 'Referências'].map(csvEscape).join(','));
    const domains = [
      { key: 'identify', name: 'IDENTIFICAR' },
      { key: 'protect', name: 'PROTEGER' },
      { key: 'detect', name: 'DETECTAR' },
      { key: 'respond', name: 'RESPONDER' },
      { key: 'recover', name: 'RECUPERAR' },
      { key: 'governance', name: 'GOVERNANÇA' },
    ] as const;
    domains.forEach((d) => {
      const acts = (content?.[d.key]?.actions || []) as Array<any>;
      acts.forEach((a) => {
        const tools = Array.isArray(a.recommended_tools) ? a.recommended_tools.map((t: any) => [t.name, t.type, t.purpose].filter(Boolean).join(' – ')).join(' | ') : '';
        const refs = Array.isArray(a.framework_refs) ? a.framework_refs.map((r: any) => `${r.framework || ''} ${r.control || r.category || ''}`).join(' | ') : '';
        lines.push([
          d.name,
          a.title || '',
          a.description || '',
          formatPriority(a.priority),
          typeof a.effort_hours === 'number' ? a.effort_hours : '',
          typeof a.timeline_days === 'number' ? a.timeline_days : '',
          a.owner_role || '',
          tools,
          refs,
        ].map(csvEscape).join(','));
      });
    });
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analise_ia_${(assessment?.companyName || 'empresa').replace(/\s+/g, '_')}_${id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    if (!content) return;
    const token = getToken();
    let companyLogo = '';
    let companyName = assessment?.companyName || 'Empresa';
    try {
      if (token && assessment?.companyId) {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/companies/${assessment.companyId}`, token);
        const company = res?.data;
        if (company?.logoUrl) companyLogo = imgUrl(company.logoUrl);
        companyName = company?.fantasyName || company?.name || companyName;
      }
    } catch {}

    const styles = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
        .container { max-width: 900px; margin: 0 auto; padding: 24px; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
        .logo { height: 52px; object-fit: contain; }
        .powered { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
        h1 { font-size: 20px; margin: 0; }
        h2 { font-size: 18px; margin: 20px 0 8px; }
        p { font-size: 14px; line-height: 1.6; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
        th { background: #f9fafb; text-align: left; }
        .summary { margin-top: 8px; font-size: 14px; }
        @page { margin: 16mm; }
      </style>
    `;

    const intro = `Esta análise foi gerada por uma ferramenta de IA para apoiar decisões, devendo ser validada e acompanhada pelo time de segurança, alinhada aos objetivos estratégicos da empresa. Os dados usados não são enviados para nuvem pública: o processamento ocorre internamente na estrutura do Tech Hub, com foco em segurança e confidencialidade.`;

    const domains = [
      { key: 'identify', name: 'IDENTIFICAR' },
      { key: 'protect', name: 'PROTEGER' },
      { key: 'detect', name: 'DETECTAR' },
      { key: 'respond', name: 'RESPONDER' },
      { key: 'recover', name: 'RECUPERAR' },
      { key: 'governance', name: 'GOVERNANÇA' },
    ] as const;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Análise por IA - ${companyName}</title>
          ${styles}
        </head>
        <body>
          <div class=\"container\">
            <div class=\"header\">
              <div style=\"display:flex;align-items:center;gap:12px;\">
                ${companyLogo ? `<img src=\"${companyLogo}\" class=\"logo\" alt=\"Logo da empresa\" />` : ''}
                <div>
                  <h1>Relatório de Análise de Segurança – IA</h1>
                  <div style=\"font-size:12px;color:#374151\">Empresa: <strong>${companyName}</strong></div>
                </div>
              </div>
              <div class=\"powered\">
                <span>Powered by</span>
                <img src=\"/logo.svg\" class=\"logo\" alt=\"Tech Hub\" />
              </div>
            </div>

            <h2>Introdução</h2>
            <p>${intro}</p>
            <p><strong>Resumo do roadmap:</strong> ${roadmapSummary.totalActions} ações, esforço total de ${roadmapSummary.totalEffort} horas e prazo total de ${roadmapSummary.totalDays} dias.</p>

            ${domains.map(d => {
              const block = (content?.[d.key] || {});
              const summary = block.summary || {};
              const actions = Array.isArray(block.actions) ? block.actions : [];
              return `
                <h2>${d.name}</h2>
                ${summary.current_state ? `<p><strong>Estado atual:</strong> ${summary.current_state}</p>` : ''}
                ${Array.isArray(summary.key_gaps) && summary.key_gaps.length ? `<p><strong>Principais lacunas:</strong> ${summary.key_gaps.map((g:any)=>String(g)).join('; ')}</p>` : ''}
                ${actions.length ? `
                  <table>
                    <thead>
                      <tr><th>Ação</th><th>Prioridade</th><th>Esforço (h)</th><th>Prazo (dias)</th><th>Ferramentas</th></tr>
                    </thead>
                    <tbody>
                      ${actions.map((a:any) => {
                        const tools = Array.isArray(a.recommended_tools) ? a.recommended_tools.map((t:any) => [t.name, t.type, t.purpose].filter(Boolean).join(' – ')).join(', ') : '';
                        return `<tr>
                          <td><div style=\"font-weight:600\">${a.title || 'Ação'}</div>${a.description ? `<div style=\"font-size:12px;color:#374151\">${a.description}</div>` : ''}</td>
                          <td>${a.priority ? `${formatPriority(a.priority)}` : ''}</td>
                          <td>${typeof a.effort_hours === 'number' ? a.effort_hours : ''}</td>
                          <td>${typeof a.timeline_days === 'number' ? a.timeline_days : ''}</td>
                          <td>${tools || '—'}</td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                ` : `<p style=\"color:#6b7280\">Sem ações recomendadas.</p>`}
              `;
            }).join('')}

            <script>
              window.onload = function() { window.focus(); setTimeout(function(){ window.print(); }, 300); };
            </script>
          </div>
        </body>
      </html>
    `;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Não foi possível abrir a janela de impressão. Verifique o bloqueio de pop-ups.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function Domain({ keyName, title }: { keyName: keyof any; title: string }) {
    const block: DomainBlock | null = content?.[keyName] || null;
    if (!block) return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="text-sm text-gray-600">Sem conteúdo disponível para este domínio.</div>
      </div>
    );
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {block.summary && (
          <div className="space-y-1 text-sm">
            {block.summary.current_state && (
              <div><span className="font-medium">Estado atual:</span> {String(block.summary.current_state)}</div>
            )}
            {Array.isArray(block.summary.key_gaps) && block.summary.key_gaps.length > 0 && (
              <div>
                <span className="font-medium">Principais lacunas:</span>
                <ul className="list-disc ml-5">
                  {block.summary.key_gaps.map((g, i) => (<li key={`gap-${title}-${i}`}>{String(g)}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}
        {Array.isArray(block.actions) && block.actions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border rounded">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Ação</th>
                  <th className="px-3 py-2 border-b">Prioridade</th>
                  <th className="px-3 py-2 border-b">Esforço (h)</th>
                  <th className="px-3 py-2 border-b">Prazo (dias)</th>
                  <th className="px-3 py-2 border-b">Ferramentas</th>
                </tr>
              </thead>
              <tbody>
                {block.actions.map((a, i) => (
                  <tr key={`act-${title}-${i}`} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">
                      <div className="font-medium">{String(a.title || 'Ação')}</div>
                      {a.description && (<div className="text-sm text-gray-700">{String(a.description)}</div>)}
                      {Array.isArray(a.framework_refs) && a.framework_refs.length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">Referências: {a.framework_refs.map((r) => `${r.framework || ''} ${r.control || r.category || ''}`).join(', ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b">{formatPriority(a.priority)}</td>
                    <td className="px-3 py-2 border-b">{typeof a.effort_hours === 'number' ? a.effort_hours : ''}</td>
                    <td className="px-3 py-2 border-b">{typeof a.timeline_days === 'number' ? a.timeline_days : ''}</td>
                    <td className="px-3 py-2 border-b text-sm">
                      {Array.isArray(a.recommended_tools) && a.recommended_tools.length > 0 ? (
                        <ul className="list-disc ml-5">
                          {a.recommended_tools.map((t, j) => (
                            <li key={`tool-${title}-${i}-${j}`}>{[t.name, t.type, t.purpose].filter(Boolean).join(' – ')}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Análise por IA</h1>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="px-3 py-2 rounded bg-gray-800 text-white hover:bg-black">Voltar</button>
          <div className="relative">
            <button onClick={() => setExportOpen((v) => !v)} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">Exportar</button>
            {exportOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-border bg-white shadow">
                <button onClick={() => { setExportOpen(false); exportPDF(); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50">PDF</button>
                <button onClick={() => { setExportOpen(false); exportCSV(); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50">CSV</button>
              </div>
            )}
          </div>
          {(isAdmin || isTech) && (
            <>
              <button onClick={reanalyze} disabled={loading} className={`px-3 py-2 rounded ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                {loading ? 'Analisando…' : 'Reexecutar análise'}
              </button>
              {content && (
                <button onClick={deleteAnalysis} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">Excluir</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Introdução e resumo do roadmap */}
      <div className="space-y-2 text-sm bg-gray-50 border rounded p-3">
        <p>
          Esta análise foi gerada por uma ferramenta de IA para apoiar decisões e deve ser validada e acompanhada pelo time de segurança, alinhada aos objetivos da empresa.
        </p>
        <p>
          Os dados utilizados não são enviados para a nuvem pública: todo o processamento ocorre internamente na estrutura do Tech Hub, que preza pela segurança e confidencialidade.
        </p>
        <p>
          <span className="font-medium">Resumo do roadmap:</span> {roadmapSummary.totalActions} ações, esforço total de {roadmapSummary.totalEffort} horas e prazo total de {roadmapSummary.totalDays} dias.
        </p>
      </div>

      {error && (<div className="text-red-700 text-sm">{error}</div>)}
      {!content && !loading && !error && (
        <div className="text-sm text-gray-700">{(isAdmin || isTech) ? 'Nenhuma análise encontrada. Clique em “Reexecutar análise” para gerar.' : 'Nenhuma análise disponível ainda.'}</div>
      )}

      {content && (
        <div className="space-y-6">
          <Domain keyName={'identify' as any} title="IDENTIFICAR" />
          <Domain keyName={'protect' as any} title="PROTEGER" />
          <Domain keyName={'detect' as any} title="DETECTAR" />
          <Domain keyName={'respond' as any} title="RESPONDER" />
          <Domain keyName={'recover' as any} title="RECUPERAR" />
          <Domain keyName={'governance' as any} title="GOVERNANÇA" />
          {content?.notes && (
            <div className="text-sm text-gray-700"><span className="font-medium">Observações:</span> {String(content.notes)}</div>
          )}
        </div>
      )}
      </div>
    );
  }