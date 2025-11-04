import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { MaturityController } from './maturity.controller';
import { MaturityAiService } from './maturity.ai.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'changeme',
      signOptions: { expiresIn: '7d' },
    }),
    SettingsModule,
  ],
  controllers: [MaturityController],
  providers: [PrismaService, MaturityAiService],
})
export class MaturityModule {}