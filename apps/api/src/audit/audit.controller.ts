import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { getRequestContext, resolveIp } from '../common/auth-context';
import { AuditLogFilters, AuditLogService, AuditSeverity, AuditStatus } from './audit-log.service';

const EXPORT_MAX_ROWS = 50_000;
const EXPORT_MAX_RANGE_DAYS = 366;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function parseFilters(query: Record<string, any>): AuditLogFilters {
  return {
    dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
    dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    companyId: query.companyId || undefined,
    actorUserId: query.actorUserId || undefined,
    action: query.action || undefined,
    entityType: query.entityType || undefined,
    status: (query.status as AuditStatus) || undefined,
    severity: (query.severity as AuditSeverity) || undefined,
    search: query.search || undefined,
  };
}

@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get()
  async list(@Query() query: Record<string, any>, @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };

    const filters = parseFilters(query);
    const result = await this.auditLog.list({ ...filters, cursor: query.cursor || undefined, limit: query.limit ? Number(query.limit) : undefined });

    if (!query.cursor) {
      this.auditLog
        .log({
          actorUserId: ctx.userId,
          actorUsername: ctx.username,
          actorRole: 'ADMIN',
          action: 'AUDIT_LOG_VIEWED',
          entityType: 'AuditLog',
          description: 'Visualizou o log de auditoria',
          httpMethod: 'GET',
          route: '/audit-logs',
          ipAddress: resolveIp(req),
          userAgent: req.headers?.['user-agent'] || null,
          status: 'SUCCESS',
          severity: 'SECURITY',
        })
        .catch(() => {});
    }
    return result;
  }

  @Get('meta')
  async meta(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    return this.auditLog.meta();
  }

  @Get('export')
  async export(@Query() query: Record<string, any>, @Headers('authorization') authorization: string | undefined, @Req() req: Request, @Res() res: Response) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) {
      res.status(401).json({ ok: false, error: ctx.error });
      return;
    }
    if (!ctx.isAdmin) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const filters = parseFilters(query);
    if (!filters.dateFrom || !filters.dateTo) {
      res.status(400).json({ ok: false, error: 'Informe o período (dateFrom e dateTo) para exportar.' });
      return;
    }
    const rangeDays = (filters.dateTo.getTime() - filters.dateFrom.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays < 0 || rangeDays > EXPORT_MAX_RANGE_DAYS) {
      res.status(400).json({ ok: false, error: `O período máximo para exportação é de ${EXPORT_MAX_RANGE_DAYS} dias.` });
      return;
    }

    const columns = [
      'createdAt', 'action', 'status', 'severity', 'actorUsername', 'actorName', 'actorRole',
      'companyName', 'entityType', 'entityId', 'description', 'ipAddress', 'errorMessage',
    ] as const;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.csv"`);
    res.write(`${columns.join(',')}\n`);

    let rowCount = 0;
    for await (const row of this.auditLog.exportRows(filters, EXPORT_MAX_ROWS)) {
      res.write(`${columns.map((c) => csvEscape((row as any)[c])).join(',')}\n`);
      rowCount += 1;
    }
    res.end();

    this.auditLog
      .log({
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: 'ADMIN',
        action: 'AUDIT_LOG_EXPORTED',
        entityType: 'AuditLog',
        description: `Exportou ${rowCount} registro(s) do log de auditoria (${query.dateFrom} a ${query.dateTo})`,
        changes: { filters: query },
        httpMethod: 'GET',
        route: '/audit-logs/export',
        ipAddress: resolveIp(req),
        userAgent: req.headers?.['user-agent'] || null,
        status: 'SUCCESS',
        severity: 'SECURITY',
      })
      .catch(() => {});
  }
}
