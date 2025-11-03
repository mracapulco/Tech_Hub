import { Body, Controller, Get, Headers, Param, Post, Put, Delete, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';

function getTokenFromHeader(authorization?: string) {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

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

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
    @Query('deviceTypeId') deviceTypeId?: string,
    @Query('includeDeviceTypes') includeDeviceTypes?: string,
  ) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
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
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
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
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
    const item = await this.prisma.brand.findUnique({ where: { id }, include: { deviceTypes: { include: { deviceType: true } } } });
    if (!item) return { ok: false, error: 'Marca não encontrada.' };
    return { ok: true, data: item };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: BrandDto, @Headers('authorization') authorization?: string) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
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
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
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