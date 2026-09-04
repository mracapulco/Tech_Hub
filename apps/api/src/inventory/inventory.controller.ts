import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { InventoryService } from './inventory.service';
import { getRequestContext } from '../common/auth-context';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async getCtx(authorization?: string) {
    return getRequestContext(this.jwt, this.prisma, authorization);
  }

  @Get('campaigns')
  async listCampaigns(@Query('companyId') companyId: string | undefined, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (companyId && !(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.listCampaigns({
      companyId,
      isAdmin: ctx.isAdmin,
      isTechnician: ctx.isTechnician,
      allowedCompanyIds: ctx.allowedCompanyIds,
    });
  }

  @Get('campaigns/:id')
  async getCampaign(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const campaign = await this.inventory.getCampaign(id);
    if (!campaign.ok) return campaign;
    const campaignData = campaign.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(campaignData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return campaign;
  }

  @Post('campaigns')
  async createCampaign(@Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    const companyId = String(body?.companyId || '');
    const name = String(body?.name || '').trim();
    if (!companyId || !name) return { ok: false, error: 'companyId e name são obrigatórios.' };
    return this.inventory.createCampaign({
      companyId,
      name,
      objective: body?.objective != null ? String(body.objective) : null,
      scopeSummary: body?.scopeSummary != null ? String(body.scopeSummary) : null,
      collectedAt: body?.collectedAt != null ? String(body.collectedAt) : null,
      notes: body?.notes != null ? String(body.notes) : null,
      compareWithCampaignId: body?.compareWithCampaignId ? String(body.compareWithCampaignId) : null,
      sourceTypes: Array.isArray(body?.sourceTypes) ? body.sourceTypes.map((item: any) => String(item)) : [],
      siteIds: Array.isArray(body?.siteIds) ? body.siteIds.map((item: any) => String(item)) : [],
      participantUserIds: Array.isArray(body?.participantUserIds) ? body.participantUserIds.map((item: any) => String(item)) : [],
      status: body?.status ? String(body.status) : 'PLANNING',
      userId: ctx.userId,
    });
  }

  @Put('campaigns/:id')
  async updateCampaign(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.updateCampaign(id, {
      companyId: currentData.companyId,
      name: body?.name != null ? String(body.name) : currentData.name,
      objective: body?.objective != null ? String(body.objective) : undefined,
      scopeSummary: body?.scopeSummary != null ? String(body.scopeSummary) : undefined,
      collectedAt: body?.collectedAt != null ? String(body.collectedAt) : undefined,
      notes: body?.notes != null ? String(body.notes) : undefined,
      compareWithCampaignId: body?.compareWithCampaignId !== undefined ? (body.compareWithCampaignId ? String(body.compareWithCampaignId) : null) : undefined,
      sourceTypes: Array.isArray(body?.sourceTypes) ? body.sourceTypes.map((item: any) => String(item)) : undefined,
      siteIds: Array.isArray(body?.siteIds) ? body.siteIds.map((item: any) => String(item)) : undefined,
      participantUserIds: Array.isArray(body?.participantUserIds) ? body.participantUserIds.map((item: any) => String(item)) : undefined,
      status: body?.status ? String(body.status) : undefined,
      userId: ctx.userId,
    });
  }

  @Delete('campaigns/:id')
  async deleteCampaign(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.deleteCampaign(id, ctx.userId);
  }

  @Get('campaigns/:id/assets')
  async listCampaignAssets(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.listCampaignAssets(id);
  }

  @Get('campaigns/:id/software')
  async listCampaignSoftware(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.listCampaignSoftware(id);
  }

  @Get('campaigns/:id/entitlements')
  async listCampaignEntitlements(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.listCampaignEntitlements(id);
  }

  @Post('campaigns/:id/entitlements')
  async createCampaignEntitlement(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.createCampaignEntitlement(
      id,
      {
        rawVendorName: body?.rawVendorName != null ? String(body.rawVendorName) : null,
        rawProductName: String(body?.rawProductName || ''),
        edition: body?.edition != null ? String(body.edition) : null,
        version: body?.version != null ? String(body.version) : null,
        supplierName: body?.supplierName != null ? String(body.supplierName) : null,
        licenseType: body?.licenseType != null ? String(body.licenseType) : null,
        licenseChannel: body?.licenseChannel != null ? String(body.licenseChannel) : null,
        allocationMetric: body?.allocationMetric != null ? String(body.allocationMetric) : null,
        activationMethod: body?.activationMethod != null ? String(body.activationMethod) : null,
        activationAccountLabel: body?.activationAccountLabel != null ? String(body.activationAccountLabel) : null,
        tenantReference: body?.tenantReference != null ? String(body.tenantReference) : null,
        serverReference: body?.serverReference != null ? String(body.serverReference) : null,
        keyMasked: body?.keyMasked != null ? String(body.keyMasked) : null,
        quantityPurchased: body?.quantityPurchased != null && body.quantityPurchased !== '' ? Number(body.quantityPurchased) : null,
        quantityInUse: body?.quantityInUse != null && body.quantityInUse !== '' ? Number(body.quantityInUse) : null,
        purchaseDate: body?.purchaseDate != null ? String(body.purchaseDate) : null,
        startDate: body?.startDate != null ? String(body.startDate) : null,
        expiresAt: body?.expiresAt != null ? String(body.expiresAt) : null,
        proofStatus: body?.proofStatus != null ? String(body.proofStatus) : null,
        notes: body?.notes != null ? String(body.notes) : null,
        documentIds: Array.isArray(body?.documentIds) ? body.documentIds.map((item: any) => String(item)) : [],
      },
      ctx.userId,
    );
  }

  @Get('campaigns/:id/documents')
  async listCampaignDocuments(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.listCampaignDocuments(id);
  }

  @Post('campaigns/:id/documents')
  async createCampaignDocument(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.createCampaignDocument(
      id,
      {
        supplierName: body?.supplierName != null ? String(body.supplierName) : null,
        documentType: String(body?.documentType || 'INVOICE'),
        title: String(body?.title || ''),
        documentNumber: body?.documentNumber != null ? String(body.documentNumber) : null,
        fileUrl: body?.fileUrl != null ? String(body.fileUrl) : null,
        issuedAt: body?.issuedAt != null ? String(body.issuedAt) : null,
        expiresAt: body?.expiresAt != null ? String(body.expiresAt) : null,
        notes: body?.notes != null ? String(body.notes) : null,
        verificationStatus: body?.verificationStatus != null ? String(body.verificationStatus) : null,
        entitlementIds: Array.isArray(body?.entitlementIds) ? body.entitlementIds.map((item: any) => String(item)) : [],
      },
      ctx.userId,
    );
  }

  @Get('campaigns/:id/compliance-summary')
  async getCampaignComplianceSummary(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    return this.inventory.getCampaignComplianceSummary(id);
  }

  @Post('campaigns/:id/assets/manual')
  async createManualAsset(@Param('id') id: string, @Body() body: any, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.createManualAsset(
      id,
      {
        siteId: body?.siteId ? String(body.siteId) : null,
        displayName: String(body?.displayName || ''),
        hostname: body?.hostname != null ? String(body.hostname) : null,
        serialNumber: body?.serialNumber != null ? String(body.serialNumber) : null,
        assetTag: body?.assetTag != null ? String(body.assetTag) : null,
        manufacturer: body?.manufacturer != null ? String(body.manufacturer) : null,
        model: body?.model != null ? String(body.model) : null,
        operatingSystem: body?.operatingSystem != null ? String(body.operatingSystem) : null,
        operatingSystemVersion: body?.operatingSystemVersion != null ? String(body.operatingSystemVersion) : null,
        notes: body?.notes != null ? String(body.notes) : null,
        cpu: body?.cpu != null ? String(body.cpu) : null,
        memoryGB: body?.memoryGB != null && body.memoryGB !== '' ? Number(body.memoryGB) : null,
        storageSummary: body?.storageSummary != null ? String(body.storageSummary) : null,
        sourceType: 'MANUAL',
      },
      ctx.userId,
    );
  }

  @Put('campaigns/:id/assets/:assetId')
  async updateCampaignAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: any,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.updateCampaignAsset(
      id,
      assetId,
      {
        siteId: body?.siteId ? String(body.siteId) : null,
        displayName: String(body?.displayName || ''),
        hostname: body?.hostname != null ? String(body.hostname) : null,
        serialNumber: body?.serialNumber != null ? String(body.serialNumber) : null,
        assetTag: body?.assetTag != null ? String(body.assetTag) : null,
        manufacturer: body?.manufacturer != null ? String(body.manufacturer) : null,
        model: body?.model != null ? String(body.model) : null,
        operatingSystem: body?.operatingSystem != null ? String(body.operatingSystem) : null,
        operatingSystemVersion: body?.operatingSystemVersion != null ? String(body.operatingSystemVersion) : null,
        notes: body?.notes != null ? String(body.notes) : null,
        cpu: body?.cpu != null ? String(body.cpu) : null,
        memoryGB: body?.memoryGB != null && body.memoryGB !== '' ? Number(body.memoryGB) : null,
        storageSummary: body?.storageSummary != null ? String(body.storageSummary) : null,
        sourceType: body?.sourceType === 'GLPI' ? 'GLPI' : 'MANUAL',
      },
      ctx.userId,
    );
  }

  @Post('campaigns/:id/assets/:assetId/software/manual')
  async createManualSoftwareInstallation(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: any,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.createManualSoftwareInstallation(
      id,
      assetId,
      {
        rawProductName: String(body?.rawProductName || ''),
        rawVendorName: body?.rawVendorName != null ? String(body.rawVendorName) : null,
        edition: body?.edition != null ? String(body.edition) : null,
        version: body?.version != null ? String(body.version) : null,
        notes: body?.notes != null ? String(body.notes) : null,
      },
      ctx.userId,
    );
  }

  @Post('campaigns/:id/import/glpi')
  async importCampaignGlpiAssets(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const ctx = await this.getCtx(authorization);
    if (!ctx.ok) return ctx;
    const current = await this.inventory.getCampaign(id);
    if (!current.ok) return current;
    const currentData = current.data!;
    if (!(ctx.isAdmin || ctx.isTechnician) && !ctx.allowedCompanyIds.includes(currentData.companyId)) {
      return { ok: false, error: 'Forbidden' };
    }
    if (!(ctx.isAdmin || ctx.isTechnician)) return { ok: false, error: 'Forbidden' };
    return this.inventory.importGlpiAssets(id, ctx.userId);
  }
}
