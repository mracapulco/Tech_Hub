import { Body, Controller, Get, Headers, Param, Post, Delete, Put } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MaturityAiService } from './maturity.ai.service';

type CreateAssessmentDto = {
  id?: string;
  date: string; // YYYY-MM-DD
  companyId: string;
  answers?: any;
  groupScores?: any;
  totalScore?: number;
  maxScore?: number;
};

@Controller('maturity')
export class MaturityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly ai: MaturityAiService,
  ) {}

  private getUserIdFromAuthHeader(authorization?: string): string | null {
    if (!authorization) return null;
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    const token = parts[1];
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }

  private async getMemberships(userId: string) {
    return this.prisma.userCompanyMembership.findMany({ where: { userId } });
  }

  private async getRoles(userId: string) {
    const memberships = await this.getMemberships(userId);
    const roles = (memberships || []).map((m: any) => String(m.role));
    const isAdmin = roles.includes('ADMIN');
    const isTech = roles.includes('TECHNICIAN');
    return { isAdmin, isTech, memberships };
  }

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech, memberships } = await this.getRoles(userId);

    let records: any[] = [];
    if (isAdmin || isTech) {
      records = await this.prisma.maturityAssessment.findMany({ include: { company: true, analysis: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    } else {
      const companyIds = (memberships || []).map((m: any) => m.companyId);
      if (companyIds.length === 0) return { ok: true, data: [] };
      records = await this.prisma.maturityAssessment.findMany({ where: { companyId: { in: companyIds } }, include: { company: true, analysis: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    }

    const data = records.map((r: any) => ({
      id: r.id,
      date: r.date,
      companyId: r.companyId,
      companyName: r.company?.name ?? 'Empresa',
      createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
      answers: r.answers ?? undefined,
      groupScores: r.groupScores ?? undefined,
      totalScore: r.totalScore ?? undefined,
      maxScore: r.maxScore ?? undefined,
      hasAnalysis: !!(r as any).analysis,
    }));
    return { ok: true, data };
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech, memberships } = await this.getRoles(userId);

    const record = await this.prisma.maturityAssessment.findUnique({ where: { id }, include: { company: true, analysis: true } });
    if (!record) return { ok: false, error: 'Registro não encontrado.' };
    if (!(isAdmin || isTech)) {
      const hasCompany = (memberships || []).some((m: any) => m.companyId === record.companyId);
      if (!hasCompany) return { ok: false, error: 'Forbidden' };
    }
    const data = {
      id: record.id,
      date: record.date,
      companyId: record.companyId,
      companyName: (record as any).company?.name ?? 'Empresa',
      createdAt: (record as any).createdAt?.toISOString?.() ?? (record as any).createdAt,
      answers: (record as any).answers ?? undefined,
      groupScores: (record as any).groupScores ?? undefined,
      totalScore: (record as any).totalScore ?? undefined,
      maxScore: (record as any).maxScore ?? undefined,
      hasAnalysis: !!(record as any).analysis,
    };
    return { ok: true, data };
  }

  @Post()
  async create(@Body() body: CreateAssessmentDto, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech } = await this.getRoles(userId);
    if (!(isAdmin || isTech)) return { ok: false, error: 'Forbidden' };

    const { id, date, companyId, answers, groupScores, totalScore, maxScore } = body || ({} as any);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Data inválida (YYYY-MM-DD).' };
    if (!companyId) return { ok: false, error: 'Empresa inválida.' };
    const company = await this.prisma.company.findUnique({ where: { id: String(companyId) } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };

    try {
      const created = await this.prisma.maturityAssessment.create({
        data: {
          id: id || undefined,
          date,
          companyId: String(companyId),
          answers: answers ?? undefined,
          groupScores: groupScores ?? undefined,
          totalScore: typeof totalScore === 'number' ? totalScore : undefined,
          maxScore: typeof maxScore === 'number' ? maxScore : undefined,
        },
        include: { company: true },
      });
      const data = {
        id: created.id,
        date: created.date,
        companyId: created.companyId,
        companyName: (created as any).company?.name ?? 'Empresa',
        createdAt: (created as any).createdAt?.toISOString?.() ?? (created as any).createdAt,
        answers: (created as any).answers ?? undefined,
        groupScores: (created as any).groupScores ?? undefined,
        totalScore: (created as any).totalScore ?? undefined,
        maxScore: (created as any).maxScore ?? undefined,
      };
      return { ok: true, data };
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase().includes('unique constraint') ? 'Registro já existe.' : 'Falha ao criar registro.';
      return { ok: false, error: msg };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech } = await this.getRoles(userId);
    if (!(isAdmin || isTech)) return { ok: false, error: 'Forbidden' };
    try {
      await this.prisma.maturityAssessment.delete({ where: { id } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Registro não encontrado.' };
    }
  }

  @Post('analysis')
  async analyze(
    @Body() body: any,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech } = await this.getRoles(userId);
    if (!(isAdmin || isTech)) return { ok: false, error: 'Forbidden' };

    const { assessmentId, answers, companyContext, targetFrameworks, language } = body || {};
    let sourceAnswers = answers;
    let ctx = companyContext || {};
    if (assessmentId && !answers) {
      const record = await this.prisma.maturityAssessment.findUnique({ where: { id: String(assessmentId) } });
      if (!record) return { ok: false, error: 'Avaliação não encontrada.' };
      sourceAnswers = record.answers || { groupScores: record.groupScores, totalScore: record.totalScore, maxScore: record.maxScore };
      // Passar companyId para permitir carregamento de perfil do cliente
      ctx = { ...(companyContext || {}), companyId: record.companyId };
    }
    try {
      const result = await this.ai.analyze({
        answers: sourceAnswers,
        companyContext: ctx,
        targetFrameworks,
        language,
      });
      // Persistir análise atrelada à avaliação
      if (assessmentId) {
        await this.prisma.maturityAnalysis.upsert({
          where: { assessmentId: String(assessmentId) },
          update: { content: result, updatedAt: new Date(), createdById: userId },
          create: { assessmentId: String(assessmentId), content: result, createdById: userId },
        });
      }
      return { ok: true, data: result };
    } catch (e: any) {
      // Log detalhado para diagnóstico em ambiente local
      console.error('AI analysis error:', e?.message || e, e?.stack || '');
      const msg = e?.message?.includes('OPENAI_API_KEY') ? 'Configuração ausente: OPENAI_API_KEY.' : 'Falha na análise por IA.';
      return { ok: false, error: msg };
    }
  }

  // Obter análise salva (visível a clientes vinculados)
  @Get(':id/analysis')
  async getAnalysis(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech, memberships } = await this.getRoles(userId);

    const record = await this.prisma.maturityAssessment.findUnique({ where: { id: String(id) } });
    if (!record) return { ok: false, error: 'Registro não encontrado.' };
    if (!(isAdmin || isTech)) {
      const hasCompany = (memberships || []).some((m: any) => m.companyId === record.companyId);
      if (!hasCompany) return { ok: false, error: 'Forbidden' };
    }
    const analysis = await this.prisma.maturityAnalysis.findUnique({ where: { assessmentId: String(id) } });
    if (!analysis) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        id: analysis.id,
        content: analysis.content,
        createdAt: (analysis as any).createdAt?.toISOString?.() ?? (analysis as any).createdAt,
        updatedAt: (analysis as any).updatedAt?.toISOString?.() ?? (analysis as any).updatedAt,
      },
    };
  }

  // Atualizar análise manualmente (apenas admin/tech)
  @Put(':id/analysis')
  async updateAnalysis(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech } = await this.getRoles(userId);
    if (!(isAdmin || isTech)) return { ok: false, error: 'Forbidden' };
    const content = body?.content;
    if (!content) return { ok: false, error: 'Conteúdo ausente.' };
    const updated = await this.prisma.maturityAnalysis.upsert({
      where: { assessmentId: String(id) },
      update: { content, updatedAt: new Date(), createdById: userId },
      create: { assessmentId: String(id), content, createdById: userId },
    });
    return { ok: true, data: { id: updated.id } };
  }

  // Excluir análise (apenas admin/tech)
  @Delete(':id/analysis')
  async deleteAnalysis(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, error: 'Unauthorized' };
    const { isAdmin, isTech } = await this.getRoles(userId);
    if (!(isAdmin || isTech)) return { ok: false, error: 'Forbidden' };
    try {
      await this.prisma.maturityAnalysis.delete({ where: { assessmentId: String(id) } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Análise não encontrada.' };
    }
  }
}