import { Module } from '@nestjs/common';
import { ZabbixController } from './zabbix.controller';
import { ZabbixService } from './zabbix.service';
import { PrismaService } from '../../prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ZabbixController],
  providers: [PrismaService, SettingsService, ZabbixService],
})
export class ZabbixModule {}
