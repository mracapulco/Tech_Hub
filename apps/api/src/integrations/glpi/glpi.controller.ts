import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma.service';
import { GlpiService } from './glpi.service';
import { getRequestContext } from '../../common/auth-context';

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function getRequestBaseUrl(req: Request): string | null {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0]?.trim();
  const host = forwardedHost || String(req.headers.host || '').trim();
  if (!host) return null;
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

@Controller()
export class GlpiController {
  constructor(
    private readonly service: GlpiService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  private async assertCompanyAccess(companyId: string, authorization?: string, write = false) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const hasCompanyAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(companyId);
    if (!hasCompanyAccess) return { ok: false, error: 'Forbidden' } as const;
    if (write && !(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' } as const;
    return ctx;
  }

  @Get('companies/:companyId/glpi')
  async getCompanyGlpiConfig(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, false);
    if (!ctx.ok) return ctx;
    const data = await this.service.getConfigSummary(companyId, getRequestBaseUrl(req));
    return { ok: true, data };
  }

  @Post('companies/:companyId/glpi')
  async saveCompanyGlpiConfig(
    @Param('companyId') companyId: string,
    @Body()
    body: {
      baseUrl: string;
      clientId: string;
      callbackUrl?: string | null;
      clientSecret?: string | null;
      selectedEntityId?: string | null;
      selectedEntityName?: string | null;
      selectedEntityFullPath?: string | null;
      includeSubentities?: boolean;
    },
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, true);
    if (!ctx.ok) return ctx;
    return this.service.upsertConfig(
      companyId,
      {
        baseUrl: body.baseUrl,
        clientId: body.clientId,
        callbackUrl: body.callbackUrl ?? null,
        clientSecret: body.clientSecret ?? null,
        selectedEntityId: body.selectedEntityId ?? null,
        selectedEntityName: body.selectedEntityName ?? null,
        selectedEntityFullPath: body.selectedEntityFullPath ?? null,
        includeSubentities: body.includeSubentities === true,
      },
      ctx.userId,
    );
  }

  @Get('companies/:companyId/glpi/entities')
  async getCompanyGlpiEntities(@Param('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, false);
    if (!ctx.ok) return ctx;
    return this.service.listEntities(companyId);
  }

  @Post('companies/:companyId/glpi/test')
  async testCompanyGlpi(@Param('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, false);
    if (!ctx.ok) return ctx;
    return this.service.testConnection(companyId);
  }

  @Post('companies/:companyId/glpi/revoke')
  async revokeCompanyGlpi(@Param('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, true);
    if (!ctx.ok) return ctx;
    return this.service.revokeAuthorization(companyId, ctx.userId);
  }

  @Post('companies/:companyId/glpi/authorize-url')
  async getAuthorizeCompanyGlpiUrl(
    @Param('companyId') companyId: string,
    @Body() body: { returnTo?: string; callbackUrl?: string | null },
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = await this.assertCompanyAccess(companyId, authorization, true);
    if (!ctx.ok) return ctx;
    const result = await this.service.buildAuthorizationUrl({
      companyId,
      userId: ctx.userId,
      returnUrl: body?.returnTo || undefined,
      callbackUrl: body?.callbackUrl ?? null,
      requestedBaseUrl: getRequestBaseUrl(req),
    });
    if (!result.ok) return result;
    res.cookie(this.service.getPendingOauthCookieName(), result.data!.rawState, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 15 * 60 * 1000,
      path: this.service.getPendingOauthCookiePath(),
    });
    return { ok: true, data: { authorizeUrl: result.data!.authorizeUrl } };
  }

  @Get('integrations/glpi/oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (oauthError) {
      res.clearCookie(this.service.getPendingOauthCookieName(), { path: this.service.getPendingOauthCookiePath() });
      return res.status(400).send(errorDescription || oauthError);
    }

    const result = await this.service.completeAuthorization({
      code,
      state,
      cookieState: getCookieValue(req.headers.cookie, this.service.getPendingOauthCookieName()),
      requestedBaseUrl: getRequestBaseUrl(req),
    });

    res.clearCookie(this.service.getPendingOauthCookieName(), { path: this.service.getPendingOauthCookiePath() });
    if (!result.ok) return res.status(400).send(result.error);

    const redirectTo = String(result.data?.returnUrl || '/configuracoes/empresas').trim();
    const separator = redirectTo.includes('?') ? '&' : '?';
    return res.redirect(`${redirectTo}${separator}glpiOauth=success`);
  }
}
