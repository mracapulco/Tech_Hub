import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class FirewallService {
  constructor(private readonly prisma: PrismaService) {}

  listByCompany(companyId: string) {
    return this.prisma.firewallLicense.findMany({ where: { companyId }, orderBy: { expiresAt: 'asc' } });
  }

  listBySite(siteId: string) {
    return this.prisma.firewallLicense.findMany({ where: { siteId }, orderBy: { expiresAt: 'asc' } });
  }

  get(id: string) {
    return this.prisma.firewallLicense.findUnique({ where: { id } });
  }

  async create(data: { companyId: string; siteId?: string; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string; expiresAt: string; notes?: string; ipAddressId?: string }) {
    const payload: any = { ...data, expiresAt: new Date(data.expiresAt) };
    if (payload.ipAddressId) {
      const ip = await this.prisma.ipAddress.findUnique({ where: { id: payload.ipAddressId }, include: { subnet: true } });
      if (!ip) throw new Error('IP não encontrado');
      if ((ip as any).subnet.companyId !== payload.companyId) throw new Error('IP pertence a outra empresa');
      const ipSiteId = (ip as any).subnet.siteId || null;
      if (payload.siteId && payload.siteId !== ipSiteId) throw new Error('IP pertence a outro site');
      if (!payload.siteId && ipSiteId) payload.siteId = ipSiteId;
    }
    return this.prisma.firewallLicense.create({ data: payload });
  }

  async update(id: string, data: Partial<{ vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string; expiresAt: string; notes?: string; siteId?: string; ipAddressId?: string | null }>) {
    const current = await this.prisma.firewallLicense.findUnique({ where: { id } });
    if (!current) throw new Error('Registro não encontrado');
    const payload: any = { ...data };
    if (payload.expiresAt) payload.expiresAt = new Date(payload.expiresAt);
    if (payload.hasOwnProperty('ipAddressId')) {
      if (payload.ipAddressId) {
        const ip = await this.prisma.ipAddress.findUnique({ where: { id: payload.ipAddressId }, include: { subnet: true } });
        if (!ip) throw new Error('IP não encontrado');
        if ((ip as any).subnet.companyId !== (current as any).companyId) throw new Error('IP pertence a outra empresa');
        const ipSiteId = (ip as any).subnet.siteId || null;
        const targetSiteId = payload.siteId !== undefined ? (payload.siteId || null) : ((current as any).siteId || null);
        if (targetSiteId && targetSiteId !== ipSiteId) throw new Error('IP pertence a outro site');
        if (!targetSiteId && ipSiteId) payload.siteId = ipSiteId;
      } else {
        payload.ipAddressId = null;
      }
    }
    return this.prisma.firewallLicense.update({ where: { id }, data: payload });
  }

  remove(id: string) {
    return this.prisma.firewallLicense.delete({ where: { id } });
  }
}
