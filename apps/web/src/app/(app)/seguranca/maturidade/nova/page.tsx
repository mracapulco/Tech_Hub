"use client";
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Company = {
  id: string;
  name: string;
};

const STORAGE_KEY = 'cyber:maturity:list';

type Question = { id: string; text: string };
type QuestionGroup = { id: string; name: string; objective: string; questions: Question[] };

const GROUPS: QuestionGroup[] = [
  // Ordem ajustada: Detectar → Responder → Recuperar → Governança → Identificar → Proteger
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
];

export default function NovaMaturidadePage() {
  const router = useRouter();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<number>(1);
  const [activeGroup, setActiveGroup] = useState<string>('detectar');
  const [answers, setAnswers] = useState<Record<string, 0 | 1 | 2>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);

  useEffect(() => {
    computePermissions();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const token = getToken();
        if (!token) {
          setError('Sessão expirada. Faça login novamente.');
          setLoading(false);
          return;
        }
        const res = await apiGet<{ ok: boolean; data?: any[]; error?: string }>(
          '/companies',
          token
        );
        const list: Company[] = Array.isArray(res?.data)
          ? res.data.map((c: any) => ({ id: String(c.id), name: String(c.name ?? c.nome ?? c.companyName ?? c.fantasyName ?? c.razaoSocial ?? 'Empresa') }))
          : [];
        setCompanies(list);
      } catch (e: any) {
        setError('Não foi possível carregar empresas.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  async function computePermissions() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string }[];
      setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
      setIsTech(memberships.some((m) => m.role === 'TECHNICIAN'));
    } catch {
      setIsAdmin(false);
      setIsTech(false);
    }
  }

  const nextStep = () => setStep((s) => Math.min(3, s + 1));
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  // Navegação entre grupos (abas)
  const currentIndex = useMemo(() => GROUPS.findIndex(g => g.id === activeGroup), [activeGroup]);
  const isFirstGroup = currentIndex <= 0;
  const isLastGroup = currentIndex >= GROUPS.length - 1;
  const nextGroup = () => setActiveGroup((gid) => {
    const idx = GROUPS.findIndex(g => g.id === gid);
    const ni = Math.min(GROUPS.length - 1, idx + 1);
    return GROUPS[ni].id;
  });
  const prevGroup = () => setActiveGroup((gid) => {
    const idx = GROUPS.findIndex(g => g.id === gid);
    const pi = Math.max(0, idx - 1);
    return GROUPS[pi].id;
  });

  function key(gid: string, qid: string) { return `${gid}:${qid}`; }
  const currentGroup = useMemo(() => GROUPS.find(g => g.id === activeGroup) || GROUPS[0], [activeGroup]);
  const groupScore = useMemo(() => {
    return currentGroup.questions.reduce((sum, q) => sum + (answers[key(currentGroup.id, q.id)] ?? 0), 0);
  }, [answers, currentGroup]);
  const groupMax = currentGroup.questions.length * 2; // 0/1/2 por pergunta
  const totalScore = useMemo(() => {
    return GROUPS.reduce((acc, g) => acc + g.questions.reduce((sum, q) => sum + (answers[key(g.id, q.id)] ?? 0), 0), 0);
  }, [answers]);
  const totalMax = GROUPS.reduce((acc, g) => acc + g.questions.length * 2, 0);

  function selectAnswer(qid: string, value: 0 | 1 | 2) {
    setAnswers((prev) => ({ ...prev, [key(currentGroup.id, qid)]: value }));
  }

  const onFinish = () => {
    const companyName = companies.find((c) => c.id === companyId)?.name ?? 'Empresa';
    const groupScores: Record<string, number> = GROUPS.reduce((acc, g) => {
      const sum = g.questions.reduce((s, q) => s + (answers[key(g.id, q.id)] ?? 0), 0);
      acc[g.id] = sum;
      return acc;
    }, {} as Record<string, number>);
    const entry = {
      id: crypto.randomUUID(),
      date,
      companyId,
      companyName,
      createdAt: new Date().toISOString(),
      answers,
      groupScores,
      totalScore,
      maxScore: totalMax,
    };
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/maturity`, token, entry);
        if (res?.ok && res.data?.id) {
          router.push(`/seguranca/maturidade/${res.data.id}`);
          return;
        }
      } catch {}
      // Fallback para compatibilidade local
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? [...list, entry] : [entry];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        router.push(`/seguranca/maturidade/${entry.id}`);
      } catch {}
    })();
  };

  if (!(isAdmin || isTech)) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-semibold">Novo teste de maturidade</h1>
        <div className="text-red-700">Acesso negado. Apenas administradores ou técnicos podem criar testes.</div>
        <Link href="/seguranca/maturidade" className="px-3 py-2 rounded border">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-semibold">Novo teste de maturidade</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`px-2 py-1 rounded ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>1. Data</div>
        <div className={`px-2 py-1 rounded ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>2. Empresa</div>
        <div className={`px-2 py-1 rounded ${step === 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>3. Questionários</div>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <div className="flex gap-2">
            <button onClick={nextStep} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Continuar</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium">Empresa</label>
          {loading ? (
            <div className="text-gray-600">Carregando empresas...</div>
          ) : error ? (
            <div className="text-red-700">{error}</div>
          ) : companies.length === 0 ? (
            <div className="text-gray-600">Nenhuma empresa encontrada.</div>
          ) : (
            <select
              className="border rounded px-3 py-2"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Selecione</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button onClick={prevStep} className="px-3 py-2 rounded border">Voltar</button>
            <button
              onClick={nextStep}
              disabled={!companyId}
              className={`px-3 py-2 rounded ${companyId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex gap-2 flex-wrap mb-2">
                {GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGroup(g.id)}
                    className={`px-2 py-1 rounded text-sm ${activeGroup === g.id ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              <h2 className="text-lg font-semibold">{currentGroup.name}</h2>
              <p className="text-sm text-gray-700 mt-1">{currentGroup.objective}</p>
            </div>
            <div className="text-sm text-right">
              <div className="font-medium">Grupo: {groupScore} / {groupMax}</div>
              <div className="text-gray-600">Total: {totalScore} / {totalMax}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border rounded">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Pergunta</th>
                  <th className="px-3 py-2 border-b text-center"><span className="inline-block px-2 py-1 rounded bg-red-600 text-white">Não</span></th>
                  <th className="px-3 py-2 border-b text-center"><span className="inline-block px-2 py-1 rounded bg-yellow-500 text-white">Parcial</span></th>
                  <th className="px-3 py-2 border-b text-center"><span className="inline-block px-2 py-1 rounded bg-green-600 text-white">Sim</span></th>
                </tr>
              </thead>
              <tbody>
                {currentGroup.questions.map((q) => (
                  <tr key={q.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2 border-b text-sm">{q.text}</td>
                    <td className="px-3 py-2 border-b text-center">
                      <input
                        type="radio"
                        name={`q-${currentGroup.id}-${q.id}`}
                        checked={(answers[key(currentGroup.id, q.id)] ?? 0) === 0}
                        onChange={() => selectAnswer(q.id, 0)}
                        aria-label="Não"
                      />
                    </td>
                    <td className="px-3 py-2 border-b text-center">
                      <input
                        type="radio"
                        name={`q-${currentGroup.id}-${q.id}`}
                        checked={(answers[key(currentGroup.id, q.id)] ?? 0) === 1}
                        onChange={() => selectAnswer(q.id, 1)}
                        aria-label="Parcial"
                      />
                    </td>
                    <td className="px-3 py-2 border-b text-center">
                      <input
                        type="radio"
                        name={`q-${currentGroup.id}-${q.id}`}
                        checked={(answers[key(currentGroup.id, q.id)] ?? 0) === 2}
                        onChange={() => selectAnswer(q.id, 2)}
                        aria-label="Sim"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Navegação inferior entre abas (grupos) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                onClick={prevGroup}
                disabled={isFirstGroup}
                className={`px-3 py-2 rounded ${isFirstGroup ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'border hover:bg-gray-100'}`}
              >
                Recuar
              </button>
              <button
                onClick={nextGroup}
                disabled={isLastGroup}
                className={`px-3 py-2 rounded ${isLastGroup ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'border hover:bg-gray-100'}`}
              >
                Avançar
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={prevStep} className="px-3 py-2 rounded border">Voltar</button>
              <button onClick={onFinish} className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700">Concluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}