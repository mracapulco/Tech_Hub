import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { MaturityController } from './maturity.controller';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'changeme',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MaturityController],
  providers: [PrismaService],
})
export class MaturityModule {}