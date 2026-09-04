import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [PrismaService, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
