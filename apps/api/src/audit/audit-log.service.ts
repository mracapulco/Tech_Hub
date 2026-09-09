import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const SENSITIVE_KEY_PATTERN = /password|senha|secret|token|apikey|api_key|authorization|clientsecret|client_secret/i;
const MAX_CHANGES_JSON_LENGTH = 20000;

export type AuditStatus = 'SUCCESS' | 'FAILURE';
export type AuditSeverity = 'INFO' | 'SECURITY';

export type AuditLogEntry = {
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description: string;
  changes?: unknown;
  httpMethod?: string | null;
  route?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: AuditStatus;
  errorMessage?: string | null;
  severity?: AuditSeverity;
};

export type AuditLogFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  companyId?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  status?: AuditStatus;
  severity?: AuditSeverity;
  search?: string;
};

/** Remove valores de campos sensíveis (senha, token, etc.) antes de persistir. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…[truncado]`;
  return value;
}

/** Sanitiza e limita o tamanho do JSON de "changes" gravado no log. */
function sanitizeChanges(changes: unknown): unknown {
  const redacted = redact(changes);
  const serialized = JSON.stringify(redacted);
  if (serialized && serialized.length > MAX_CHANGES_JSON_LENGTH) {
    return { truncated: true, originalSize: serialized.length };
  }
  return redacted;
}

function buildWhere(filters: AuditLogFilters) {
  const where: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.search) {
    const search = filters.search;
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { actorName: { contains: search, mode: 'insensitive' } },
      { actorUsername: { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grava um evento de auditoria. Nunca lança — uma falha aqui não pode derrubar a operação principal. */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          actorUsername: entry.actorUsername ?? null,
          actorName: entry.actorName ?? null,
          actorRole: entry.actorRole ?? null,
          companyId: entry.companyId ?? null,
          companyName: entry.companyName ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          description: entry.description,
          changes: entry.changes !== undefined ? (sanitizeChanges(entry.changes) as any) : undefined,
          httpMethod: entry.httpMethod ?? null,
          route: entry.route ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          status: entry.status ?? 'SUCCESS',
          errorMessage: entry.errorMessage ?? null,
          severity: entry.severity ?? 'INFO',
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Falha ao gravar log de auditoria:', e);
    }
  }

  async list(filters: AuditLogFilters & { cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const where = buildWhere(filters);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { ok: true, data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async meta() {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, take: 200, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, take: 200, orderBy: { entityType: 'asc' } }),
    ]);
    return {
      ok: true,
      data: {
        actions: actions.map((a) => a.action),
        entityTypes: entityTypes.map((e) => e.entityType).filter(Boolean),
      },
    };
  }

  /** Gera as linhas para exportação em CSV em lotes, sem carregar tudo em memória. */
  async *exportRows(filters: AuditLogFilters, maxRows: number) {
    const where = buildWhere(filters);
    const BATCH = 1000;
    let cursor: string | undefined;
    let emitted = 0;
    while (emitted < maxRows) {
      const rows = await this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.min(BATCH, maxRows - emitted),
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const row of rows) yield row;
      emitted += rows.length;
      cursor = rows[rows.length - 1].id;
      if (rows.length < BATCH) break;
    }
  }
}
