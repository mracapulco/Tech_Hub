import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaService } from '../../prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { GlpiController } from './glpi.controller';
import { GlpiService } from './glpi.service';

@Module({
  imports: [AuthModule],
  controllers: [GlpiController],
  providers: [PrismaService, SettingsService, GlpiService],
  exports: [GlpiService],
})
export class GlpiModule {}
