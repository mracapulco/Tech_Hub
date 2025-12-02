import { Body, Controller, Get, Post, Query, Headers, Delete, Param, Put } from '@nestjs/common';
import { VlansService } from './vlans.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';

class CreateVlanDto {
  siteId!: string;
  number!: number;
  name!: string;
  purpose?: string;
}

@Controller('vlans')
export class VlansController {
  constructor(private readonly service: VlansService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

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
  async list(@Query('siteId') siteId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) return [];
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.list(siteId);
  }

  @Post()
  async create(@Body() body: CreateVlanDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) return { ok: false, error: 'Site inválido' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.create({ siteId: body.siteId, number: Number(body.number), name: body.name, purpose: body.purpose });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<CreateVlanDto & { name?: string }>, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const current = await this.prisma.vlan.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'VLAN não encontrada' };
    const site = await this.prisma.site.findUnique({ where: { id: (current as any).siteId } });
    if (!site) return { ok: false, error: 'Site inválido' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.prisma.vlan.update({ where: { id }, data: { number: body.number ? Number(body.number) : (current as any).number, name: body.name ?? (current as any).name, purpose: body.purpose ?? (current as any).purpose ?? null } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const current = await this.prisma.vlan.findUnique({ where: { id } });
    if (!current) return { ok: false, error: 'VLAN não encontrada' };
    const site = await this.prisma.site.findUnique({ where: { id: (current as any).siteId } });
    if (!site) return { ok: false, error: 'Site inválido' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
    try {
      await this.prisma.ipSubnet.updateMany({ where: { vlanId: id }, data: { vlanId: null } });
      await this.prisma.vlan.delete({ where: { id } });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro ao excluir VLAN.' };
    }
  }
}
