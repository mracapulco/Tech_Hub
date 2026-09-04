import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getRequestContext } from '../common/auth-context';

type CompanyDto = {
  cnpj?: string;
  name: string;
  fantasyName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  phone?: string;
  logoUrl?: string;
};

function onlyDigits(value: string): string {
  return (value || '').replace(/\D+/g, '');
}

@Controller('companies')
export class CompaniesController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    // Lista empresas conforme permissões: ADMIN/TECHNICIAN veem todas, demais apenas seus vínculos
    const items = (ctx.isAdmin || ctx.isTechnician)
      ? await this.prisma.company.findMany({ orderBy: { name: 'asc' } })
      : await this.prisma.company.findMany({
          where: { id: { in: ctx.allowedCompanyIds } },
          orderBy: { name: 'asc' },
        });
    // Agregar contagem de usuários vinculados por empresa
    const ids = items.map((i) => i.id);
    let countsMap = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.prisma.userCompanyMembership.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids } },
        _count: { _all: true },
      });
      counts.forEach((c: any) => {
        const companyId = c.companyId as string;
        const total = c._count?._all ?? 0;
        countsMap.set(companyId, total);
      });
    }

    const withCounts = items.map((i: any) => ({
      ...i,
      membershipsCount: countsMap.get(i.id) ?? 0,
    }));

    return { ok: true, data: withCounts };
  }

  @Post()
  async create(
    @Body() body: CompanyDto,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };

    const data = {
      cnpj: body.cnpj ? onlyDigits(body.cnpj) : null,
      name: body.name?.trim(),
      fantasyName: body.fantasyName?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zipcode: body.zipcode?.trim() || null,
      phone: body.phone?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
    } as const;

    if (!data.name) {
      return { ok: false, error: 'O campo nome é obrigatório.' };
    }

    try {
      const created = await this.prisma.company.create({ data });
      return { ok: true, data: created };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return { ok: false, error: 'CNPJ já cadastrado.' };
      }
      // Log detalhado em desenvolvimento
      // eslint-disable-next-line no-console
      console.error('Erro ao criar empresa:', e);
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao criar empresa. ${detail}` };
    }
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };
    // Verifica acesso: ADMIN/TECHNICIAN ou vínculo à empresa
    const hasAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(id);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };
    return { ok: true, data: company };
  }

  @Get(':id/dependencies')
  async dependencies(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };
    // Permite ADMIN/TECHNICIAN ou usuário com vínculo à empresa
    const hasAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(id);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };
    const memberships = await this.prisma.userCompanyMembership.findMany({
      where: { companyId: id },
      select: { id: true, userId: true, role: true },
    });
    return {
      ok: true,
      data: {
        counts: {
          memberships: memberships.length,
        },
        items: {
          memberships,
        },
      },
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: CompanyDto,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const hasAccess = ctx.isAdmin || ctx.isTechnician || ctx.allowedCompanyIds.includes(id);
    if (!hasAccess) return { ok: false, error: 'Forbidden' };
    const data = {
      cnpj: body.cnpj ? onlyDigits(body.cnpj) : null,
      name: body.name?.trim(),
      fantasyName: body.fantasyName?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zipcode: body.zipcode?.trim() || null,
      phone: body.phone?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
    } as const;
    if (!data.name) return { ok: false, error: 'O campo nome é obrigatório.' };
    try {
      const updated = await this.prisma.company.update({ where: { id }, data });
      return { ok: true, data: updated };
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: false, error: 'CNPJ já cadastrado.' };
      // eslint-disable-next-line no-console
      console.error('Erro ao atualizar empresa:', e);
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao atualizar empresa. ${detail}` };
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('force') force?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };
    const memberships = await this.prisma.userCompanyMembership.findMany({ where: { companyId: id }, select: { id: true, userId: true, role: true } });
    const hasDeps = memberships.length > 0;
    const forceDelete = String(force).toLowerCase() === 'true';
    if (hasDeps && !forceDelete) {
      return {
        ok: false,
        error: 'Existem pendências vinculadas a esta empresa.',
        dependencies: {
          counts: { memberships: memberships.length },
          items: { memberships },
        },
        requiresForce: true,
      };
    }
    try {
      await this.prisma.$transaction([
        this.prisma.userCompanyMembership.deleteMany({ where: { companyId: id } }),
        this.prisma.company.delete({ where: { id } }),
      ]);
      return { ok: true };
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Erro ao excluir empresa:', e);
      const detail = e?.message || e?.meta?.cause || e?.meta?.target || '';
      return { ok: false, error: `Erro ao excluir empresa. ${detail}` };
    }
  }
  @Get('cnpj/:cnpj')
  async lookupByCnpj(
    @Param('cnpj') cnpj: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!ctx.isAdmin) return { ok: false, error: 'Forbidden' };

    const digits = onlyDigits(cnpj);
    if (!digits || digits.length !== 14) {
      return { ok: false, error: 'CNPJ inválido (esperado 14 dígitos).' };
    }

    // Try Speedio first
    try {
      const res = await fetch(
        `https://api-publica.speedio.com.br/buscarcnpj?cnpj=${digits}`,
      );
      if (res.ok) {
        const j: any = await res.json();
        // Basic sanity check
        const razao = j?.['RAZAO SOCIAL'] || j?.RAZAO_SOCIAL || j?.RAZAO || j?.NOME;
        const fantasia = j?.['NOME FANTASIA'] || j?.NOME_FANTASIA || j?.FANTASIA;
        const uf = j?.UF || j?.['UF'] || j?.ESTADO;
        const municipio = j?.MUNICIPIO || j?.['MUNICIPIO'] || j?.CIDADE;
        const logradouro = j?.LOGRADOURO || j?.['LOGRADOURO'] || '';
        const cep = j?.CEP || j?.['CEP'] || '';
        const phone = j?.TELEFONE || j?.['TELEFONE'] || '';
        if (razao) {
          return {
            ok: true,
            data: {
              cnpj: digits,
              name: String(razao),
              fantasyName: fantasia ? String(fantasia) : null,
              address: String(logradouro || '').trim() || null,
              city: municipio ? String(municipio) : null,
              state: uf ? String(uf) : null,
              zipcode: cep ? String(cep) : null,
              phone: phone ? String(phone) : null,
            },
            source: 'speedio',
          };
        }
      }
    } catch (_) {
      // ignore and fallback
    }

    // Fallback Receitaws
    try {
      const res = await fetch(
        `https://www.receitaws.com.br/v1/cnpj/${digits}`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TechHub/1.0 (+techhub.local)'
          },
        },
      );
      if (res.ok) {
        const j: any = await res.json();
        if (j?.status !== 'ERROR') {
          const nome = j?.nome || j?.razao_social || j?.razao;
          const fantasia = j?.fantasia;
          const endereco = [j?.logradouro, j?.numero]
            .filter(Boolean)
            .join(', ');
          const cidade = j?.municipio;
          const estado = j?.uf;
          const cep = j?.cep;
          const phone = j?.telefone;

          if (nome) {
            return {
              ok: true,
              data: {
                cnpj: digits,
                name: String(nome),
                fantasyName: fantasia ? String(fantasia) : null,
                address: endereco ? String(endereco) : null,
                city: cidade ? String(cidade) : null,
                state: estado ? String(estado) : null,
                zipcode: cep ? String(cep) : null,
                phone: phone ? String(phone) : null,
              },
              source: 'receitaws',
            };
          }
        }
      }
    } catch (_) {
      // ignore
    }

    return {
      ok: false,
      error: 'Não foi possível obter dados automaticamente para este CNPJ.',
    };
  }
}
