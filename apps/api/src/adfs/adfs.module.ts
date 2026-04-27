import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AdfsController } from './adfs.controller';
import { AdfsService } from './adfs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
    AuthModule,
  ],
  controllers: [AdfsController],
  providers: [PrismaService, AdfsService],
})
export class AdfsModule {}
