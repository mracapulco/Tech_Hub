import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';
import { PrismaService } from '../../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../../common/auth-context';

@Controller('licensing/microsoft')
export class MicrosoftController {
  constructor(
    private readonly service: MicrosoftService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  private canAccessCompany(ctx: { isAdmin: boolean; isTechnician: boolean; allowedCompanyIds: string[] }, companyId?: string | null) {
    if (!companyId) return ctx.isAdmin || ctx.isTechnician;
    if (ctx.isAdmin || ctx.isTechnician) return true;
    return ctx.allowedCompanyIds.includes(companyId);
  }

  @Get('agreements')
  async listAgreements(
    @Query('companyId') companyId: string | undefined,
    @Query('siteId') siteId: string | undefined,
    @Query('provider') provider: string | undefined,
    @Query('status') status: string | undefined,
    @Query('type') type: string | undefined,
    @Query('tenant') tenant: string | undefined,
    @Query('search') search: string | undefined,
    @Query('onlyExpiringDays') onlyExpiringDays: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !this.canAccessCompany(ctx, companyId)) return { ok: false, error: 'Forbidden' };
    const allowedCompanyIds = !ctx.isAdmin && !ctx.isTechnician ? ctx.allowedCompanyIds : undefined;
    const scopedCompanyId = companyId || (allowedCompanyIds && allowedCompanyIds.length === 1 ? allowedCompanyIds[0] : undefined);
    return this.service.listAgreements({
      companyId: scopedCompanyId,
      companyIds: companyId ? undefined : allowedCompanyIds,
      siteId,
      provider,
      status,
      type,
      tenant,
      search,
      onlyExpiringDays: onlyExpiringDays ? Number(onlyExpiringDays) : null,
    });
  }

  @Get('overview-context')
  async overviewContext(
    @Query('provider') provider: string | undefined,
    @Query('companyId') companyId: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !this.canAccessCompany(ctx, companyId)) return { ok: false, error: 'Forbidden' };
    const allowedCompanyIds = !ctx.isAdmin && !ctx.isTechnician ? ctx.allowedCompanyIds : undefined;
    const scopedCompanyId = companyId || (allowedCompanyIds && allowedCompanyIds.length === 1 ? allowedCompanyIds[0] : undefined);
    return this.service.getOverviewContext({
      provider,
      companyId: scopedCompanyId,
      companyIds: companyId ? undefined : allowedCompanyIds,
    });
  }

  @Get('agreements/:id')
  async getAgreement(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const found = await this.service.getAgreement(id);
    if (!found.ok) return found;
    if (!this.canAccessCompany(ctx, (found.data as any)?.companyId)) return { ok: false, error: 'Forbidden' };
    return found;
  }

  @Post('agreements')
  async createAgreement(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    if (!this.canAccessCompany(ctx, body?.companyId)) return { ok: false, error: 'Forbidden' };
    return this.service.createAgreement(body, ctx.userId);
  }

  @Put('agreements/:id')
  async updateAgreement(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.service.getAgreement(id);
    if (!current.ok) return current;
    if (!this.canAccessCompany(ctx, (current.data as any)?.companyId)) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.updateAgreement(id, body, ctx.userId);
  }

  @Delete('agreements/:id')
  async removeAgreement(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.service.getAgreement(id);
    if (!current.ok) return current;
    if (!this.canAccessCompany(ctx, (current.data as any)?.companyId)) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.removeAgreement(id);
  }

  @Post('agreements/:id/documents')
  async addDocument(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.service.getAgreement(id);
    if (!current.ok) return current;
    if (!this.canAccessCompany(ctx, (current.data as any)?.companyId)) return { ok: false, error: 'Forbidden' };
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.addAgreementDocument(id, body);
  }

  @Delete('documents/:id')
  async removeDocument(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.removeAgreementDocument(id);
  }

  @Get('agreements-upcoming')
  async listUpcoming(
    @Query('companyId') companyId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !this.canAccessCompany(ctx, companyId)) return { ok: false, error: 'Forbidden' };
    const allowedCompanyIds = !ctx.isAdmin && !ctx.isTechnician ? ctx.allowedCompanyIds : undefined;
    const scopedCompanyId = companyId || (allowedCompanyIds && allowedCompanyIds.length === 1 ? allowedCompanyIds[0] : undefined);
    return this.service.listUpcoming({
      companyId: scopedCompanyId,
      companyIds: companyId ? undefined : allowedCompanyIds,
      limit: limit ? Number(limit) : 10,
    });
  }

  @Get('renewals')
  async renewals(
    @Query('companyId') companyId: string | undefined,
    @Query('windowDays') windowDays: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !this.canAccessCompany(ctx, companyId)) return { ok: false, error: 'Forbidden' };
    const allowedCompanyIds = !ctx.isAdmin && !ctx.isTechnician ? ctx.allowedCompanyIds : undefined;
    const scopedCompanyId = companyId || (allowedCompanyIds && allowedCompanyIds.length === 1 ? allowedCompanyIds[0] : undefined);
    return this.service.listRenewals({
      companyId: scopedCompanyId,
      companyIds: companyId ? undefined : allowedCompanyIds,
      windowDays: windowDays ? Number(windowDays) : null,
    });
  }

  @Get('connections')
  async listConnections(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.listConnections();
  }

  @Post('connections/:provider')
  async saveConnection(@Param('provider') provider: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.saveConnection(provider, body);
  }

  @Post('connections/:provider/test')
  async testConnection(@Param('provider') provider: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.testConnection(provider);
  }

  @Post('connections/:provider/sync')
  async syncProvider(@Param('provider') provider: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.syncProvider(provider);
  }

  @Put('connections/:provider/schedule')
  async setSyncSchedule(
    @Param('provider') provider: string,
    @Body() body: { enabled?: boolean; intervalHours?: number },
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.setSyncSchedule(provider, { enabled: !!body?.enabled, intervalHours: body?.intervalHours });
  }

  @Get('customer-maps')
  async listCustomerMaps(
    @Query('provider') provider: string | undefined,
    @Query('companyId') companyId: string | undefined,
    @Query('matchStatus') matchStatus: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.listCustomerMaps({ provider, companyId, matchStatus });
  }

  @Post('customer-maps')
  async saveCustomerMap(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.saveCustomerMap(body);
  }

  @Post('customer-maps/:id/confirm')
  async confirmCustomerMap(@Param('id') id: string, @Body() body: { companyId: string; notes?: string }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.confirmCustomerMap(id, body.companyId, body.notes);
  }

  @Post('customer-maps/:id/ignore')
  async ignoreCustomerMap(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.ignoreCustomerMap(id);
  }

  @Post('customer-maps/:id/review')
  async reviewCustomerMap(@Param('id') id: string, @Body() body: { notes?: string }, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.markCustomerMapForReview(id, body?.notes);
  }

  @Get('sync-runs')
  async listSyncRuns(
    @Query('provider') provider: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician) return { ok: false, error: 'Forbidden' };
    return this.service.listSyncRuns(provider, page ? Number(page) : 1, pageSize ? Number(pageSize) : undefined);
  }
}
