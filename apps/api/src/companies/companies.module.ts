import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { PrismaService } from '../prisma.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [CompaniesController],
  providers: [PrismaService],
})
export class CompaniesModule {}
