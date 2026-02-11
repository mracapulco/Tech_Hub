import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';

type Framework = 'ISO27001' | 'NISTCSF';

type AnalysisInput = {
  report?: any; // respostas ou relatório já consolidado
  answers?: any; // respostas brutas do questionário
  companyContext?: {
    sector?: string;
    size?: string; // pequeno/médio/grande
    region?: string; // BR
    regulations?: string[]; // LGPD etc.
  };
  targetFrameworks?: Framework[];
  language?: 'pt-BR' | 'en';
  depth?: 'basic' | 'standard' | 'deep';
};

@Injectable()
export class MaturityAiService {
  // Não manter cliente em cache: recriar por chamada para refletir configs atuais
  private client?: OpenAI;

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private async resolveApiKey(): Promise<string> {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    const raw = await this.settings.getOpenAiKeyRaw();
    if (!raw) throw new Error('OPENAI_API_KEY não configurada.');
    return raw;
  }

  private corpusPtBr(): string {
    // Contexto resumido para orientar a análise. Manter leve para não encarecer tokens.
    return [
      'Contexto de referência (resumo):',
      '- ISO/IEC 27001: Anexos e domínios (A.5 a A.8, etc.), políticas, gestão de riscos, controles organizacionais, físicos e tecnológicos.',
      '- NIST CSF: Funções (Identify, Protect, Detect, Respond, Recover), categorias e subcategorias.',
      '- LGPD Brasil: princípios de tratamento, segurança, governança, base legal e direitos do titular.',
      'Objetivo: identificar lacunas e sugerir ações práticas, priorizadas por risco e esforço, com referências a ISO 27001 e NIST CSF, em português do Brasil.',
    ].join('\n');
  }

  async analyze(input: AnalysisInput) {
    const cfg = await this.settings.getAiConfig();
    const provider = (cfg.provider || 'openai').toLowerCase();
    const baseURL = cfg.baseURL || undefined;
    const model = cfg.model || 'gpt-4o-mini';

    let apiKey: string;
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || (await this.resolveApiKey());
    } else {
      // Para provedores locais compatíveis (LM Studio, Ollama), a SDK do OpenAI exige uma apiKey.
      // Usamos um placeholder seguro.
      apiKey = process.env.OPENAI_API_KEY || (await this.settings.getOpenAiKeyRaw()) || 'sk-local';
    }
    // Recriar cliente a cada chamada para garantir que baseURL/apiKey atualizados sejam aplicados
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 300000); // 5 min
    const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs });
    const language = input.language || 'pt-BR';
    const frameworks = input.targetFrameworks?.length ? input.targetFrameworks : ['ISO27001', 'NISTCSF'];
    const depth = input.depth || 'deep';
    const req = depth === 'basic'
      ? { actionsMin: 2, actionsMax: 4, wordsMin: 40, metricsMin: 2, toolsMin: 2 }
      : depth === 'standard'
      ? { actionsMin: 3, actionsMax: 6, wordsMin: 60, metricsMin: 3, toolsMin: 2 }
      : { actionsMin: 5, actionsMax: 8, wordsMin: 90, metricsMin: 4, toolsMin: 3 };

    const companyCtx = input.companyContext || {};
    const answers = input.report || input.answers || {};
    // Enriquecer contexto com Padrões (Tech Master) e Perfil do Cliente, quando houver companyId
    let techMaster: any = null;
    let clientProfile: any = null;
    try {
      techMaster = await this.settings.getCompanyStandards();
    } catch {}
    if ((companyCtx as any)?.companyId) {
      try {
        clientProfile = await this.settings.getClientProfile(String((companyCtx as any).companyId));
      } catch {}
    }

    const system = `${this.corpusPtBr()}\n` +
      `Padronize prioridades para 'Alta','Média','Baixa' e escreva sempre em PT-BR. ` +
      `Estruture a análise por domínio (Identify, Protect, Detect, Respond, Recover, Governance). ` +
      `Inclua sugestões práticas com aplicações/softwares quando apropriado (campo 'recommended_tools'). ` +
      `Para cada domínio produza entre ${req.actionsMin} e ${req.actionsMax} ações detalhadas; cada ação deve ter no mínimo ${req.wordsMin} palavras em 'description', conter 'framework_refs' (NIST/ISO), 'effort_hours', 'owner_role', 'timeline_days', 'dependencies', 'risks', 'metrics' (mínimo ${req.metricsMin}), 'recommended_tools' (mínimo ${req.toolsMin}) e 'rollout_plan' com fases d30/d60/d90. ` +
      `Não inclua pontuação geral. Responda como JSON válido, sem comentários.`;
    const promptText = [
      'Analise o seguinte questionário/relatório de maturidade em segurança cibernética.',
      'Produza um diagnóstico e um backlog de ações priorizado com referências por domínio (Identify, Protect, Detect, Respond, Recover, Governance).',
      `Frameworks alvo: ${frameworks.join(', ')}.`,
      `Contexto da empresa: ${JSON.stringify(companyCtx)}.`,
      `Catálogo Tech Master (padrões e preferências): ${JSON.stringify(techMaster || {})}.`,
      `Perfil do Cliente: ${JSON.stringify(clientProfile || {})}.`,
      'Respostas/relatório:',
      JSON.stringify(answers),
      `Requisitos de profundidade: domínio com entre ${req.actionsMin}-${req.actionsMax} ações detalhadas; descrição mínima ${req.wordsMin} palavras por ação; ${req.metricsMin}+ métricas mensuráveis por ação; ${req.toolsMin}+ ferramentas específicas por ação; plano de rollout d30/d60/d90 por ação.`,
      'Formato esperado (exemplo):',
      JSON.stringify({
        identify: {
          summary: { current_state: 'texto curto', key_gaps: ['gap1', 'gap2'] },
          actions: [
            {
              title: 'Inventariar ativos críticos',
              description: 'Estabelecer inventário contínuo de hardware, software e dados críticos.',
              framework_refs: [{ framework: 'NISTCSF', category: 'ID.AM' }],
              priority: 'Alta', effort_hours: 24, owner_role: 'Gestor de TI', timeline_days: 30,
              dependencies: ['ferramenta de descoberta de ativos'], risks: ['ativos não gerenciados'],
              metrics: ['% ativos descobertos vs. estimados'],
              recommended_tools: [{ name: 'GLPI', type: 'Inventário', purpose: 'Catálogo e CMDB' }],
              rollout_plan: { d30: ['passos'], d60: ['passos'], d90: ['passos'] },
            },
          ],
        },
        protect: {
          summary: { current_state: 'texto curto', key_gaps: [] },
          actions: [
            {
              title: 'Implementar MFA', description: 'Habilitar MFA para contas privilegiadas e críticas.',
              framework_refs: [{ framework: 'NISTCSF', category: 'PR.AC' }, { framework: 'ISO27001', control: 'A.9' }],
              priority: 'Alta', effort_hours: 16, owner_role: 'SecOps', timeline_days: 15,
              dependencies: ['diretório de identidades'], risks: ['comprometimento de credenciais'],
              metrics: ['% contas com MFA'],
              recommended_tools: [{ name: 'Azure AD', type: 'IAM', purpose: 'MFA e políticas de acesso' }],
              rollout_plan: { d30: [], d60: [], d90: [] },
            },
          ],
        },
        detect: { summary: { current_state: '', key_gaps: [] }, actions: [] },
        respond: { summary: { current_state: '', key_gaps: [] }, actions: [] },
        recover: { summary: { current_state: '', key_gaps: [] }, actions: [] },
        governance: { summary: { current_state: '', key_gaps: [] }, actions: [] },
        notes: 'observações específicas do contexto brasileiro/LGPD',
      }),
    ].join('\n');

    const maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 4096);
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: promptText },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
      },
      { timeout: timeoutMs },
    );

    const content = completion.choices?.[0]?.message?.content || '{}';
    const repair = (s: string) => {
      let t = String(s || '').trim();
      const fence = t.match(/```json([\s\S]*?)```/i);
      if (fence) t = fence[1].trim();
      // remover comentários e vírgulas finais
      t = t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      t = t.replace(/,\s*([}\]])/g, '$1');
      t = t.replace(/\u00A0/g, ' ');
      return t;
    };
    let parsed: any;
    const repaired = repair(content);
    try {
      parsed = JSON.parse(repaired);
    } catch {
      const m = repaired.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(repair(m[0]));
        } catch {
          parsed = { status: 'error', message: 'Conteúdo inválido da IA', rawText: content };
        }
      } else {
        parsed = { status: 'error', message: 'Conteúdo inválido da IA', rawText: content };
      }
    }
    return parsed;
  }
}
