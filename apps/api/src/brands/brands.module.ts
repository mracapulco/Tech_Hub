import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BrandsController } from './brands.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BrandsController],
  providers: [PrismaService],
})
export class BrandsModule {}
