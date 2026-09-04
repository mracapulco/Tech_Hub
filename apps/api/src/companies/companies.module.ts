import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CompaniesController],
  providers: [PrismaService],
})
export class CompaniesModule {}
