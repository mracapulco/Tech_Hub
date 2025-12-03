import { Body, Controller, Get, Post, Query, Headers } from '@nestjs/common';
import { ZabbixService } from './zabbix.service';
import { PrismaService } from '../../prisma.service';
import { JwtService } from '@nestjs/jwt';

function getTokenFromHeader(auth?: string): string | null {
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

@Controller('integrations/zabbix')
export class ZabbixController {
  constructor(private readonly service: ZabbixService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' } as const;
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' } as const;
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { companyId: true, role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      const isTechnician = memberships.some((m: any) => m.role === 'TECHNICIAN');
      const allowedCompanyIds = memberships.map((m: any) => m.companyId);
      return { ok: true, userId, isAdmin, isTechnician, allowedCompanyIds } as const;
    } catch {
      return { ok: false, error: 'Invalid token' } as const;
    }
  }

  @Post('config')
  async setConfig(@Body() body: { companyId: string; url: string; token: string; groupPrefix?: string }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
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
