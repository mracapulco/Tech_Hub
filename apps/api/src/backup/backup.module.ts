import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
    SettingsModule,
    AuthModule,
  ],
  controllers: [BackupController],
  providers: [PrismaService, BackupService],
})
export class BackupModule {}
