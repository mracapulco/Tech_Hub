import { Module } from '@nestjs/common';
import { VlansController } from './vlans.controller';
import { VlansService } from './vlans.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [VlansController],
  providers: [PrismaService, VlansService],
})
export class VlansModule {}
