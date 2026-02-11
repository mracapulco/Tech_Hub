import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class VlansService {
  constructor(private readonly prisma: PrismaService) {}

  list(siteId: string) {
    return this.prisma.vlan.findMany({ where: { siteId }, orderBy: { number: 'asc' } });
  }

  create(data: { siteId: string; number: number; name: string; purpose?: string }) {
    return this.prisma.vlan.create({ data });
  }

  listByCompany(companyId: string) {
    return this.prisma.vlan.findMany({ where: { site: { companyId } }, orderBy: { number: 'asc' } });
  }
}
