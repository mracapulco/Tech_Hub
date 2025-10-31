import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(username: string, password: string) {
    if (!username || !password) {
      return { ok: false, message: 'Credenciais inválidas' };
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      return { ok: false, message: 'Credenciais inválidas' };
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return { ok: false, message: 'Credenciais inválidas' };
    }

    const token = await this.jwt.signAsync({ sub: user.id, username: user.username });
    return {
      ok: true,
      token,
      user: { id: user.id, username: user.username, name: user.name },
    };
  }
}