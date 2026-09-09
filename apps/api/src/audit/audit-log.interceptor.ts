import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PrismaService } from '../prisma.service';
import { getRequestContext, resolveIp } from '../common/auth-context';
import { AuditLogService } from './audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Rotas com auditoria própria (semântica de negócio mais rica) — evita duplicar entradas.
const EXCLUDED_PREFIXES = ['/auth', '/audit-logs'];

function roleLabel(ctx: { isAdmin: boolean; isTechnician: boolean; isClient: boolean }): string {
  if (ctx.isAdmin) return 'ADMIN';
  if (ctx.isTechnician) return 'TECHNICIAN';
  if (ctx.isClient) return 'CLIENT';
  return 'UNKNOWN';
}

function isOkBody(body: unknown): boolean {
  if (body && typeof body === 'object' && 'ok' in (body as any)) return !!(body as any).ok;
  return true;
}

function errorFromBody(body: unknown): string | null {
  if (body && typeof body === 'object' && (body as any).ok === false) {
    return (body as any).error || (body as any).message || 'Falha na operação';
  }
  return null;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req: any = context.switchToHttp().getRequest();
    const method = String(req.method || '').toUpperCase();
    const path: string = req.route?.path || req.path || req.url || '';

    if (!MUTATING_METHODS.has(method) || EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody) => {
        this.record(req, method, path, responseBody, null).catch(() => {});
      }),
      catchError((err) => {
        this.record(req, method, path, null, err).catch(() => {});
        return throwError(() => err);
      }),
    );
  }

  private async record(req: any, method: string, path: string, responseBody: unknown, error: any) {
    const ctx = await getRequestContext(this.jwt, this.prisma, req.headers?.authorization).catch(() => null);
    const entityId = req.params?.id ?? null;
    const entityType = path.split('/').filter(Boolean)[0] ?? null;
    const companyId = req.body?.companyId || req.params?.companyId || req.query?.companyId || null;

    let actorName: string | null = null;
    if (ctx?.ok) {
      const user = await this.prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, lastName: true } }).catch(() => null);
      if (user) actorName = [user.name, user.lastName].filter(Boolean).join(' ');
    }

    const status = error ? 'FAILURE' : isOkBody(responseBody) ? 'SUCCESS' : 'FAILURE';
    const errorMessage = error ? String(error?.message || error) : errorFromBody(responseBody);

    await this.auditLog.log({
      actorUserId: ctx?.ok ? ctx.userId : null,
      actorUsername: ctx?.ok ? ctx.username : null,
      actorName,
      actorRole: ctx?.ok ? roleLabel(ctx) : null,
      companyId,
      action: `${method} ${entityType || path}`.trim(),
      entityType,
      entityId,
      description: `${method} ${path}`,
      changes: { body: req.body, query: req.query },
      httpMethod: method,
      route: path,
      ipAddress: resolveIp(req),
      userAgent: req.headers?.['user-agent'] || null,
      status,
      errorMessage,
      severity: 'INFO',
    });
  }
}
