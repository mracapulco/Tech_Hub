import { Body, Controller, Get, Headers, Param, Post, Put, Delete } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';

function getTokenFromHeader(authorization?: string) {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

type DeviceTypeDto = {
  name: string;
  description?: string;
  status?: string;
};

@Controller('device-types')
export class DeviceTypesController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
    const items = await this.prisma.deviceType.findMany({ orderBy: { name: 'asc' } });
    return { ok: true, data: items };
  }

  @Post()
  async create(@Body() body: DeviceTypeDto, @Headers('authorization') authorization?: string) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { role: true } });
      const globalAdmins = String(process.env.GLOBAL_ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
      const username = String(payload?.username || '').toLowerCase();
      const isGlobalAdmin = globalAdmins.includes(username);
      const isAdmin = isGlobalAdmin || memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
    const data = {
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      status: (body.status?.trim() || 'ACTIVE'),
    } as const;
    if (!data.name) return { ok: false, error: 'O campo nome é obrigatório.' };
    try {
      const created = await this.prisma.deviceType.create({ data });
      return { ok: true, data: created };
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: false, error: 'Nome já cadastrado.' };
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao criar tipo de dispositivo. ${detail}` };
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
    const item = await this.prisma.deviceType.findUnique({ where: { id } });
    if (!item) return { ok: false, error: 'Tipo de dispositivo não encontrado.' };
    return { ok: true, data: item };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: DeviceTypeDto, @Headers('authorization') authorization?: string) {
    const token = getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' };
    try {
      const payload: any = this.jwt.verify(token);
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' };
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { role: true } });
      const globalAdmins = String(process.env.GLOBAL_ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
      const username = String(payload?.username || '').toLowerCase();
      const isGlobalAdmin = globalAdmins.includes(username);
      const isAdmin = isGlobalAdmin || memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
    const data = {
      name: body.name?.trim(),
      description: body.description?.trim() || null,
      status: (body.status?.trim() || 'ACTIVE'),
    } as const;
    if (!data.name) return { ok: false, error: 'O campo nome é obrigatório.' };
    try {
      const updated = await this.prisma.deviceType.update({ where: { id }, data });
      return { ok: true, data: updated };
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: false, error: 'Nome já cadastrado.' };
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao atualizar tipo de dispositivo. ${detail}` };
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
      const globalAdmins = String(process.env.GLOBAL_ADMINS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
      const username = String(payload?.username || '').toLowerCase();
      const isGlobalAdmin = globalAdmins.includes(username);
      const isAdmin = isGlobalAdmin || memberships.some((m: any) => m.role === 'ADMIN');
      if (!isAdmin) return { ok: false, error: 'Forbidden' };
    } catch (e) {
      return { ok: false, error: 'Invalid token' };
    }
    const existing = await this.prisma.deviceType.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: 'Tipo de dispositivo não encontrado.' };
    try {
      await this.prisma.deviceType.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao excluir tipo de dispositivo. ${detail}` };
    }
  }
}
