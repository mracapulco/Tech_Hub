import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DevicesController } from './devices.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [PrismaService],
})
export class DevicesModule {}
