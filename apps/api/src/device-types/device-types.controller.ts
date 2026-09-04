import { Body, Controller, Get, Headers, Param, Post, Put, Delete } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../common/auth-context';

type DeviceTypeDto = {
  name: string;
  description?: string;
  status?: string;
};

@Controller('device-types')
export class DeviceTypesController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const items = await this.prisma.deviceType.findMany({ orderBy: { name: 'asc' } });
    return { ok: true, data: items };
  }

  @Post()
  async create(@Body() body: DeviceTypeDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
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
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const item = await this.prisma.deviceType.findUnique({ where: { id } });
    if (!item) return { ok: false, error: 'Tipo de dispositivo não encontrado.' };
    return { ok: true, data: item };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: DeviceTypeDto, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
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
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
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
