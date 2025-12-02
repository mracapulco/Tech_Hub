import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.site.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  create(data: { companyId: string; name: string; city?: string; state?: string }) {
    return this.prisma.site.create({ data });
  }
}
