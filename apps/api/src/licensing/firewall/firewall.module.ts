import { Module } from '@nestjs/common';
import { FirewallController } from './firewall.controller';
import { FirewallService } from './firewall.service';
import { PrismaService } from '../../prisma.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FirewallController],
  providers: [PrismaService, FirewallService],
})
export class FirewallModule {}
