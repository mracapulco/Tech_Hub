import { Body, Controller, Get, Param, Post, Query, Delete, Put, Headers } from '@nestjs/common';
import { IpamService } from './ipam.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../common/auth-context';

class CreateSubnetDto {
  companyId!: string;
  siteId?: string;
  vlanId?: string;
  vrfId?: string;
  name!: string;
  cidr!: string;
  description?: string;
}

class UpsertAddressDto {
  subnetId!: string;
  address!: string;
  hostname?: string;
  status?: 'ASSIGNED' | 'RESERVED';
  assignedTo?: string;
}

@Controller('ipam')
export class IpamController {
  constructor(private readonly service: IpamService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private async getUserContext(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get('subnets')
  async listSubnets(@Query('companyId') companyId: string, @Query('siteId') siteId?: string, @Query('vlanId') vlanId?: string, @Query('vrfId') vrfId?: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.listSubnets(companyId, siteId, vlanId, vrfId);
  }

  @Post('subnets')
  async createSubnet(@Body() body: CreateSubnetDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(body.companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.createSubnet(body);
  }

  @Get('subnets/:id')
  async getSubnet(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    const s = await this.service.getSubnet(id);
    if (!s) return null;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    return s;
  }

  @Get('subnets-stats')
  async stats(@Query('companyId') companyId: string, @Query('siteId') siteId?: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.listSubnetsWithStats(companyId, siteId);
  }

  @Post('plan')
  async plan(@Body() body: { siteId: string; baseCidr: string; expectations?: Record<string, number> }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    const site = await this.prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) return { ok: false, error: 'Site inválido' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((site as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.planSubnetsForSite(body.siteId, body.baseCidr, body.expectations || {});
  }

  @Get('addresses')
  async listAddresses(@Query('subnetId') subnetId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    const s = await this.service.getSubnet(subnetId);
    if (!s) return [];
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.listAddresses(subnetId);
  }

  @Get('addresses-by-company')
  async listAddressesByCompany(@Query('companyId') companyId: string, @Query('siteId') siteId: string | undefined, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.listAddressesByCompany(companyId, siteId);
  }

  @Post('addresses')
  async upsertAddress(@Body() body: UpsertAddressDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const s = await this.service.getSubnet(body.subnetId);
    if (!s) return { ok: false, error: 'Subnet não encontrada' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.upsertAddress(body);
  }

  @Delete('addresses')
  async deleteAddress(@Query('subnetId') subnetId: string, @Query('address') address: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const s = await this.service.getSubnet(subnetId);
    if (!s) return { ok: false, error: 'Subnet não encontrada' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.deleteAddress(subnetId, address);
  }

  @Put('subnets/:id')
  async updateSubnet(@Param('id') id: string, @Body() body: Partial<CreateSubnetDto & { name?: string; description?: string }>, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const s = await this.service.getSubnet(id);
    if (!s) return { ok: false, error: 'Subnet não encontrada' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    return this.prisma.ipSubnet.update({ where: { id }, data: { name: body.name ?? (s as any).name, cidr: body.cidr ?? (s as any).cidr, description: body.description ?? (s as any).description, siteId: body.siteId ?? (s as any).siteId ?? null, vlanId: body.vlanId ?? (s as any).vlanId ?? null, vrfId: body.vrfId ?? (s as any).vrfId ?? null } });
  }

  @Delete('subnets/:id')
  async deleteSubnet(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getUserContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    const s = await this.prisma.ipSubnet.findUnique({ where: { id } });
    if (!s) return { ok: false, error: 'Subnet não encontrada' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes((s as any).companyId)) return { ok: false, error: 'Forbidden' };
    try {
      await this.prisma.ipAddress.deleteMany({ where: { subnetId: id } });
      await this.prisma.ipSubnet.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: 'Erro ao excluir subnet.' };
    }
  }
}
