import { Body, Controller, Get, Headers, Param, Post, Put, Query, Delete } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';

function getTokenFromHeader(authorization?: string) {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

type DeviceDto = {
  deviceTypeId: string;
  brandId: string;
  model: string;
  slug?: string;
  uHeight?: number | null;
  isFullDepth?: boolean;
  frontImage?: boolean;
  rearImage?: boolean;
  weight?: number | null;
  weightUnit?: string | null;
  airflow?: string | null;
  consolePorts?: any;
  interfaces?: any;
  moduleBays?: any;
  status?: string;
};

@Controller('devices')
export class DevicesController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Get()
  async list(
    @Query('deviceTypeId') deviceTypeId?: string,
    @Query('brandId') brandId?: string,
    @Headers('authorization') authorization?: string,
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
    if (deviceTypeId) where.deviceTypeId = deviceTypeId;
    if (brandId) where.brandId = brandId;
    const items = await this.prisma.device.findMany({
      where,
      orderBy: [{ model: 'asc' }],
      include: {
        deviceType: true,
        brand: true,
      },
    });
    return { ok: true, data: items };
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
    const item = await this.prisma.device.findUnique({ 
      where: { id },
      include: {
        deviceType: true,
        brand: true,
      },
    });
    if (!item) return { ok: false, error: 'Dispositivo não encontrado.' };
    return { ok: true, data: item };
  }

  @Post()
  async create(@Body() body: DeviceDto, @Headers('authorization') authorization?: string) {
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
      deviceTypeId: body.deviceTypeId?.trim(),
      brandId: body.brandId?.trim(),
      model: body.model?.trim(),
      slug: body.slug?.trim() || null,
      uHeight: typeof body.uHeight === 'number' ? body.uHeight : null,
      isFullDepth: Boolean(body.isFullDepth),
      frontImage: Boolean(body.frontImage),
      rearImage: Boolean(body.rearImage),
      weight: typeof body.weight === 'number' ? body.weight : null,
      weightUnit: (body.weightUnit?.trim() || 'kg'),
      airflow: body.airflow?.trim() || null,
      consolePorts: body.consolePorts ?? null,
      interfaces: body.interfaces ?? null,
      moduleBays: body.moduleBays ?? null,
      status: (body.status?.trim() || 'ACTIVE'),
    } as const;
    if (!data.deviceTypeId) return { ok: false, error: 'Tipo de dispositivo é obrigatório.' };
    if (!data.brandId) return { ok: false, error: 'Marca é obrigatória.' };
    if (!data.model) return { ok: false, error: 'Modelo é obrigatório.' };
    try {
      const created = await this.prisma.device.create({ data });
      return { ok: true, data: created };
    } catch (e: any) {
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao criar dispositivo. ${detail}` };
    }
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: DeviceDto, @Headers('authorization') authorization?: string) {
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
    const data: any = {};
    if (typeof body.deviceTypeId === 'string') data.deviceTypeId = body.deviceTypeId.trim();
    if (typeof body.brandId === 'string') data.brandId = body.brandId.trim();
    if (typeof body.model === 'string') data.model = body.model.trim();
    if (typeof body.slug === 'string') data.slug = body.slug.trim() || null;
    if (typeof body.uHeight !== 'undefined') data.uHeight = typeof body.uHeight === 'number' ? body.uHeight : null;
    if (typeof body.isFullDepth !== 'undefined') data.isFullDepth = Boolean(body.isFullDepth);
    if (typeof body.frontImage !== 'undefined') data.frontImage = Boolean(body.frontImage);
    if (typeof body.rearImage !== 'undefined') data.rearImage = Boolean(body.rearImage);
    if (typeof body.weight !== 'undefined') data.weight = typeof body.weight === 'number' ? body.weight : null;
    if (typeof body.weightUnit !== 'undefined') data.weightUnit = (body.weightUnit?.trim() || 'kg');
    if (typeof body.airflow !== 'undefined') data.airflow = body.airflow?.trim() || null;
    if (typeof body.consolePorts !== 'undefined') data.consolePorts = body.consolePorts ?? null;
    if (typeof body.interfaces !== 'undefined') data.interfaces = body.interfaces ?? null;
    if (typeof body.moduleBays !== 'undefined') data.moduleBays = body.moduleBays ?? null;
    if (typeof body.status !== 'undefined') data.status = (body.status?.trim() || 'ACTIVE');
    try {
      const updated = await this.prisma.device.update({ where: { id }, data });
      return { ok: true, data: updated };
    } catch (e: any) {
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao atualizar dispositivo. ${detail}` };
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
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: 'Dispositivo não encontrado.' };
    try {
      await this.prisma.device.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao excluir dispositivo. ${detail}` };
    }
  }
}