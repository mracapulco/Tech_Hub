"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiDelete, apiPost } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Assessment = {
  id: string;
  date: string;
  companyId: string;
  companyName: string;
  createdAt: string;
  answers?: Record<string, 0 | 1 | 2>;
  groupScores?: Record<string, number>;
  totalScore?: number;
  maxScore?: number;
};

const STORAGE_KEY = 'cyber:maturity:list';

function imgUrl(u?: string | null) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

function formatDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split('-');
  if (!y || !m || !d) return yyyyMmDd;
  return `${d}/${m}/${y}`;
}

type Question = { id: string; text: string };
type QuestionGroup = { id: string; name: string; objective: string; questions: Question[] };

const GROUPS: QuestionGroup[] = [
  {
    id: 'identificar',
    name: 'IDENTIFICAR',
    objective: 'Avaliar se a organização tem uma visão clara de seus ativos, riscos e dependências.',
    questions: [
      { id: 'q1', text: 'Inventário de Ativos: A organização mantém um inventário atualizado de ativos de TI, incluindo hardware, software e dados críticos para as operações?' },
      { id: 'q2', text: 'Gestão de Riscos: Existe um processo estruturado para identificar, avaliar e priorizar riscos cibernéticos que possam impactar a organização?' },
      { id: 'q3', text: 'Dependências e Cadeia de Suprimentos: A organização identifica e avalia os riscos de segurança cibernética associados a fornecedores, parceiros e prestadores de serviço?' },
      { id: 'q4', text: 'Classificação e Proteção de Dados: A organização classifica os dados com base em sua criticidade e sensibilidade, garantindo a aplicação de controles apropriados?' },
      { id: 'q5', text: 'Governança de Segurança da Informação: A organização tem políticas e diretrizes formais para a gestão da segurança cibernética, alinhadas aos objetivos estratégicos do negócio?' },
    ],
  },
  {
    id: 'proteger',
    name: 'PROTEGER',
    objective: 'Avaliar se a organização implementa medidas eficazes para proteger seus ativos e minimizar vulnerabilidades.',
    questions: [
      { id: 'q1', text: 'Controle de Acessos: A organização implementa e mantém políticas de controle de acesso, garantindo que apenas usuários autorizados possam acessar sistemas e dados críticos?' },
      { id: 'q2', text: 'Gestão de Identidades e Autenticação: A organização utiliza autenticação multifator (MFA) e práticas seguras de gestão de credenciais para proteger contas e acessos privilegiados?' },
      { id: 'q3', text: 'Proteção de Dados: Existem mecanismos adequados para garantir a proteção de dados em repouso e em trânsito, incluindo criptografia e backups regulares?' },
      { id: 'q4', text: 'Segurança na Engenharia de Sistemas: Os princípios de segurança são incorporados ao design, desenvolvimento e manutenção de sistemas, aplicações e infraestrutura da organização?' },
      { id: 'q5', text: 'Conscientização e Treinamento: A organização realiza treinamentos regulares de conscientização em segurança cibernética para funcionários e terceiros, reduzindo riscos relacionados à engenharia social e outras ameaças?' },
    ],
  },
  {
    id: 'detectar',
    name: 'DETECTAR',
    objective: 'Garantir que a organização tenha mecanismos eficazes para identificar ameaças e responder rapidamente a incidentes.',
    questions: [
      { id: 'q1', text: 'Monitoramento Contínuo: A organização possui ferramentas e processos de monitoramento contínuo para identificar atividades suspeitas ou anômalas em redes, sistemas e aplicativos?' },
      { id: 'q2', text: 'Detecção de ameaças: São utilizados sistemas de detecção e prevenção de intrusões (IDS/IPS) para identificar possíveis ataques cibernéticos em tempo real?' },
      { id: 'q3', text: 'Gerenciamento de Logs e Eventos: A organização coleta, armazena e analisa registros de eventos de segurança (logs) para identificar padrões e possíveis incidentes de segurança?' },
      { id: 'q4', text: 'Alertas e Notificações: Existe um processo estruturado para geração de alertas e notificações quando atividades suspeitas ou potenciais incidentes de segurança são detectados?' },
      { id: 'q5', text: 'Testes e Avaliações de Segurança: A organização realiza testes regulares, como varreduras de vulnerabilidades e exercícios de simulação de ataques (red teaming, pentests), para garantir a eficácia das medidas de detecção?' },
    ],
  },
  {
    id: 'responder',
    name: 'RESPONDER',
    objective: 'Avaliar se a organização e os profissionais estão preparados para responder rapidamente a incidentes cibernéticos e minimizar seus impactos.',
    questions: [
      { id: 'q1', text: 'Plano de resposta a Incidentes: A organização possui um plano formal de resposta a incidentes cibernéticos, atualizado e testado regularmente?' },
      { id: 'q2', text: 'Detecção e Análise de Incidentes: Existe um processo definido para identificar, classificar e analisar incidentes de segurança cibernética de forma eficaz e rápida?' },
      { id: 'q3', text: 'Comunicação de Incidentes: A organização tem procedimentos estabelecidos para notificar partes interessadas internas e externas (incluindo reguladores e clientes) sobre incidentes de segurança quando necessário?' },
      { id: 'q4', text: 'Mitigação e Contenção: Há diretrizes claras sobre como conter ameaças e mitigar impactos durante um incidente de segurança cibernética?' },
      { id: 'q5', text: 'Aprendizado e Melhoria Contínua: Após cada incidente, a organização realiza análises pós-incidentes (post-mortem) para documentar lições aprendidas e implementar melhorias nos processos de segurança?' },
    ],
  },
  {
    id: 'recuperar',
    name: 'RECUPERAR',
    objective: 'Avaliar se a organização possui estratégias robustas para retomar suas operações e minimizar impactos após um incidente de segurança cibernética.',
    questions: [
      { id: 'q1', text: 'Plano de Recuperação de Incidentes: A organização possui um plano formal de recuperação cibernética, documentado e testado regularmente, para restaurar sistemas e operações após um incidente?' },
      { id: 'q2', text: 'Comunicação Pós-Incidente: A organização tem um plano de comunicação para informar partes interessadas internas e externas sobre a recuperação de incidentes, incluindo clientes e reguladores, quando necessário?' },
      { id: 'q3', text: 'Lições Aprendidas e Melhoria Contínua: Após a recuperação de um incidente, a organização realiza análises para identificar falhas, melhorar processos e fortalecer a resiliência cibernética?' },
      { id: 'q4', text: 'Testes e Simulações de Recuperação: São realizados testes periódicos dos planos de recuperação para garantir que a organização esteja preparada para restaurar suas operações rapidamente em caso de falhas ou ataques?' },
    ],
  },
  {
    id: 'governanca',
    name: 'GOVERNANÇA',
    objective: 'Estabelecer e monitorar a estratégia, as expectativas e a política de gerenciamento de riscos de segurança cibernética na organização.',
    questions: [
      { id: 'q1', text: 'Políticas e Procedimentos: A organização possui políticas e procedimentos formais de segurança cibernética documentados, atualizados e acessíveis a todas as partes interessadas?' },
      { id: 'q2', text: 'Conformidade e Regulamentação: A empresa monitora e garante conformidade contínua com leis, regulamentações e normas aplicáveis à segurança cibernética e proteção de dados?' },
      { id: 'q3', text: 'Gestão de Riscos: Existe um processo formal para avaliar, documentar e mitigar riscos cibernéticos alinhado aos objetivos estratégicos da organização?' },
      { id: 'q4', text: 'Responsabilidade e Papeis: Os papéis e responsabilidades relacionados à segurança cibernética estão claramente definidos, atribuídos e comunicados dentro da organização?' },
      { id: 'q5', text: 'Monitoramento e Auditoria: A organização realiza auditorias e avaliações regulares para garantir que as práticas de governança de segurança cibernética estejam sendo seguidas e aprimoradas continuamente?' },
    ],
  },
];

function key(gid: string, qid: string) { return `${gid}:${qid}`; }

function tierFromPercent(percent: number) {
  if (percent <= 24) return { label: '1 - Inicial', badge: 'bg-red-600 text-white' };
  if (percent <= 49) return { label: '2 - Gerenciado', badge: 'bg-yellow-500 text-white' };
  if (percent <= 74) return { label: '3 - Definido', badge: 'bg-blue-600 text-white' };
  return { label: '4 - Adaptativo', badge: 'bg-green-600 text-white' };
}

function RadarChart({ labels, values, size = 340 }: { labels: string[]; values: number[]; size?: number }) {
  const count = labels.length;
  const center = size / 2;
  const radius = center - 24; // padding
  const angleStep = (2 * Math.PI) / count;

  const pointFor = (val: number, i: number) => {
    const angle = -Math.PI / 2 + i * angleStep; // começa no topo
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return [x, y] as const;
  };

  const levelValues = [25, 50, 75, 100];
  const polygonPoints = (level: number) => Array.from({ length: count }, (_, i) => pointFor(level, i)).map(([x, y]) => `${x},${y}`).join(' ');
  const dataPoints = values.map((v, i) => pointFor(v, i)).map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Gráfico radar 0–100%">
      {/* níveis */}
      {levelValues.map((lvl) => (
        <polygon key={`lvl-${lvl}`} points={polygonPoints(lvl)} fill="none" stroke="#e5e7eb" strokeWidth={1} />
      ))}
      {/* eixos */}
      {labels.map((_, i) => {
        const [x, y] = pointFor(100, i);
        return <line key={`axis-${i}`} x1={center} y1={center} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={1} />;
      })}
      {/* dados */}
      <polygon points={dataPoints} fill="rgba(37,99,235,0.35)" stroke="#2563eb" strokeWidth={2} />
      {/* rótulos */}
      {labels.map((label, i) => {
        // Posiciona os rótulos mais para dentro (85% do raio) e centraliza
        const [x, y] = pointFor(85, i);
        const dy = y > center ? 12 : -6;
        return (
          <text key={`label-${i}`} x={x} y={y} textAnchor="middle" fontSize={11} fill="#374151" dy={dy} pointerEvents="none">
            {label}
          </text>
        );
      })}
      {/* marcações de porcentagem */}
      {levelValues.map((lvl) => (
        <text key={`lvl-text-${lvl}`} x={center} y={center - (lvl / 100) * radius} textAnchor="middle" fontSize={10} fill="#9ca3af">{lvl}%</text>
      ))}
    </svg>
  );
}

export default function ViewMaturidadePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [item, setItem] = useState<Assessment | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  async function deleteAnalysis() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/maturity/${id}/analysis`, token);
      if (res?.ok) {
        setAiResult(null);
        alert('Análise excluída.');
      } else {
        alert(res?.error || 'Falha ao excluir análise.');
      }
    } catch {
      alert('Falha ao comunicar com a API.');
    }
  }
  const groupSummaries = useMemo(() => {
    const ans = item?.answers || {};
    return GROUPS.map((g) => {
      const score = g.questions.reduce((sum, q) => sum + (ans[key(g.id, q.id)] ?? 0), 0);
      const max = g.questions.length * 2;
      return { id: g.id, name: g.name, score, max };
    });
  }, [item]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Assessment }>(`/maturity/${id}`, token);
        if (res?.ok && res.data) {
          setItem(res.data);
          // Carregar análise salva (visível a clientes também)
          try {
            const ar = await apiGet<{ ok: boolean; data?: any }>(`/maturity/${id}/analysis`, token);
            if (ar?.ok) {
              setAiResult(ar.data?.content || null);
            }
          } catch {}
          return;
        }
      } catch {}
      // Fallback ao localStorage para compatibilidade
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list: Assessment[] = raw ? JSON.parse(raw) : [];
        const found = (Array.isArray(list) ? list : []).find((x) => x.id === id) ?? null;
        setItem(found);
      } catch (e) {
        setItem(null);
      }
    })();
  }, [id]);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
        setIsTech(memberships.some((m) => m.role === 'TECHNICIAN'));
      } catch {
        setIsAdmin(false);
        setIsTech(false);
      }
    })();
  }, []);

  const onDelete = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/maturity/${id}`, token);
      if (res?.ok) {
        // limpeza local para compatibilidade
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const list: Assessment[] = raw ? JSON.parse(raw) : [];
          const next = (Array.isArray(list) ? list : []).filter((x) => x.id !== id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        router.push('/seguranca/maturidade');
      } else {
        alert(res?.error || 'Falha ao excluir.');
      }
    } catch {
      alert('Falha ao comunicar com a API.');
    }
  };

  function answerLabel(v: 0 | 1 | 2 | undefined) {
    if (v === 2) return 'Sim';
    if (v === 1) return 'Parcial';
    return 'Não';
  }

  function csvEscape(s: string) {
    const val = s ?? '';
    const needQuotes = /[",\n]/.test(val);
    const escaped = val.replace(/"/g, '""');
    return needQuotes ? `"${escaped}"` : escaped;
  }

  async function analyzeByAi() {
    const token = getToken();
    if (!token) {
      alert('Sessão expirada. Faça login novamente.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/maturity/analysis`, token, { assessmentId: id });
      if (res?.ok && res.data) {
        setAiResult(res.data);
      } else {
        setAiError(res?.error || 'Falha na análise por IA.');
      }
    } catch (e) {
      setAiError('Falha ao comunicar com a API.');
    } finally {
      setAiLoading(false);
    }
  }

  function formatPriority(p: any) {
    const s = String(p || '').toLowerCase();
    if (!s) return '';
    if (s.includes('high') || s.includes('alta')) return 'Alta';
    if (s.includes('medium') || s.includes('media') || s.includes('média')) return 'Média';
    if (s.includes('low') || s.includes('baixa')) return 'Baixa';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function exportCSV() {
    if (!item) return;
    const lines: string[] = [];
    lines.push(['Empresa', item.companyName].map(csvEscape).join(','));
    lines.push(['Data', formatDate(item.date)].map(csvEscape).join(','));
    lines.push(['Criado em', new Date(item.createdAt).toLocaleString()].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Grupo', 'Pergunta', 'Resposta', 'Valor'].map(csvEscape).join(','));
    GROUPS.forEach((g) => {
      g.questions.forEach((q) => {
        const v = item.answers?.[key(g.id, q.id)] ?? 0;
        const label = answerLabel(v);
        lines.push([g.name, q.text, label, String(v)].map(csvEscape).join(','));
      });
    });
    lines.push('');
    lines.push(['Resumo por grupo', 'Pontuação', 'Máximo', 'Percentual', 'Tier'].map(csvEscape).join(','));
    const summaries = GROUPS.map((g) => {
      const score = g.questions.reduce((sum, q) => sum + (item.answers?.[key(g.id, q.id)] ?? 0), 0);
      const max = g.questions.length * 2;
      return { id: g.id, name: g.name, score, max };
    });
    summaries.forEach((s) => {
      const percent = s.max > 0 ? Math.round((s.score / s.max) * 100) : 0;
      const { label } = tierFromPercent(percent);
      lines.push([s.name, String(s.score), String(s.max), `${percent}%`, label].map(csvEscape).join(','));
    });
    const totalScore = summaries.reduce((acc, s) => acc + s.score, 0);
    const totalMax = summaries.reduce((acc, s) => acc + s.max, 0);
    const totalPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const { label: totalTier } = tierFromPercent(totalPercent);
    lines.push(['GERAL', String(totalScore), String(totalMax), `${totalPercent}%`, totalTier].map(csvEscape).join(','));

    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maturidade_${item.companyName}_${item.date}.csv`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    if (!item) return;
    const token = getToken();
    let logoSrc = '';
    try {
      if (token && item.companyId) {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/companies/${item.companyId}`, token);
        const company = res?.data;
        if (company?.logoUrl) logoSrc = imgUrl(company.logoUrl);
      }
    } catch {}

    const intro = `Este relatório tem como objetivo apresentar uma avaliação estruturada da maturidade em segurança cibernética da organização, com base no Framework de Cibersegurança do NIST (National Institute of Standards and Technology). A proposta é identificar o grau de aderência da empresa às melhores práticas de gestão de riscos cibernéticos, possibilitando o direcionamento de esforços estratégicos para fortalecer a resiliência digital da organização.`;
    const intro2 = `A avaliação foi conduzida por meio de um questionário técnico, baseado nas cinco funções principais do NIST Cybersecurity Framework — Identificar, Proteger, Detectar, Responder e Recuperar — além de elementos de governança, conformidade regulatória e cultura organizacional. As respostas foram classificadas em três níveis: NÃO, PARCIAL e SIM, refletindo o estágio atual de implementação dos controles e processos analisados.`;
    const intro3 = `Ao mapear o nível de maturidade de cada função, é possível gerar indicadores quantitativos e qualitativos que facilitam a priorização de iniciativas, bem como a alocação adequada de recursos. Essa abordagem não só contribui para o aprimoramento contínuo da segurança da informação, mas também fortalece a conformidade com normas internacionais como a ISO/IEC 27001, além de legislações como a LGPD (Lei Geral de Proteção de Dados).`;
    const intro4 = `A proposta deste documento é servir como uma ferramenta prática de diagnóstico e planejamento, promovendo a transparência da postura de segurança atual da organização. Ele também permite a comparação evolutiva ao longo do tempo, bem como o alinhamento com os tiers de maturidade definidos pelo NIST, que vão do nível Inicial (Tier 1) ao Adaptativo (Tier 4). Dessa forma, reforça-se o compromisso com uma cultura de segurança proativa, resiliente e alinhada aos riscos do negócio.`;

    const obs1 = `A avaliação de maturidade apresentada neste relatório oferece uma visão abrangente da postura atual da organização frente aos desafios da segurança cibernética. Ela serve como base concreta para decisões estratégicas e priorização de investimentos em controles, processos e treinamentos.`;
    const obs2 = `Ao adotar o framework do NIST como referência, a organização se alinha com padrões internacionais reconhecidos, promovendo uma abordagem estruturada, mensurável e em constante evolução. A maturidade em segurança deve ser encarada como um processo contínuo, e não como um estado final.`;
    const obs3 = `Recomenda-se que este diagnóstico seja revisitado periodicamente, permitindo a comparação entre ciclos e a evolução contínua do programa de segurança. O compromisso com a melhoria constante fortalece a resiliência organizacional e protege os ativos mais valiosos da empresa: seus dados, sua reputação e sua continuidade de negócios.`;

    const summaries = GROUPS.map((g) => {
      const score = g.questions.reduce((sum, q) => sum + (item.answers?.[key(g.id, q.id)] ?? 0), 0);
      const max = g.questions.length * 2;
      const percent = max > 0 ? Math.round((score / max) * 100) : 0;
      const { label } = tierFromPercent(percent);
      return { name: g.name, score, max, percent, tier: label };
    });
    const totalScore = summaries.reduce((acc, s) => acc + s.score, 0);
    const totalMax = summaries.reduce((acc, s) => acc + s.max, 0);
    const totalPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const { label: totalTier } = tierFromPercent(totalPercent);

    const styles = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
        .container { max-width: 900px; margin: 0 auto; padding: 24px; }
        .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
        .logo { height: 64px; object-fit: contain; }
        h1 { font-size: 22px; margin: 0; }
        h2 { font-size: 18px; margin: 24px 0 8px; }
        p { font-size: 14px; line-height: 1.6; margin: 8px 0; }
        .meta { margin-top: 8px; font-size: 12px; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
        th { background: #f9fafb; text-align: left; }
        .summary { margin-top: 16px; }
        .footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 12px; color: #6b7280; }
        @page { margin: 16mm; }
      </style>
    `;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Relatório de Maturidade - ${item.companyName}</title>
          ${styles}
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Logo da empresa" />` : ''}
              <div>
                <h1>Relatório de Maturidade de Segurança – NIST</h1>
                <div class="meta">Empresa: <strong>${item.companyName}</strong></div>
                <div class="meta">Data: ${formatDate(item.date)} | Criado em: ${new Date(item.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <h2>Introdução</h2>
            <p>${intro}</p>
            <p>${intro2}</p>
            <p>${intro3}</p>
            <p>${intro4}</p>

            <h2>Resumo por Grupo</h2>
            <table class="summary">
              <thead>
                <tr><th>Categoria</th><th>Pontuação</th><th>Máximo</th><th>Percentual</th><th>Tier</th></tr>
              </thead>
              <tbody>
                ${summaries.map(s => `<tr><td>${s.name}</td><td>${s.score}</td><td>${s.max}</td><td>${s.percent}%</td><td>${s.tier}</td></tr>`).join('')}
                <tr><td><strong>GERAL</strong></td><td>${totalScore}</td><td>${totalMax}</td><td>${totalPercent}%</td><td>${totalTier}</td></tr>
              </tbody>
            </table>

            <h2>Detalhamento por Pergunta</h2>
            ${GROUPS.map(g => `
              <h3 style="font-size:16px;margin:16px 0 4px;">${g.name}</h3>
              <p style="font-size:13px;color:#374151;margin:0 0 8px;">${g.objective}</p>
              <table>
                <thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead>
                <tbody>
                  ${g.questions.map(q => {
                    const v = item.answers?.[key(g.id, q.id)] ?? 0;
                    const label = answerLabel(v);
                    return `<tr><td>${q.text}</td><td>${label}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            `).join('')}

            <h2>Observação final</h2>
            <p>${obs1}</p>
            <p>${obs2}</p>
            <p>${obs3}</p>

            <div class="footer">Relatório gerado por Tech Hub</div>
          </div>
          <script>
            window.onload = function() { window.focus(); setTimeout(function(){ window.print(); }, 300); };
          </script>
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

  if (!item) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-red-700">Registro não encontrado.</div>
        <Link href="/seguranca/maturidade" className="px-3 py-2 rounded border">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Visualizar teste de maturidade</h1>
        <div className="flex gap-2 items-center">
          <Link href="/seguranca/maturidade" className="px-3 py-2 rounded border">Voltar</Link>
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
            <button onClick={analyzeByAi} disabled={aiLoading} className={`px-3 py-2 rounded ${aiLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
              {aiLoading ? 'Analisando…' : 'Analisar por IA'}
            </button>
          )}
          {(isAdmin || isTech) && (
            <button onClick={onDelete} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">Excluir</button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div><span className="font-medium">Data:</span> {formatDate(item.date)}</div>
        <div><span className="font-medium">Empresa:</span> {item.companyName}</div>
        <div className="text-sm text-gray-600">Criado em {new Date(item.createdAt).toLocaleString()}</div>
        {/* Linha de resumo por grupo removida conforme solicitado */}
        {item.totalScore != null && item.maxScore != null && (
          <div className="text-sm"><span className="font-medium">Total:</span> {item.totalScore} / {item.maxScore}</div>
        )}
      </div>

      {/* Tabela resumo e gráfico radar 0–100% */}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 border-b">Categoria</th>
                <th className="px-3 py-2 border-b text-center">Pontuação</th>
                <th className="px-3 py-2 border-b text-center">Graduação</th>
                <th className="px-3 py-2 border-b text-center">Tier</th>
              </tr>
            </thead>
            <tbody>
              {groupSummaries.map((g) => {
                const percent = g.max > 0 ? Math.round((g.score / g.max) * 100) : 0;
                const { label, badge } = tierFromPercent(percent);
                return (
                  <tr key={`row-${g.id}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{g.name[0].toUpperCase() + g.name.slice(1).toLowerCase()}</td>
                    <td className="px-3 py-2 border-b text-center">{g.score}</td>
                    <td className="px-3 py-2 border-b text-center">
                      <span className={`inline-block px-2 py-1 rounded ${badge}`}>{percent}%</span>
                    </td>
                    <td className="px-3 py-2 border-b text-center">{label}</td>
                  </tr>
                );
              })}
              {(() => {
                const totalScore = groupSummaries.reduce((s, g) => s + g.score, 0);
                const totalMax = groupSummaries.reduce((s, g) => s + g.max, 0);
                const percent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
                const { label, badge } = tierFromPercent(percent);
                return (
                  <tr className="bg-blue-50 font-medium">
                    <td className="px-3 py-2 border-b">GERAL</td>
                    <td className="px-3 py-2 border-b text-center">{totalScore}</td>
                    <td className="px-3 py-2 border-b text-center"><span className={`inline-block px-2 py-1 rounded ${badge}`}>{percent}%</span></td>
                    <td className="px-3 py-2 border-b text-center">{label}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        <div className="flex justify-center">
          {(() => {
            const percents = groupSummaries.map((g) => g.max > 0 ? Math.round((g.score / g.max) * 100) : 0);
            const labels = groupSummaries.map((g) => g.name);
            return <RadarChart labels={labels} values={percents} size={360} />;
          })()}
        </div>
      </div>

      {/* Análise por IA agora é exibida em página dedicada */}
      <div className="space-y-3 border rounded p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Análise por IA</h2>
        </div>
        <div className="text-sm text-gray-700">
          A análise detalhada por domínio (Identificar, Proteger, Detectar, Responder, Recuperar e Governança) foi movida para uma página dedicada.
        </div>
        <div>
          <Link href={`/seguranca/maturidade/${id}/analise`} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 inline-block">Abrir análise em página separada</Link>
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.id} className="overflow-x-auto">
          <h2 className="text-lg font-semibold mt-4">{g.name}</h2>
          <p className="text-sm text-gray-700 mb-2">{g.objective}</p>
          <table className="min-w-full border rounded">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 border-b">Pergunta</th>
                <th className="px-3 py-2 border-b text-center">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {g.questions.map((q) => {
                const v = item.answers?.[key(g.id, q.id)] ?? 0;
                const label = v === 2 ? 'Sim' : v === 1 ? 'Parcial' : 'Não';
                const badgeClass = v === 2 ? 'bg-green-600 text-white' : v === 1 ? 'bg-yellow-500 text-white' : 'bg-red-600 text-white';
                return (
                  <tr key={q.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2 border-b text-sm">{q.text}</td>
                    <td className="px-3 py-2 border-b text-center">
                      <span className={`inline-block px-2 py-1 rounded ${badgeClass}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}