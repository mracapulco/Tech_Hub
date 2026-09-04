import { Body, Controller, Get, Headers, Param, Post, Put, Delete, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../common/auth-context';

type BrandDto = {
  name: string;
  description?: string;
  logoUrl?: string;
  status?: string;
  deviceTypeIds?: string[];
};

@Controller('brands')
export class BrandsController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('deviceTypeId') deviceTypeId?: string,
    @Query('includeDeviceTypes') includeDeviceTypes?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const where: any = {};
    if (deviceTypeId) where.deviceTypes = { some: { deviceTypeId } };
    const items = await this.prisma.brand.findMany({
      where,
      orderBy: { name: 'asc' },
      include: includeDeviceTypes === 'true' ? { deviceTypes: { include: { deviceType: true } } } : undefined,
    });
    return { ok: true, data: items };
  }

  @Post()
  async create(@Body() body: BrandDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const data = {
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
      status: (body.status?.trim() || 'ACTIVE'),
    } as const;
    if (!data.name) return { ok: false, error: 'O campo nome é obrigatório.' };
    try {
      const created = await this.prisma.brand.create({ data });
      const ids = Array.isArray(body.deviceTypeIds) ? (body.deviceTypeIds.filter((s) => typeof s === 'string')) : [];
      if (ids.length > 0) {
        await this.prisma.brandDeviceType.createMany({ data: ids.map((deviceTypeId) => ({ brandId: created.id, deviceTypeId })) });
      }
      const full = await this.prisma.brand.findUnique({ where: { id: created.id }, include: { deviceTypes: { include: { deviceType: true } } } });
      return { ok: true, data: full };
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: false, error: 'Nome já cadastrado.' };
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao criar marca. ${detail}` };
    }
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const item = await this.prisma.brand.findUnique({ where: { id }, include: { deviceTypes: { include: { deviceType: true } } } });
    if (!item) return { ok: false, error: 'Marca não encontrada.' };
    return { ok: true, data: item };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: BrandDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const data = {
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
      status: (body.status?.trim() || 'ACTIVE'),
    } as const;
    if (!data.name) return { ok: false, error: 'O campo nome é obrigatório.' };
    try {
      const updated = await this.prisma.brand.update({ where: { id }, data });
      const ids = Array.isArray(body.deviceTypeIds) ? (body.deviceTypeIds.filter((s) => typeof s === 'string')) : null;
      if (ids) {
        await this.prisma.$transaction([
          this.prisma.brandDeviceType.deleteMany({ where: { brandId: id } }),
          ...(ids.length > 0 ? [this.prisma.brandDeviceType.createMany({ data: ids.map((deviceTypeId) => ({ brandId: id, deviceTypeId })) })] : [])
        ]);
      }
      const full = await this.prisma.brand.findUnique({ where: { id }, include: { deviceTypes: { include: { deviceType: true } } } });
      return { ok: true, data: full };
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: false, error: 'Nome já cadastrado.' };
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao atualizar marca. ${detail}` };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: 'Marca não encontrada.' };
    try {
      await this.prisma.$transaction([
        this.prisma.brandDeviceType.deleteMany({ where: { brandId: id } }),
        this.prisma.brand.delete({ where: { id } }),
      ]);
      return { ok: true };
    } catch (e: any) {
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao excluir marca. ${detail}` };
    }
  }
}
