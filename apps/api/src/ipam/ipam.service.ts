import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class IpamService {
  constructor(private readonly prisma: PrismaService) {}

  listSubnets(companyId: string, siteId?: string, vlanId?: string, vrfId?: string) {
    return this.prisma.ipSubnet.findMany({
      where: { companyId, siteId: siteId || undefined, vlanId: vlanId || undefined, vrfId: vrfId || undefined },
      orderBy: { name: 'asc' },
    });
  }

  createSubnet(data: { companyId: string; name: string; cidr: string; description?: string; siteId?: string; vlanId?: string; vrfId?: string }) {
    return this.prisma.ipSubnet.create({ data });
  }

  getSubnet(id: string) {
    return this.prisma.ipSubnet.findUnique({ where: { id } });
  }

  listAddresses(subnetId: string) {
    return this.prisma.ipAddress.findMany({ where: { subnetId }, orderBy: { address: 'asc' } });
  }

  async listSubnetsWithStats(companyId: string, siteId?: string) {
    const subs = await this.prisma.ipSubnet.findMany({ where: { companyId, siteId: siteId || undefined }, orderBy: { name: 'asc' } });
    const ids = subs.map((s) => s.id);
    const counts = ids.length
      ? await this.prisma.ipAddress.groupBy({ by: ['subnetId'], where: { subnetId: { in: ids } }, _count: { _all: true } })
      : [];
    const map = new Map<string, number>();
    counts.forEach((c: any) => map.set(c.subnetId as string, (c._count?._all as number) ?? 0));
    return subs.map((s) => ({ ...s, usageCount: map.get(s.id) ?? 0 }));
  }

  private ipToInt(ip: string): number {
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) throw new Error('invalid ip');
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  private intToIp(n: number): string {
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  private parseCidr(cidr: string) {
    const [ip, maskStr] = cidr.split('/');
    const mask = Number(maskStr);
    if (!ip || !Number.isFinite(mask) || mask < 0 || mask > 32) throw new Error('invalid cidr');
    const base = this.ipToInt(ip);
    const netmask = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
    const network = base & netmask;
    const size = 2 ** (32 - mask);
    return { network, mask, netmask, size };
  }

  private capacityFromMask(mask: number): number {
    const hosts = 2 ** (32 - mask);
    return mask >= 31 ? hosts : Math.max(0, hosts - 2);
  }

  private nextSubnet(start: number, mask: number): number {
    const size = 2 ** (32 - mask);
    return (start + size) >>> 0;
  }

  async planSubnetsForSite(siteId: string, baseCidr: string, expectations?: Record<string, number>) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) return { ok: false, error: 'Site inválido' };
    const vlans = await this.prisma.vlan.findMany({ where: { siteId }, orderBy: { number: 'asc' } });
    const existing = await this.prisma.ipSubnet.findMany({ where: { siteId }, orderBy: { name: 'asc' } });
    let base;
    try { base = this.parseCidr(baseCidr); } catch { return { ok: false, error: 'CIDR base inválido' }; }
    let cursor = base.network;
    const suggestions: any[] = [];
    const needed = vlans.map((v) => {
      const exp = expectations?.[v.id] ?? 254;
      const target = Math.ceil(exp * 1.2) + 2;
      const power = Math.ceil(Math.log2(Math.max(2, target)));
      const mask = Math.max(0, Math.min(32, 32 - power));
      const cap = this.capacityFromMask(mask);
      return { vlan: v, expected: exp, mask, capacity: cap };
    }).sort((a, b) => a.mask - b.mask);
    for (const item of needed) {
      if (cursor >= (base.network + base.size)) {
        suggestions.push({ vlanId: item.vlan.id, vlanNumber: item.vlan.number, vlanName: item.vlan.name, suggestedCidr: null, capacity: item.capacity, reason: 'Sem espaço na base' });
        continue;
      }
      const cidr = `${this.intToIp(cursor)}/${item.mask}`;
      const conflict = existing.some((s) => {
        try {
          const x = this.parseCidr(s.cidr);
          const y = this.parseCidr(cidr);
          const endX = x.network + x.size - 1;
          const endY = y.network + y.size - 1;
          return !(endY < x.network || y.network > endX);
        } catch { return false; }
      });
      suggestions.push({ vlanId: item.vlan.id, vlanNumber: item.vlan.number, vlanName: item.vlan.name, suggestedCidr: cidr, capacity: item.capacity, reason: conflict ? 'Conflito com subnet existente' : 'OK', conflict });
      cursor = this.nextSubnet(cursor, item.mask);
    }
    return { ok: true, data: { base: `${this.intToIp(base.network)}/${base.mask}`, suggestions } };
  }
  upsertAddress(data: { subnetId: string; address: string; hostname?: string; status?: 'ASSIGNED' | 'RESERVED'; assignedTo?: string }) {
    return this.prisma.ipAddress.upsert({
      where: { subnetId_address: { subnetId: data.subnetId, address: data.address } },
      update: { hostname: data.hostname, status: (data.status as any) ?? 'ASSIGNED', assignedTo: data.assignedTo },
      create: { subnetId: data.subnetId, address: data.address, hostname: data.hostname, status: (data.status as any) ?? 'ASSIGNED', assignedTo: data.assignedTo },
    });
  }

  deleteAddress(subnetId: string, address: string) {
    return this.prisma.ipAddress.delete({ where: { subnetId_address: { subnetId, address } } });
  }
}
