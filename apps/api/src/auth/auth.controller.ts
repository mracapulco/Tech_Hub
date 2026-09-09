import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { getBearerToken, resolveIp } from '../common/auth-context';
import { JwtService } from '@nestjs/jwt';

class LoginDto {
  username!: string;
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly jwt: JwtService) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const { username, password } = body;
    return this.authService.login(username, password, {
      ipAddress: resolveIp(req),
      userAgent: req.headers?.['user-agent'] as string | undefined,
    });
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    const token = getBearerToken(authorization);
    let userId: string | null = null;
    let username: string | null = null;
    if (token) {
      try {
        const payload: any = this.jwt.verify(token);
        userId = payload?.sub ?? null;
        username = payload?.username ?? null;
      } catch {
        // token inválido/expirado: ainda assim registramos a tentativa de logout sem identificar o usuário
      }
    }
    return this.authService.logout(userId, username, {
      ipAddress: resolveIp(req),
      userAgent: req.headers?.['user-agent'] as string | undefined,
    });
  }
}
