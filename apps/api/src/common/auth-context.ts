import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

/**
 * Lê o segredo usado para assinar/validar os JWTs da aplicação.
 * Sem fallback: se JWT_SECRET não estiver definido, a API deve falhar
 * no boot em vez de assinar/validar tokens com um valor previsível.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error(
      'JWT_SECRET não está definido. Configure a variável de ambiente JWT_SECRET antes de iniciar a API.',
    );
  }
  return secret;
}

/** Resolve o IP do requisitante, considerando proxy reverso (nginx/traefik) na frente da API. */
export function resolveIp(req: any): string | null {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req?.socket?.remoteAddress || req?.ip || null;
}

export function getBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] || null;
}

function getGlobalAdminUsernames(): string[] {
  return String(process.env.GLOBAL_ADMINS || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type RequestContext =
  | {
      ok: true;
      userId: string;
      username: string;
      /** ADMIN e TECHNICIAN são papéis exclusivos da equipe Tech Master (staff):
       *  por definição, quem tem qualquer um desses papéis enxerga todas as empresas —
       *  por isso NÃO são filtrados por companyId aqui. */
      isGlobalAdmin: boolean;
      isAdmin: boolean;
      isTechnician: boolean;
      isClient: boolean;
      isStaff: boolean;
      allowedCompanyIds: string[];
    }
  | { ok: false; error: 'Unauthorized' | 'Invalid token' };

/**
 * Ponto único de resolução de "quem é o requisitante e o que ele pode ver".
 * Usado por todos os controllers no lugar de reimplementar jwt.verify + checagem
 * de papéis a cada endpoint.
 */
export async function getRequestContext(
  jwt: JwtService,
  prisma: PrismaService,
  authorization?: string,
): Promise<RequestContext> {
  const token = getBearerToken(authorization);
  if (!token) return { ok: false, error: 'Unauthorized' };

  let payload: any;
  try {
    payload = jwt.verify(token);
  } catch {
    return { ok: false, error: 'Invalid token' };
  }

  const userId: string | null = payload?.sub ?? null;
  if (!userId) return { ok: false, error: 'Invalid token' };

  const username = String(payload?.username || '').toLowerCase();
  const isGlobalAdmin = getGlobalAdminUsernames().includes(username);

  const memberships = await prisma.userCompanyMembership.findMany({
    where: { userId },
    select: { companyId: true, role: true },
  });

  const isAdmin = isGlobalAdmin || memberships.some((m) => m.role === 'ADMIN');
  const isTechnician = memberships.some((m) => m.role === 'TECHNICIAN');
  const isClient = memberships.some((m) => m.role === 'CLIENT');
  const isStaff = isAdmin || isTechnician;
  const allowedCompanyIds = memberships.map((m) => m.companyId);

  return { ok: true, userId, username, isGlobalAdmin, isAdmin, isTechnician, isClient, isStaff, allowedCompanyIds };
}
