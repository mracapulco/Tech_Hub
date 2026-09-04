import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';
import { ZabbixModule } from '../integrations/zabbix/zabbix.module';

@Module({
  imports: [SettingsModule, AuthModule, ZabbixModule],
  controllers: [BackupController],
  providers: [PrismaService, BackupService],
})
export class BackupModule {}
