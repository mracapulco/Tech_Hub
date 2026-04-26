import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(companyId: string) {
    const repos = await this.prisma.backupRepository.count({ where: { companyId } });
    const proxies = await this.prisma.backupProxy.count({ where: { companyId } });
    const cores = await this.prisma.backupCore.count({ where: { companyId } });
    const jobs = await this.prisma.backupJob.count({ where: { companyId } });
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const runs = await this.prisma.backupRun.count({
      where: { job: { companyId } , startAt: { gte: lastMonth } },
    });
    return { repos, proxies, cores, jobs, runs };
  }

  async listRepositories(companyId: string) {
    return this.prisma.backupRepository.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async listProxies(companyId: string) {
    return this.prisma.backupProxy.findMany({ where: { companyId }, orderBy: { hostname: 'asc' } });
  }

  async getCore(companyId: string) {
    return this.prisma.backupCore.findMany({ where: { companyId }, orderBy: { hostname: 'asc' } });
  }

  async listJobs(companyId: string) {
    return this.prisma.backupJob.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async listRuns(companyId: string, since?: Date) {
    return this.prisma.backupRun.findMany({
      where: { job: { companyId }, startAt: since ? { gte: since } : undefined },
      orderBy: { startAt: 'desc' },
      take: 200,
    });
  }

  calcRepository(input: { sourceGB: number; dailyChangePct: number; retentionDays: number; fullWeekly?: boolean; compressionRatio?: number; dedupeRatio?: number }) {
    const src = Math.max(0, input.sourceGB || 0);
    const change = Math.max(0, input.dailyChangePct || 0) / 100;
    const days = Math.max(1, input.retentionDays || 30);
    const fullWeekly = !!input.fullWeekly;
    const comp = Math.max(0.01, input.compressionRatio || 1);
    const dedupe = Math.max(0.01, input.dedupeRatio || 1);
    const daily = src * change;
    let total = src + daily * days;
    if (fullWeekly) total += src * Math.floor(days / 7);
    const eff = total / (comp * dedupe);
    const margin = Math.ceil(eff * 1.2);
    return { totalGB: Math.ceil(eff), recommendedGB: margin };
  }

  calcProxy(input: { throughputMBps: number; concurrentVMs: number; cores: number }) {
    const t = Math.max(1, input.throughputMBps || 100);
    const vms = Math.max(1, input.concurrentVMs || 4);
    const cores = Math.max(1, input.cores || 4);
    const perVm = t / vms;
    const maxConc = Math.min(vms, Math.floor(cores / 2) || 1);
    return { perVmMBps: Math.round(perVm), recommendedConcurrency: maxConc };
  }

  async createRepository(data: { companyId: string; siteId?: string; name: string; type: string; capacityGB: number; usedGB?: number; retentionPolicy?: string; compressionRatio?: number; dedupeRatio?: number; notes?: string }) {
    return this.prisma.backupRepository.create({
      data: {
        companyId: String(data.companyId),
        siteId: data.siteId ? String(data.siteId) : undefined,
        name: String(data.name),
        type: String(data.type),
        capacityGB: Number(data.capacityGB || 0),
        usedGB: Number(data.usedGB || 0),
        retentionPolicy: data.retentionPolicy || undefined,
        compressionRatio: data.compressionRatio != null ? Number(data.compressionRatio) : undefined,
        dedupeRatio: data.dedupeRatio != null ? Number(data.dedupeRatio) : undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createProxy(data: { companyId: string; siteId?: string; hostname: string; cores: number; memoryGB: number; throughputMBps?: number; concurrency?: number; transportMode?: string; notes?: string }) {
    return this.prisma.backupProxy.create({
      data: {
        companyId: String(data.companyId),
        siteId: data.siteId ? String(data.siteId) : undefined,
        hostname: String(data.hostname),
        cores: Number(data.cores || 0),
        memoryGB: Number(data.memoryGB || 0),
        throughputMBps: data.throughputMBps != null ? Number(data.throughputMBps) : undefined,
        concurrency: data.concurrency != null ? Number(data.concurrency) : undefined,
        transportMode: data.transportMode || undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createCore(data: { companyId: string; hostname: string; version?: string; license?: string; jobsCount?: number; repositoriesCount?: number; proxiesCount?: number; healthStatus?: string; notes?: string }) {
    return this.prisma.backupCore.create({
      data: {
        companyId: String(data.companyId),
        hostname: String(data.hostname),
        version: data.version || undefined,
        license: data.license || undefined,
        jobsCount: Number(data.jobsCount || 0),
        repositoriesCount: Number(data.repositoriesCount || 0),
        proxiesCount: Number(data.proxiesCount || 0),
        healthStatus: data.healthStatus || undefined,
        notes: data.notes || undefined,
      },
    });
  }

  async createJob(data: { companyId: string; name: string; type: string; schedule?: string; retentionPolicy?: string; repositoryId: string; proxyId?: string; enabled?: boolean }) {
    return this.prisma.backupJob.create({
      data: {
        companyId: String(data.companyId),
        name: String(data.name),
        type: String(data.type),
        schedule: data.schedule || undefined,
        retentionPolicy: data.retentionPolicy || undefined,
        repositoryId: String(data.repositoryId),
        proxyId: data.proxyId ? String(data.proxyId) : undefined,
        enabled: data.enabled != null ? Boolean(data.enabled) : true,
      },
    });
  }

  async createRunsBulk(jobId: string, runs: Array<{ startAt: string; endAt?: string; status: string; processedGB?: number; transferredGB?: number; avgSpeedMBps?: number; bottleneck?: string; errors?: string; restorePointsCreated?: number }>) {
    if (!Array.isArray(runs) || runs.length === 0) return { created: 0 };
    const insert = runs.map((r) => ({
      jobId: String(jobId),
      startAt: new Date(r.startAt),
      endAt: r.endAt ? new Date(r.endAt) : null,
      status: r.status as any,
      processedGB: Number(r.processedGB || 0),
      transferredGB: Number(r.transferredGB || 0),
      avgSpeedMBps: r.avgSpeedMBps != null ? Number(r.avgSpeedMBps) : null,
      bottleneck: r.bottleneck || null,
      errors: r.errors || null,
      restorePointsCreated: r.restorePointsCreated != null ? Number(r.restorePointsCreated) : null,
    }));
    const result = await this.prisma.backupRun.createMany({ data: insert });
    return { created: result.count || 0 };
  }
}
