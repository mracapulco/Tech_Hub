import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditLogService } from '../audit/audit-log.service';

export type LoginRequestMeta = { ipAddress?: string | null; userAgent?: string | null };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(username: string, password: string, meta: LoginRequestMeta = {}) {
    const logFailure = (reason: string) =>
      this.auditLog.log({
        actorUsername: username || null,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'Auth',
        description: `Tentativa de login falhou para usuário "${username}": ${reason}`,
        httpMethod: 'POST',
        route: '/auth/login',
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        status: 'FAILURE',
        errorMessage: reason,
        severity: 'SECURITY',
      });

    if (!username || !password) {
      await logFailure('Credenciais ausentes');
      return { ok: false, message: 'Credenciais inválidas' };
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      await logFailure('Usuário não encontrado');
      return { ok: false, message: 'Credenciais inválidas' };
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await logFailure('Senha incorreta');
      return { ok: false, message: 'Credenciais inválidas' };
    }

    if (String((user as any).status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
      await logFailure('Usuário inativo');
      return { ok: false, message: 'Usuário inativo. Contate um administrador.' };
    }

    const token = await this.jwt.signAsync({ sub: user.id, username: user.username });

    await this.auditLog.log({
      actorUserId: user.id,
      actorUsername: user.username,
      actorName: [user.name, (user as any).lastName].filter(Boolean).join(' '),
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'Auth',
      entityId: user.id,
      description: `Login realizado com sucesso: ${user.username}`,
      httpMethod: 'POST',
      route: '/auth/login',
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: 'SUCCESS',
      severity: 'SECURITY',
    });

    return {
      ok: true,
      token,
      user: { id: user.id, username: user.username, name: user.name },
    };
  }

  async logout(userId: string | null, username: string | null, meta: LoginRequestMeta = {}) {
    await this.auditLog.log({
      actorUserId: userId,
      actorUsername: username,
      action: 'AUTH_LOGOUT',
      entityType: 'Auth',
      entityId: userId,
      description: `Logout: ${username ?? userId ?? 'desconhecido'}`,
      httpMethod: 'POST',
      route: '/auth/logout',
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: 'SUCCESS',
      severity: 'SECURITY',
    });
    return { ok: true };
  }
}
