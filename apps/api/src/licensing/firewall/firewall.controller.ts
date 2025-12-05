import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { FirewallService } from './firewall.service';
import { PrismaService } from '../../prisma.service';
import { JwtService } from '@nestjs/jwt';

function getTokenFromHeader(auth?: string): string | null {
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

@Controller('licensing/firewall')
export class FirewallController {
  constructor(private readonly service: FirewallService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

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

  @Get()
  async list(@Query('companyId') companyId: string, @Query('siteId') siteId: string | undefined, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: siteId } });
      if (!site) return [];
      if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
      return this.service.listBySite(siteId);
    }
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.listByCompany(companyId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const lic = await this.service.get(id);
    if (!lic) return null;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((lic as any).companyId)) return { ok: false, error: 'Forbidden' };
    return lic;
  }

  @Post()
  async create(@Body() body: { companyId: string; siteId?: string; vendor: string; model: string; serial: string; licenseName: string; expiresAt: string; notes?: string; ipAddressId?: string }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const lic = await this.service.get(id);
    if (!lic) return { ok: false, error: 'Registro não encontrado' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((lic as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const lic = await this.service.get(id);
    if (!lic) return { ok: false, error: 'Registro não encontrado' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((lic as any).companyId)) return { ok: false, error: 'Forbidden' };
    await this.service.remove(id);
    return { ok: true };
  }
}
