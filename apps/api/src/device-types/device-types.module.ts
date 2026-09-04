import { Module } from '@nestjs/common';
import { DeviceTypesController } from './device-types.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DeviceTypesController],
  providers: [PrismaService],
})
export class DeviceTypesModule {}
