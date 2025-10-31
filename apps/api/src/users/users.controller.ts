import { Body, Controller, Get, Put, Headers, Post, Param, Delete } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

class UpdateMeDto {
  name?: string;
  lastName?: string;
  email?: string;
  password?: string;
  avatarUrl?: string | null;
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private getUserIdFromAuthHeader(authorization?: string): string | null {
    if (!authorization) return null;
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    const token = parts[1];
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, message: 'Não autorizado' };
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, message: 'Usuário não encontrado' };
    return {
      ok: true,
      user: { id: user.id, username: (user as any).username, name: user.name, lastName: (user as any).lastName ?? null, email: user.email, avatarUrl: (user as any).avatarUrl ?? null },
    };
  }

  private verifyToken(authorization?: string): boolean {
    if (!authorization) return false;
    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
    const token = parts[1];
    try {
      this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      return true;
    } catch {
      return false;
    }
  }

  // Listar todos os usuários
  @Get()
  async list(@Headers('authorization') authorization?: string) {
    if (!this.verifyToken(authorization)) return { ok: false, error: 'Unauthorized' };
    const users = await this.prisma.user.findMany({ orderBy: { name: 'asc' } });
    return {
      ok: true,
      data: users.map((u) => ({ id: u.id, username: (u as any).username, name: u.name, lastName: (u as any).lastName ?? null, email: u.email, status: u.status })),
    };
  }

  // Criar usuário
  @Post()
  async create(@Headers('authorization') authorization: string | undefined, @Body() body: any) {
    if (!this.verifyToken(authorization)) return { ok: false, error: 'Unauthorized' };

    const email = String(body.email || '').trim();
    const username = body.username ? String(body.username).trim() : null;
    const name = String(body.name || '').trim();
    const lastName = body.lastName ? String(body.lastName).trim() : null;
    const password = String(body.password || '');
    const companyId = body.companyId ? String(body.companyId) : null;
    const role = body.role ? String(body.role) : null;
    const avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;

    if (!email || !name || !password) {
      return { ok: false, error: 'Campos obrigatórios: nome, email e senha.' };
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const created = await this.prisma.user.create({
        data: {
          email,
          username,
          name,
          lastName,
          password: hash,
          avatarUrl,
        },
      });

      if (companyId && role) {
        try {
          await this.prisma.userCompanyMembership.create({ data: { userId: created.id, companyId, role: role as any } });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Erro ao vincular usuário à empresa:', e);
        }
      }

      return {
        ok: true,
        data: { id: created.id, username: (created as any).username, name: created.name, lastName: (created as any).lastName ?? null, email: created.email, avatarUrl: (created as any).avatarUrl ?? null },
      };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const target = e?.meta?.target;
        if (String(target).includes('email')) return { ok: false, error: 'Email já cadastrado.' };
        if (String(target).includes('username')) return { ok: false, error: 'Username já cadastrado.' };
      }
      // eslint-disable-next-line no-console
      console.error('Erro ao criar usuário:', e);
      return { ok: false, error: 'Erro ao criar usuário.' };
    }
  }

  // Detalhar usuário
  @Get(':id')
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    if (!this.verifyToken(authorization)) return { ok: false, error: 'Unauthorized' };
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return { ok: false, error: 'Usuário não encontrado.' };
    const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId: id }, include: { company: true } });
    return {
      ok: true,
      data: {
        id: user.id,
        username: (user as any).username,
        name: user.name,
        lastName: (user as any).lastName ?? null,
        email: user.email,
        status: user.status,
        avatarUrl: (user as any).avatarUrl ?? null,
        memberships: memberships.map((m: any) => ({ companyId: m.companyId, companyName: m.company?.name, role: m.role })),
      },
    };
  }

  // Atualizar usuário
  @Put(':id')
  async update(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Body() body: any) {
    if (!this.verifyToken(authorization)) return { ok: false, error: 'Unauthorized' };
    const data: any = {};
    if (body.email !== undefined) data.email = String(body.email).trim();
    if (body.username !== undefined) data.username = body.username ? String(body.username).trim() : null;
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.lastName !== undefined) data.lastName = body.lastName ? String(body.lastName).trim() : null;
    if (body.password) data.password = await bcrypt.hash(String(body.password), 10);
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
    try {
      const updated = await this.prisma.user.update({ where: { id }, data });
      return { ok: true, data: { id: updated.id, username: (updated as any).username, name: updated.name, lastName: (updated as any).lastName ?? null, email: updated.email, avatarUrl: (updated as any).avatarUrl ?? null } };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const target = e?.meta?.target;
        if (String(target).includes('email')) return { ok: false, error: 'Email já cadastrado.' };
        if (String(target).includes('username')) return { ok: false, error: 'Username já cadastrado.' };
      }
      // eslint-disable-next-line no-console
      console.error('Erro ao atualizar usuário:', e);
      return { ok: false, error: 'Erro ao atualizar usuário.' };
    }
  }

  // Excluir usuário
  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    if (!this.verifyToken(authorization)) return { ok: false, error: 'Unauthorized' };
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return { ok: false, error: 'Usuário não encontrado.' };
    try {
      await this.prisma.$transaction([
        this.prisma.userCompanyMembership.deleteMany({ where: { userId: id } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
      return { ok: true };
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Erro ao excluir usuário:', e);
      return { ok: false, error: 'Erro ao excluir usuário.' };
    }
  }

  @Put('me')
  async updateMe(@Headers('authorization') authorization: string | undefined, @Body() body: UpdateMeDto) {
    const userId = this.getUserIdFromAuthHeader(authorization);
    if (!userId) return { ok: false, message: 'Não autorizado' };

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.email !== undefined) data.email = body.email;
    if (body.password) data.password = await bcrypt.hash(body.password, 10);
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return {
      ok: true,
      user: { id: user.id, username: (user as any).username, name: user.name, lastName: (user as any).lastName ?? null, email: user.email, avatarUrl: (user as any).avatarUrl ?? null },
    };
  }
}