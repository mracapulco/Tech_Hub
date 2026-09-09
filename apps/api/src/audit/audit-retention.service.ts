import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { join } from 'path';
import { PrismaService } from '../prisma.service';

const RETENTION_DAYS = 365; // 12 meses "quente" na tabela, depois arquivado
const BATCH_SIZE = 5000;
const FIRST_RUN_DELAY_MS = 60_000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Arquiva logs de auditoria mais antigos que RETENTION_DAYS em arquivos .jsonl.gz
 * (fora da tabela principal, mas preservados para consulta/compliance) e os remove
 * da tabela. Roda em segundo plano via setInterval — não usa @nestjs/schedule para
 * não introduzir uma dependência nova só para um cron diário.
 */
@Injectable()
export class AuditRetentionService implements OnModuleInit {
  private readonly archiveDir = join(process.cwd(), 'audit-archive');

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });
    setTimeout(() => this.runSafely(), FIRST_RUN_DELAY_MS);
    setInterval(() => this.runSafely(), INTERVAL_MS);
  }

  private async runSafely() {
    try {
      await this.archiveOldLogs();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Falha na rotina de arquivamento de logs de auditoria:', e);
    }
  }

  private async archiveOldLogs() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;

      const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
      const fileName = `audit-log-archive-${cutoff.toISOString().slice(0, 10)}-${Date.now()}.jsonl.gz`;
      writeFileSync(join(this.archiveDir, fileName), gzipSync(Buffer.from(jsonl, 'utf-8')));

      await this.prisma.auditLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });

      if (rows.length < BATCH_SIZE) break;
    }
  }
}
