import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditRetentionService } from './audit-retention.service';

// Global: AuditLogService fica disponível em qualquer módulo (ex.: AuthModule, MicrosoftModule)
// sem precisar importar AuditModule em cada um deles.
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    PrismaService,
    AuditLogService,
    AuditRetentionService,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
