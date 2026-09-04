import { Module } from '@nestjs/common';
import { GlpiModule } from '../integrations/glpi/glpi.module';
import { PrismaService } from '../prisma.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GlpiModule, AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, PrismaService],
})
export class InventoryModule {}
