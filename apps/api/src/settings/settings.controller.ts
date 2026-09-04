import { Body, Controller, Get, Headers, Post, Param } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma.service';
import { getRequestContext } from '../common/auth-context';

@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get('openai-key')
  async getOpenAiKey(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const masked = await this.settings.getOpenAiKeyMasked();
    return { ok: true, data: masked };
  }

  @Post('openai-key')
  async setOpenAiKey(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const { value } = body || {};
    if (!value || typeof value !== 'string' || value.length < 8) return { ok: false, error: 'Chave inválida.' };
    try {
      await this.settings.setOpenAiKey(value, ctx.userId);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao armazenar a chave.';
      return { ok: false, error: msg };
    }
  }

  @Get('ai-config')
  async getAiConfig(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    try {
      const cfg = await this.settings.getAiConfig();
      const maskedKey = await this.settings.getOpenAiKeyMasked();
      return { ok: true, data: { ...cfg, openaiKeyMasked: maskedKey?.masked || null } };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao consultar configurações.';
      return { ok: false, error: msg };
    }
  }

  @Post('ai-config')
  async setAiConfig(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const { provider, baseURL, model, openaiKey } = body || {};
    try {
      if (openaiKey) await this.settings.setOpenAiKey(String(openaiKey), ctx.userId);
      await this.settings.setAiConfig({ provider, baseURL, model }, ctx.userId);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao salvar configurações.';
      return { ok: false, error: msg };
    }
  }

  // ---------- Tech Master Standards ----------
  @Get('company-standards')
  async getCompanyStandards(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    try {
      const data = await this.settings.getCompanyStandards();
      return { ok: true, data: data || {} };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao consultar padrões.';
      return { ok: false, error: msg };
    }
  }

  @Post('company-standards')
  async setCompanyStandards(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const { standards } = body || {};
    try {
      await this.settings.setCompanyStandards(standards ?? {}, ctx.userId);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao salvar padrões.';
      return { ok: false, error: msg };
    }
  }

  // ---------- Client Profile ----------
  @Get('client-profile/:companyId')
  async getClientProfile(@Param('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    // Permitir ADMIN/TECHNICIAN ou vínculo à empresa
    const hasAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(companyId);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };
    try {
      const data = await this.settings.getClientProfile(companyId);
      return { ok: true, data: data || {} };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao consultar perfil do cliente.';
      return { ok: false, error: msg };
    }
  }

  @Post('client-profile/:companyId')
  async setClientProfile(
    @Param('companyId') companyId: string,
    @Body() body: any,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const hasAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(companyId);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };
    const { profile } = body || {};
    try {
      await this.settings.setClientProfile(companyId, profile ?? {}, ctx.userId);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message?.includes('CONFIG_MASTER_KEY') ? 'CONFIG_MASTER_KEY ausente.' : 'Falha ao salvar perfil do cliente.';
      return { ok: false, error: msg };
    }
  }
}