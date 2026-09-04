import { Body, Controller, Get, Post, Query, Headers } from '@nestjs/common';
import { ZabbixService } from './zabbix.service';
import { PrismaService } from '../../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../../common/auth-context';

@Controller('integrations/zabbix')
export class ZabbixController {
  constructor(private readonly service: ZabbixService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Post('config')
  async setConfig(@Body() body: { companyId: string; url: string; token: string; groupPrefix?: string }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
    if (!body.url || !body.token || !body.groupPrefix) return { ok: false, error: 'Prefixo, URL e Token são obrigatórios' };
    return this.service.setConfig(body.companyId, { url: body.url, token: body.token, groupPrefix: body.groupPrefix }, ctx.userId);
  }

  @Get('config')
  async getConfig(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const cfg = await this.service.getConfig(companyId);
    return { ok: true, data: cfg };
  }

  @Post('sync')
  async sync(@Body() body: { companyId: string; debug?: boolean; dnsFallback?: boolean }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.sync(body.companyId, body.debug, body.dnsFallback);
  }
}
