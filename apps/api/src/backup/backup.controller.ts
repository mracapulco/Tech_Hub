import { Body, Controller, Get, Header, Headers, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly svc: BackupService) {}

  private getTokenFromHeader(auth?: string): string | null {
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    return null;
  }

  private async getContext(authorization?: string) {
    const token = this.getTokenFromHeader(authorization);
    if (!token) return { ok: false, error: 'Unauthorized' } as const;
    try {
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      const userId: string | null = payload?.sub ?? null;
      if (!userId) return { ok: false, error: 'Invalid token' } as const;
      const memberships = await this.prisma.userCompanyMembership.findMany({ where: { userId }, select: { companyId: true, role: true } });
      const isAdmin = memberships.some((m: any) => m.role === 'ADMIN');
      const isTechnician = memberships.some((m: any) => m.role === 'TECHNICIAN');
      const allowedCompanyIds = memberships.map((m: any) => m.companyId);
      return { ok: true, userId, isAdmin, isTechnician, allowedCompanyIds } as const;
    } catch {
      return { ok: false, error: 'Invalid token' } as const;
    }
  }

  @Get('overview')
  async overview(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.overview(companyId);
    return { ok: true, data };
  }

  @Get('repositories')
  async repositories(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.listRepositories(companyId);
    return { ok: true, data };
  }

  @Get('proxies')
  async proxies(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.listProxies(companyId);
    return { ok: true, data };
  }

  @Get('core')
  async core(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.getCore(companyId);
    return { ok: true, data };
  }

  @Get('jobs')
  async jobs(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const data = await this.svc.listJobs(companyId);
    return { ok: true, data };
  }

  @Get('runs')
  async runs(@Query('companyId') companyId: string, @Query('since') since?: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const dt = since ? new Date(since) : undefined;
    const data = await this.svc.listRuns(companyId, dt);
    return { ok: true, data };
  }

  @Get('veeam/hosts')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async veeamHosts(@Query('companyId') companyId: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    return this.svc.listVeeamHosts(companyId);
  }

  @Get('veeam/collection/config')
  @Header('Cache-Control', 'no-store')
  async veeamCollectionConfig(@Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.svc.getVeeamCollectionConfig();
  }

  @Post('veeam/collection/config')
  @Header('Cache-Control', 'no-store')
  async saveVeeamCollectionConfig(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.svc.updateVeeamCollectionConfig({
      enabled: body?.enabled != null ? Boolean(body.enabled) : undefined,
      intervalHours: body?.intervalHours != null ? Number(body.intervalHours) : undefined,
      retentionDays: body?.retentionDays != null ? Number(body.retentionDays) : undefined,
      allowManualRun: body?.allowManualRun != null ? Boolean(body.allowManualRun) : undefined,
    });
  }

  @Get('veeam/collection/history')
  @Header('Cache-Control', 'no-store')
  async veeamCollectionHistory(
    @Query('companyId') companyId: string | undefined,
    @Query('hostId') hostId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.svc.listVeeamCollectionHistory({
      companyIds: ctx.isAdmin || ctx.isTechnician ? undefined : ctx.allowedCompanyIds,
      companyId,
      hostId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('veeam/collection/run')
  @Header('Cache-Control', 'no-store')
  async runVeeamCollection(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = body?.companyId ? String(body.companyId) : undefined;
    const hostId = body?.hostId ? String(body.hostId) : undefined;
    if (hostId && !companyId) return { ok: false, error: 'companyId é obrigatório quando hostId for informado.' };
    return this.svc.runVeeamCollection({
      triggerType: 'manual',
      companyId,
      hostId,
    });
  }

  @Get('veeam/repositories')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async veeamRepositories(
    @Query('companyId') companyId: string,
    @Query('hostId') hostId: string,
    @Query('itemId') itemId: string | undefined,
    @Query('date') date: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    if (!companyId || (!hostId && !itemId)) return { ok: false, error: 'companyId e hostId/itemId são obrigatórios' };
    try {
      return await this.svc.getVeeamRepositories({ companyId, hostId, itemId, date });
    } catch (error: any) {
      // #region debug-point D:veeam-repositories-controller-error
      (()=>{const fs=require('fs');let u='http://127.0.0.1:7777/event',s='veeam-repositories-prod';try{const e=fs.readFileSync('.dbg/veeam-repositories-prod.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'backup.controller.ts:veeamRepositories:catch',msg:'[DEBUG] Controller observed repositories exception',data:{companyId,hostId,itemId:itemId||null,date:date||null,name:error?.name||null,message:error?.message||String(error||''),code:error?.code||null,meta:error?.meta||null},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      throw error;
    }
  }

  @Get('veeam/repositories/:repositoryId/jobs')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async veeamRepositoryJobs(
    @Param('repositoryId') repositoryId: string,
    @Query('companyId') companyId: string,
    @Query('hostId') hostId: string,
    @Query('itemId') itemId: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    if (!companyId || !hostId || !repositoryId) return { ok: false, error: 'companyId, hostId e repositoryId são obrigatórios' };
    return this.svc.getVeeamRepositoryJobs({ companyId, hostId, itemId, repositoryId });
  }

  @Get('veeam/timeline')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async veeamTimeline(
    @Query('companyId') companyId: string,
    @Query('hostId') hostId: string,
    @Query('itemId') itemId: string | undefined,
    @Query('date') date: string,
    @Query('bucketMinutes') bucketMinutes?: string,
    @Query('timezone') timezone?: string,
    @Query('type') type?: string,
    @Query('result') result?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    if (!companyId || (!hostId && !itemId) || !date) return { ok: false, error: 'companyId, hostId/itemId e date são obrigatórios' };
    const safeBucketMinutes = [15, 30, 60].includes(Number(bucketMinutes)) ? Number(bucketMinutes) : 30;
    const safeType = ['all', 'Backup', 'Replica'].includes(String(type || 'all')) ? String(type || 'all') : 'all';
    const safeResult = ['all', 'Success', 'Failed', 'Warning', 'Running', 'Unknown'].includes(String(result || 'all')) ? String(result || 'all') : 'all';
    return this.svc.getVeeamTimeline({
      companyId,
      hostId,
      itemId,
      date,
      bucketMinutes: safeBucketMinutes,
      timezone: timezone || 'America/Sao_Paulo',
      typeFilter: safeType as any,
      resultFilter: safeResult as any,
    });
  }

  @Post('veeam/repositories/override')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async saveVeeamRepositoryOverride(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(String(body?.companyId || '')))) {
      return { ok: false, error: 'Forbidden' };
    }
    const companyId = String(body?.companyId || '');
    const hostId = String(body?.hostId || '');
    const repositoryId = String(body?.repositoryId || '');
    const repositoryName = String(body?.repositoryName || '');
    if (!companyId || !hostId || (!repositoryId && !repositoryName)) {
      return { ok: false, error: 'companyId, hostId e repositoryId/repositoryName são obrigatórios' };
    }
    return this.svc.saveVeeamRepositoryOverride({
      companyId,
      hostId,
      repositoryId,
      repositoryName,
      repositoryType: body?.repositoryType ? String(body.repositoryType) : undefined,
      capacityGB: body?.capacityGB != null ? Number(body.capacityGB) : null,
      usedSpaceGB: body?.usedSpaceGB != null ? Number(body.usedSpaceGB) : null,
      freeGB: body?.freeGB != null ? Number(body.freeGB) : null,
      notes: body?.notes ? String(body.notes) : null,
      useManualForPlanning: Boolean(body?.useManualForPlanning),
      updatedBy: ctx.userId,
    });
  }

  @Post('veeam/repositories/job-override')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async saveVeeamRepositoryJobOverride(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(String(body?.companyId || '')))) {
      return { ok: false, error: 'Forbidden' };
    }
    const companyId = String(body?.companyId || '');
    const hostId = String(body?.hostId || '');
    const repositoryId = String(body?.repositoryId || '');
    const jobId = body?.jobId != null ? String(body.jobId) : undefined;
    const jobName = String(body?.jobName || '');
    if (!companyId || !hostId || !repositoryId || (!jobId && !jobName)) {
      return { ok: false, error: 'companyId, hostId, repositoryId e jobId/jobName são obrigatórios' };
    }
    return this.svc.saveVeeamRepositoryJobOverride({
      companyId,
      hostId,
      repositoryId,
      jobId,
      jobName,
      protectedSizeGB: body?.protectedSizeGB != null ? Number(body.protectedSizeGB) : null,
      fullBackupSizeGB: body?.fullBackupSizeGB != null ? Number(body.fullBackupSizeGB) : null,
      fullWeeklyExecutionMinutes: body?.fullWeeklyExecutionMinutes != null ? Number(body.fullWeeklyExecutionMinutes) : null,
      dailyChangePercent: body?.dailyChangePercent != null ? Number(body.dailyChangePercent) : null,
      currentRetentionDays: body?.currentRetentionDays != null ? Number(body.currentRetentionDays) : null,
      retentionDays: body?.retentionDays != null ? Number(body.retentionDays) : null,
      dailyFrequency: body?.dailyFrequency != null ? Number(body.dailyFrequency) : null,
      backupMode: body?.backupMode ? String(body.backupMode) : null,
      safetyMarginPercent: body?.safetyMarginPercent != null ? Number(body.safetyMarginPercent) : null,
      notes: body?.notes ? String(body.notes) : null,
      useManualForPlanning: Boolean(body?.useManualForPlanning),
      updatedBy: ctx.userId,
    });
  }

  @Post('veeam/repositories/simulate')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async simulateVeeamRepository(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.svc.simulateVeeamRepository({
      repositoryId: body?.repositoryId ? String(body.repositoryId) : undefined,
      repositoryName: body?.repositoryName ? String(body.repositoryName) : undefined,
      jobId: body?.jobId ? String(body.jobId) : undefined,
      jobName: body?.jobName ? String(body.jobName) : undefined,
      capacityGB: body?.capacityGB != null ? Number(body.capacityGB) : null,
      usedSpaceGB: body?.usedSpaceGB != null ? Number(body.usedSpaceGB) : null,
      freeGB: body?.freeGB != null ? Number(body.freeGB) : null,
      protectedSizeGB: body?.protectedSizeGB != null ? Number(body.protectedSizeGB) : null,
      fullBackupSizeGB: body?.fullBackupSizeGB != null ? Number(body.fullBackupSizeGB) : null,
      dailyChangePercent: body?.dailyChangePercent != null ? Number(body.dailyChangePercent) : null,
      currentRetentionDays: body?.currentRetentionDays != null ? Number(body.currentRetentionDays) : null,
      retentionDays: body?.retentionDays != null ? Number(body.retentionDays) : null,
      baseDailyFrequency: body?.baseDailyFrequency != null ? Number(body.baseDailyFrequency) : null,
      dailyFrequency: body?.dailyFrequency != null ? Number(body.dailyFrequency) : null,
      backupMode: body?.backupMode ? String(body.backupMode) : null,
      safetyMarginPercent: body?.safetyMarginPercent != null ? Number(body.safetyMarginPercent) : null,
    });
  }

  @Post('calc/repository')
  async calcRepo(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const input = {
      sourceGB: Number(body?.sourceGB || 0),
      dailyChangePct: Number(body?.dailyChangePct || 0),
      retentionDays: Number(body?.retentionDays || 30),
      fullWeekly: !!body?.fullWeekly,
      compressionRatio: body?.compressionRatio ? Number(body?.compressionRatio) : undefined,
      dedupeRatio: body?.dedupeRatio ? Number(body?.dedupeRatio) : undefined,
    };
    const data = this.svc.calcRepository(input);
    return { ok: true, data };
  }

  @Post('calc/proxy')
  async calcProxy(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const input = {
      throughputMBps: Number(body?.throughputMBps || 0),
      concurrentVMs: Number(body?.concurrentVMs || 0),
      cores: Number(body?.cores || 0),
    };
    const data = this.svc.calcProxy(input);
    return { ok: true, data };
  }

  @Post('repositories')
  async createRepository(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    if (!companyId) return { ok: false, error: 'companyId obrigatório' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const created = await this.svc.createRepository({
      companyId,
      siteId: body?.siteId,
      name: String(body?.name || ''),
      type: String(body?.type || 'SOBR'),
      capacityGB: Number(body?.capacityGB || 0),
      usedGB: Number(body?.usedGB || 0),
      retentionPolicy: body?.retentionPolicy,
      compressionRatio: body?.compressionRatio != null ? Number(body?.compressionRatio) : undefined,
      dedupeRatio: body?.dedupeRatio != null ? Number(body?.dedupeRatio) : undefined,
      notes: body?.notes,
    });
    return { ok: true, data: { id: created.id } };
  }

  @Post('proxies')
  async createProxy(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    if (!companyId) return { ok: false, error: 'companyId obrigatório' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const created = await this.svc.createProxy({
      companyId,
      siteId: body?.siteId,
      hostname: String(body?.hostname || ''),
      cores: Number(body?.cores || 0),
      memoryGB: Number(body?.memoryGB || 0),
      throughputMBps: body?.throughputMBps != null ? Number(body?.throughputMBps) : undefined,
      concurrency: body?.concurrency != null ? Number(body?.concurrency) : undefined,
      transportMode: body?.transportMode,
      notes: body?.notes,
    });
    return { ok: true, data: { id: created.id } };
  }

  @Post('core')
  async createCore(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    if (!companyId) return { ok: false, error: 'companyId obrigatório' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const created = await this.svc.createCore({
      companyId,
      hostname: String(body?.hostname || ''),
      version: body?.version,
      license: body?.license,
      jobsCount: body?.jobsCount != null ? Number(body?.jobsCount) : undefined,
      repositoriesCount: body?.repositoriesCount != null ? Number(body?.repositoriesCount) : undefined,
      proxiesCount: body?.proxiesCount != null ? Number(body?.proxiesCount) : undefined,
      healthStatus: body?.healthStatus,
      notes: body?.notes,
    });
    return { ok: true, data: { id: created.id } };
  }

  @Post('jobs')
  async createJob(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    if (!companyId) return { ok: false, error: 'companyId obrigatório' };
    if (!ctx.isAdmin && !ctx.isTechnician && !ctx.allowedCompanyIds.includes(companyId)) return { ok: false, error: 'Forbidden' };
    const created = await this.svc.createJob({
      companyId,
      name: String(body?.name || ''),
      type: String(body?.type || 'vm'),
      schedule: body?.schedule,
      retentionPolicy: body?.retentionPolicy,
      repositoryId: String(body?.repositoryId || ''),
      proxyId: body?.proxyId ? String(body?.proxyId) : undefined,
      enabled: body?.enabled != null ? Boolean(body?.enabled) : true,
    });
    return { ok: true, data: { id: created.id } };
  }

  @Post('runs/bulk/:jobId')
  async createRunsBulk(@Param('jobId') jobId: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getContext(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const runs = Array.isArray(body?.runs) ? body.runs : [];
    const result = await this.svc.createRunsBulk(String(jobId), runs);
    return { ok: true, data: result };
  }
}
