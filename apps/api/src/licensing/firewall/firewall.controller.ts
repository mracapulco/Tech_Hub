import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { FirewallService } from './firewall.service';
import { PrismaService } from '../../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../../common/auth-context';

@Controller('licensing/firewall')
export class FirewallController {
  constructor(private readonly service: FirewallService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
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
    if (!companyId) {
      return this.service.listByCompanies(ctx.allowedCompanyIds);
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
  async create(@Body() body: { companyId: string; siteId?: string; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string; licenseFileUrl?: string; expiresAt: string; notes?: string; ipAddressId?: string }, @Headers('authorization') authorization?: string) {
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
