import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MicrosoftService } from './microsoft.service';

/**
 * Dispara sincronizações automáticas quando o horário agendado (nextSyncAt) chega.
 * Implementado com um timer simples em vez de um cron job — não há necessidade de
 * precisão de minuto a minuto, e evita adicionar uma dependência só para isso.
 */
@Injectable()
export class MicrosoftSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MicrosoftSyncSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly running = new Set<string>();
  private readonly checkIntervalMs = 5 * 60 * 1000; // checa a cada 5 minutos

  constructor(private readonly microsoft: MicrosoftService) {}

  onModuleInit() {
    // Primeira checagem logo após subir a API (com um pequeno atraso para não competir com o boot).
    setTimeout(() => this.checkDueSyncs(), 30_000);
    this.timer = setInterval(() => this.checkDueSyncs(), this.checkIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async checkDueSyncs() {
    try {
      const due = await this.microsoft.listDueAutoSyncs();
      for (const connection of due) {
        const provider = connection.provider;
        if (this.running.has(provider)) continue;
        this.running.add(provider);
        this.microsoft
          .syncProvider(provider)
          .catch((error) => this.logger.error(`Falha na sincronização automática de ${provider}: ${error?.message || error}`))
          .finally(() => this.running.delete(provider));
      }
    } catch (error: any) {
      this.logger.error(`Falha ao verificar sincronizações automáticas pendentes: ${error?.message || error}`);
    }
  }
}
