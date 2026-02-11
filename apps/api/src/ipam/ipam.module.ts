import { Module } from '@nestjs/common';
import { IpamService } from './ipam.service';
import { IpamController } from './ipam.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [PrismaService, IpamService],
  controllers: [IpamController],
})
export class IpamModule {}
