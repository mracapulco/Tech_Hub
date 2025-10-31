"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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
  const groupSummaries = useMemo(() => {
    const ans = item?.answers || {};
    return GROUPS.map((g) => {
      const score = g.questions.reduce((sum, q) => sum + (ans[key(g.id, q.id)] ?? 0), 0);
      const max = g.questions.length * 2;
      return { id: g.id, name: g.name, score, max };
    });
  }, [item]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: Assessment[] = raw ? JSON.parse(raw) : [];
      const found = (Array.isArray(list) ? list : []).find((x) => x.id === id) ?? null;
      setItem(found);
    } catch (e) {
      setItem(null);
    }
  }, [id]);

  const onDelete = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: Assessment[] = raw ? JSON.parse(raw) : [];
      const next = (Array.isArray(list) ? list : []).filter((x) => x.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      router.push('/seguranca/maturidade');
    } catch (e) {}
  };

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
        <div className="flex gap-2">
          <Link href="/seguranca/maturidade" className="px-3 py-2 rounded border">Voltar</Link>
          <button onClick={onDelete} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">Excluir</button>
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