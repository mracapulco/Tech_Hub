import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeviceTypesController } from './device-types.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    JwtModule.register({
      global: false,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [DeviceTypesController],
  providers: [PrismaService],
})
export class DeviceTypesModule {}
