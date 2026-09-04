import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MaturityController } from './maturity.controller';
import { MaturityAiService } from './maturity.ai.service';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SettingsModule, AuthModule],
  controllers: [MaturityController],
  providers: [PrismaService, MaturityAiService],
})
export class MaturityModule {}
