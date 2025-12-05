import { Body, Controller, Get, Post, Query, Headers, Delete, Param, Put } from '@nestjs/common';
import { SitesService } from './sites.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';

class CreateSiteDto {
  companyId!: string;
  name!: string;
  city?: string;
  state?: string;
}

@Controller('sites')
export class SitesController {
  constructor(private readonly service: SitesService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private getTokenFromHeader(auth?: string): string | null {
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    return null;
  }

  private async getUserContext(authorization?: string) {
    const token = this.getTokenFromHeader(authorization);
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
  async list(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.list(companyId);
  }

  @Post()
  async create(@Body() body: CreateSiteDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<CreateSiteDto & { name?: string }>, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const current = await this.prisma.site.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'Site não encontrado' };
    const targetCompanyId = body.companyId ?? (current as any).companyId;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(targetCompanyId)) return { ok: false, error: 'Forbidden' };
    return this.prisma.site.update({ where: { id }, data: { companyId: targetCompanyId, name: body.name ?? (current as any).name, city: body.city ?? (current as any).city ?? null, state: body.state ?? (current as any).state ?? null } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const current = await this.prisma.site.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'Site não encontrado' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((current as any).companyId)) return { ok: false, error: 'Forbidden' };
    try {
      await this.prisma.ipSubnet.updateMany({ where: { siteId: id }, data: { siteId: null } });
      await this.prisma.vlan.deleteMany({ where: { siteId: id } });
      await this.prisma.site.delete({ where: { id } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro ao excluir site.' };
    }
  }
}
