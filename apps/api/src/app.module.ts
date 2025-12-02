import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { UploadsModule } from './uploads/uploads.module';
import { MaturityModule } from './maturity/maturity.module';
import { DeviceTypesModule } from './device-types/device-types.module';
import { BrandsModule } from './brands/brands.module';
import { DevicesModule } from './devices/devices.module';
import { SettingsModule } from './settings/settings.module';
import { IpamModule } from './ipam/ipam.module';
import { SitesModule } from './sites/sites.module';
import { VlansModule } from './vlans/vlans.module';

@Module({
  imports: [
    // Servir arquivos estáticos de uploads
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    AuthModule,
    UsersModule,
    CompaniesModule,
    UploadsModule,
    MaturityModule,
    DeviceTypesModule,
    BrandsModule,
    DevicesModule,
    SettingsModule,
    IpamModule,
    SitesModule,
    VlansModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
