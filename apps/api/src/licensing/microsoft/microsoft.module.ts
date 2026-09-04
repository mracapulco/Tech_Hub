import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaService } from '../../prisma.service';
import { MicrosoftController } from './microsoft.controller';
import { MicrosoftService } from './microsoft.service';
import { MicrosoftSyncSchedulerService } from './microsoft-sync-scheduler.service';

@Module({
  imports: [AuthModule],
  controllers: [MicrosoftController],
  providers: [PrismaService, MicrosoftService, MicrosoftSyncSchedulerService],
})
export class MicrosoftModule {}
