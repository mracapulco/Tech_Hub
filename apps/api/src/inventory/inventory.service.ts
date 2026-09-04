import { Injectable } from '@nestjs/common';
import { GlpiService } from '../integrations/glpi/glpi.service';
import { PrismaService } from '../prisma.service';

type ListCampaignsInput = {
  companyId?: string;
  isAdmin: boolean;
  isTechnician: boolean;
  allowedCompanyIds: string[];
};

type SaveCampaignInput = {
  companyId: string;
  name: string;
  objective?: string | null;
  scopeSummary?: string | null;
  collectedAt?: string | null;
  notes?: string | null;
  compareWithCampaignId?: string | null;
  sourceTypes?: string[];
  siteIds?: string[];
  participantUserIds?: string[];
  userId?: string | null;
  status?: string | null;
};

type SaveAssetInput = {
  siteId?: string | null;
  displayName: string;
  hostname?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  operatingSystemVersion?: string | null;
  sourceExternalId?: string | null;
  notes?: string | null;
  cpu?: string | null;
  memoryGB?: number | null;
  storageSummary?: string | null;
  sourceType?: 'GLPI' | 'MANUAL';
};

type SaveSoftwareInstallationInput = {
  rawProductName: string;
  rawVendorName?: string | null;
  edition?: string | null;
  version?: string | null;
  notes?: string | null;
};

type SaveEntitlementInput = {
  rawVendorName?: string | null;
  rawProductName: string;
  edition?: string | null;
  version?: string | null;
  supplierName?: string | null;
  licenseType?: string | null;
  licenseChannel?: string | null;
  allocationMetric?: string | null;
  activationMethod?: string | null;
  activationAccountLabel?: string | null;
  tenantReference?: string | null;
  serverReference?: string | null;
  keyMasked?: string | null;
  quantityPurchased?: number | null;
  quantityInUse?: number | null;
  purchaseDate?: string | null;
  startDate?: string | null;
  expiresAt?: string | null;
  proofStatus?: string | null;
  notes?: string | null;
  documentIds?: string[];
};

type SaveEvidenceDocumentInput = {
  supplierName?: string | null;
  documentType: string;
  title: string;
  documentNumber?: string | null;
  fileUrl?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  verificationStatus?: string | null;
  entitlementIds?: string[];
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly glpi: GlpiService,
  ) {}

  private normalizeUniqueIds(values?: string[]) {
    return Array.from(new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean)));
  }

  private getSourceTypesFromJson(value: any) {
    return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  }

  private normalizeText(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private toDateOrNull(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private preferExisting(current?: string | null, incoming?: string | null) {
    return this.normalizeText(current) || this.normalizeText(incoming);
  }

  private preferIncoming(current?: string | null, incoming?: string | null) {
    return this.normalizeText(incoming) || this.normalizeText(current);
  }

  private normalizeSoftwareKey(vendor?: string | null, product?: string | null, edition?: string | null) {
    return [vendor, product, edition]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .join('::');
  }

  private sumNumbers(values: Array<number | null | undefined>) {
    return values.reduce<number>((total, item) => total + (typeof item === 'number' && !Number.isNaN(item) ? item : 0), 0);
  }

  private serializeCampaign(item: any) {
    return {
      id: item.id,
      companyId: item.companyId,
      companyName: item.company?.fantasyName || item.company?.name || 'Empresa',
      name: item.name,
      objective: item.objective || null,
      scopeSummary: item.scopeSummary || null,
      status: item.status,
      openedAt: item.openedAt,
      collectedAt: item.collectedAt,
      closedAt: item.closedAt,
      notes: item.notes || null,
      reviewResult: item.reviewResult || null,
      sourceTypes: Array.isArray(item.sourcesUsed) ? item.sourcesUsed : [],
      compareWithCampaignId: item.compareWithCampaignId || null,
      compareWithCampaignName: item.compareWithCampaign?.name || null,
      createdById: item.createdById || null,
      updatedById: item.updatedById || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      sites: (item.sites || []).map((entry: any) => ({
        id: entry.site.id,
        name: entry.site.name,
        city: entry.site.city || null,
        state: entry.site.state || null,
      })),
      participants: (item.participants || []).map((entry: any) => ({
        userId: entry.userId,
        name: entry.user?.name || 'Usuário',
        email: entry.user?.email || null,
        roleLabel: entry.roleLabel || null,
      })),
      counts: {
        assetSnapshots: item._count?.assetSnapshots ?? 0,
        documents: item._count?.documents ?? 0,
        licenseEntitlements: item._count?.licenseEntitlements ?? 0,
        issues: item._count?.issues ?? 0,
        importBatches: item._count?.importBatches ?? 0,
      },
    };
  }

  private serializeAssetSnapshot(item: any) {
    return {
      id: item.id,
      assetIdentityId: item.assetIdentityId,
      displayName: item.displayName,
      hostname: item.hostname || null,
      serialNumber: item.serialNumber || null,
      assetTag: item.assetTag || null,
      manufacturer: item.manufacturer || null,
      model: item.model || null,
      operatingSystem: item.operatingSystem || null,
      operatingSystemVersion: item.operatingSystemVersion || null,
      sourceType: item.sourceType || null,
      sourceExternalId: item.sourceExternalId || null,
      verificationStatus: item.verificationStatus,
      notes: item.notes || null,
      collectedAt: item.collectedAt || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      site: item.site
        ? {
            id: item.site.id,
            name: item.site.name,
          }
        : null,
      assignedUser: item.assignedUser
        ? {
            id: item.assignedUser.id,
            displayName: item.assignedUser.displayName,
            email: item.assignedUser.email || null,
          }
        : null,
      hardware: item.hardware
        ? {
            cpu: item.hardware.cpu || null,
            memoryGB: item.hardware.memoryGB ?? null,
            storageSummary: item.hardware.storageSummary || null,
          }
        : null,
      softwareInstallations: (item.softwareInstallations || []).map((entry: any) => ({
        id: entry.id,
        rawVendorName: entry.rawVendorName || null,
        rawProductName: entry.rawProductName,
        edition: entry.edition || null,
        version: entry.version || null,
        sourceType: entry.sourceType || null,
        verificationStatus: entry.verificationStatus,
        notes: entry.notes || null,
      })),
      counts: {
        softwareInstallations: item._count?.softwareInstallations ?? 0,
      },
    };
  }

  private serializeEntitlement(item: any) {
    return {
      id: item.id,
      rawProductName: item.rawProductName,
      rawVendorName: item.product?.vendor?.name || null,
      productName: item.product?.name || null,
      edition: item.edition || null,
      version: item.version || null,
      licenseType: item.licenseType || null,
      licenseChannel: item.licenseChannel || null,
      allocationMetric: item.allocationMetric || null,
      activationMethod: item.activationMethod || null,
      activationAccountLabel: item.activationAccountLabel || null,
      tenantReference: item.tenantReference || null,
      serverReference: item.serverReference || null,
      keyMasked: item.keyMasked || null,
      quantityPurchased: item.quantityPurchased ?? null,
      quantityInUse: item.quantityInUse ?? null,
      purchaseDate: item.purchaseDate || null,
      startDate: item.startDate || null,
      expiresAt: item.expiresAt || null,
      proofStatus: item.proofStatus,
      notes: item.notes || null,
      sourceType: item.sourceType || null,
      supplier: item.supplier
        ? {
            id: item.supplier.id,
            name: item.supplier.name,
          }
        : null,
      documents: (item.entitlementDocuments || []).map((entry: any) => ({
        id: entry.document.id,
        title: entry.document.title,
        documentType: entry.document.documentType,
        documentNumber: entry.document.documentNumber || null,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeEvidenceDocument(item: any) {
    return {
      id: item.id,
      title: item.title,
      documentType: item.documentType,
      verificationStatus: item.verificationStatus,
      documentNumber: item.documentNumber || null,
      fileUrl: item.fileUrl || null,
      issuedAt: item.issuedAt || null,
      expiresAt: item.expiresAt || null,
      notes: item.notes || null,
      sourceType: item.sourceType || null,
      supplier: item.supplier
        ? {
            id: item.supplier.id,
            name: item.supplier.name,
          }
        : null,
      entitlements: (item.entitlementDocuments || []).map((entry: any) => ({
        id: entry.entitlement.id,
        rawProductName: entry.entitlement.rawProductName,
        edition: entry.entitlement.edition || null,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private async getCampaignOrError(id: string) {
    const campaign = await this.prisma.inventoryCampaign.findUnique({
      where: { id },
      include: {
        sites: true,
      },
    });
    if (!campaign) return { ok: false, error: 'Campanha não encontrada.' } as const;
    return { ok: true, data: campaign } as const;
  }

  private async validateSiteForCompany(companyId: string, siteId?: string | null) {
    if (!siteId) return { ok: true, data: null } as const;
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId },
      select: { id: true, name: true },
    });
    if (!site) return { ok: false, error: 'A unidade informada não pertence à empresa da campanha.' } as const;
    return { ok: true, data: site } as const;
  }

  private async getAssetSnapshotOrError(campaignId: string, assetId: string) {
    const asset = await this.prisma.inventoryAssetSnapshot.findFirst({
      where: { id: assetId, campaignId },
      include: { hardware: true },
    });
    if (!asset) return { ok: false, error: 'Ativo não encontrado nesta campanha.' } as const;
    return { ok: true, data: asset } as const;
  }

  private async resolveAssetIdentity(tx: any, companyId: string, input: SaveAssetInput, preferIncoming = false) {
    const sourceExternalId = this.normalizeText(input.sourceExternalId);
    const serialNumber = this.normalizeText(input.serialNumber);
    const assetTag = this.normalizeText(input.assetTag);
    const hostname = this.normalizeText(input.hostname);
    const displayName = this.normalizeText(input.displayName) || 'Ativo sem nome';

    let current = null as any;
    if (sourceExternalId) {
      current = await tx.inventoryAssetIdentity.findFirst({
        where: { companyId, externalSourceId: sourceExternalId },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!current && serialNumber) {
      current = await tx.inventoryAssetIdentity.findFirst({
        where: { companyId, serialNumber },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!current && assetTag) {
      current = await tx.inventoryAssetIdentity.findFirst({
        where: { companyId, assetTag },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!current && hostname) {
      current = await tx.inventoryAssetIdentity.findFirst({
        where: { companyId, hostname },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!current) {
      const created = await tx.inventoryAssetIdentity.create({
        data: {
          companyId,
          displayName,
          hostname,
          serialNumber,
          assetTag,
          manufacturer: this.normalizeText(input.manufacturer),
          model: this.normalizeText(input.model),
          externalSourceId: sourceExternalId,
          lastSeenSource: (input.sourceType || 'MANUAL') as any,
        },
      });
      return { identity: created, created: true };
    }

    const updated = await tx.inventoryAssetIdentity.update({
      where: { id: current.id },
      data: {
        displayName: preferIncoming ? this.preferIncoming(current.displayName, input.displayName) : this.preferExisting(current.displayName, input.displayName),
        hostname: preferIncoming ? this.preferIncoming(current.hostname, input.hostname) : this.preferExisting(current.hostname, input.hostname),
        serialNumber: preferIncoming
          ? this.preferIncoming(current.serialNumber, input.serialNumber)
          : this.preferExisting(current.serialNumber, input.serialNumber),
        assetTag: preferIncoming ? this.preferIncoming(current.assetTag, input.assetTag) : this.preferExisting(current.assetTag, input.assetTag),
        manufacturer: preferIncoming
          ? this.preferIncoming(current.manufacturer, input.manufacturer)
          : this.preferExisting(current.manufacturer, input.manufacturer),
        model: preferIncoming ? this.preferIncoming(current.model, input.model) : this.preferExisting(current.model, input.model),
        externalSourceId: current.externalSourceId || sourceExternalId,
        lastSeenSource: (input.sourceType || current.lastSeenSource || 'MANUAL') as any,
      },
    });
    return { identity: updated, created: false };
  }

  private async upsertAssetSnapshot(
    tx: any,
    campaign: any,
    assetIdentityId: string,
    input: SaveAssetInput,
    preferIncoming = false,
  ) {
    const current = await tx.inventoryAssetSnapshot.findUnique({
      where: {
        campaignId_assetIdentityId: {
          campaignId: campaign.id,
          assetIdentityId,
        },
      },
      include: { hardware: true },
    });

    const baseData = {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      assetIdentityId,
      siteId: input.siteId !== undefined ? input.siteId || null : current?.siteId || null,
      sourceType: (input.sourceType || current?.sourceType || 'MANUAL') as any,
      displayName: preferIncoming
        ? this.preferIncoming(current?.displayName, input.displayName)
        : this.preferExisting(current?.displayName, input.displayName) || 'Ativo sem nome',
      hostname: preferIncoming ? this.preferIncoming(current?.hostname, input.hostname) : this.preferExisting(current?.hostname, input.hostname),
      serialNumber: preferIncoming
        ? this.preferIncoming(current?.serialNumber, input.serialNumber)
        : this.preferExisting(current?.serialNumber, input.serialNumber),
      assetTag: preferIncoming ? this.preferIncoming(current?.assetTag, input.assetTag) : this.preferExisting(current?.assetTag, input.assetTag),
      manufacturer: preferIncoming
        ? this.preferIncoming(current?.manufacturer, input.manufacturer)
        : this.preferExisting(current?.manufacturer, input.manufacturer),
      model: preferIncoming ? this.preferIncoming(current?.model, input.model) : this.preferExisting(current?.model, input.model),
      operatingSystem: preferIncoming
        ? this.preferIncoming(current?.operatingSystem, input.operatingSystem)
        : this.preferExisting(current?.operatingSystem, input.operatingSystem),
      operatingSystemVersion: preferIncoming
        ? this.preferIncoming(current?.operatingSystemVersion, input.operatingSystemVersion)
        : this.preferExisting(current?.operatingSystemVersion, input.operatingSystemVersion),
      sourceExternalId: current?.sourceExternalId || this.normalizeText(input.sourceExternalId),
      notes: preferIncoming ? this.preferIncoming(current?.notes, input.notes) : this.preferExisting(current?.notes, input.notes),
      collectedAt: current?.collectedAt || new Date(),
    };

    const snapshot = current
      ? await tx.inventoryAssetSnapshot.update({
          where: { id: current.id },
          data: baseData,
        })
      : await tx.inventoryAssetSnapshot.create({
          data: baseData,
        });

    const cpu = preferIncoming ? this.preferIncoming(current?.hardware?.cpu, input.cpu) : this.preferExisting(current?.hardware?.cpu, input.cpu);
    const storageSummary = preferIncoming
      ? this.preferIncoming(current?.hardware?.storageSummary, input.storageSummary)
      : this.preferExisting(current?.hardware?.storageSummary, input.storageSummary);
    const memoryGB =
      input.memoryGB != null
        ? input.memoryGB
        : current?.hardware?.memoryGB != null
        ? Number(current.hardware.memoryGB)
        : null;

    if (cpu || storageSummary || memoryGB != null) {
      if (current?.hardware) {
        await tx.inventoryHardwareSnapshot.update({
          where: { assetSnapshotId: snapshot.id },
          data: {
            cpu,
            storageSummary,
            memoryGB,
          },
        });
      } else {
        await tx.inventoryHardwareSnapshot.create({
          data: {
            assetSnapshotId: snapshot.id,
            cpu,
            storageSummary,
            memoryGB,
          },
        });
      }
    }

    return { snapshotId: snapshot.id, created: !current };
  }

  async listCampaigns(input: ListCampaignsInput) {
    const where: any = {};
    if (input.companyId) where.companyId = input.companyId;
    if (!(input.isAdmin || input.isTechnician)) {
      where.companyId = input.companyId
        ? input.companyId
        : { in: input.allowedCompanyIds };
    }

    const items = await this.prisma.inventoryCampaign.findMany({
      where,
      include: {
        company: true,
        compareWithCampaign: true,
        sites: { include: { site: true }, orderBy: { site: { name: 'asc' } } },
        participants: { include: { user: true }, orderBy: { user: { name: 'asc' } } },
        _count: {
          select: {
            assetSnapshots: true,
            documents: true,
            licenseEntitlements: true,
            issues: true,
            importBatches: true,
          },
        },
      },
      orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return { ok: true, data: items.map((item) => this.serializeCampaign(item)) };
  }

  async getCampaign(id: string) {
    const item = await this.prisma.inventoryCampaign.findUnique({
      where: { id },
      include: {
        company: true,
        compareWithCampaign: true,
        sites: { include: { site: true }, orderBy: { site: { name: 'asc' } } },
        participants: { include: { user: true }, orderBy: { user: { name: 'asc' } } },
        importBatches: { orderBy: { importedAt: 'desc' } },
        _count: {
          select: {
            assetSnapshots: true,
            documents: true,
            licenseEntitlements: true,
            issues: true,
            importBatches: true,
          },
        },
      },
    });
    if (!item) return { ok: false, error: 'Campanha não encontrada.' };
    return {
      ok: true,
      data: {
        ...this.serializeCampaign(item),
        importBatches: (item.importBatches || []).map((batch: any) => ({
          id: batch.id,
          sourceType: batch.sourceType,
          fileName: batch.fileName || null,
          importedAt: batch.importedAt,
          summary: batch.summary || null,
        })),
      },
    };
  }

  async createCampaign(input: SaveCampaignInput) {
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) return { ok: false, error: 'Empresa não encontrada.' };

    const siteIds = this.normalizeUniqueIds(input.siteIds);
    const participantUserIds = this.normalizeUniqueIds(input.participantUserIds);

    if (siteIds.length > 0) {
      const sites = await this.prisma.site.findMany({
        where: { id: { in: siteIds }, companyId: input.companyId },
        select: { id: true },
      });
      if (sites.length !== siteIds.length) return { ok: false, error: 'Uma ou mais unidades selecionadas não pertencem à empresa.' };
    }

    if (participantUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: participantUserIds } },
        select: { id: true },
      });
      if (users.length !== participantUserIds.length) return { ok: false, error: 'Um ou mais participantes não foram encontrados.' };
    }

    if (input.compareWithCampaignId) {
      const previous = await this.prisma.inventoryCampaign.findUnique({
        where: { id: input.compareWithCampaignId },
        select: { id: true, companyId: true },
      });
      if (!previous || previous.companyId !== input.companyId) {
        return { ok: false, error: 'A campanha de comparação precisa pertencer à mesma empresa.' };
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.inventoryCampaign.create({
        data: {
          companyId: input.companyId,
          name: input.name.trim(),
          objective: input.objective?.trim() || null,
          scopeSummary: input.scopeSummary?.trim() || null,
          collectedAt: this.toDateOrNull(input.collectedAt),
          notes: input.notes?.trim() || null,
          compareWithCampaignId: input.compareWithCampaignId || null,
          createdById: input.userId || null,
          updatedById: input.userId || null,
          sourcesUsed: this.normalizeUniqueIds(input.sourceTypes),
          status: (input.status || 'PLANNING') as any,
        },
      });

      if (siteIds.length > 0) {
        await tx.inventoryCampaignSite.createMany({
          data: siteIds.map((siteId) => ({ campaignId: campaign.id, siteId })),
        });
      }

      if (participantUserIds.length > 0) {
        await tx.inventoryCampaignParticipant.createMany({
          data: participantUserIds.map((userId) => ({ campaignId: campaign.id, userId })),
        });
      }

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: input.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryCampaign',
          entityId: campaign.id,
          action: 'CREATE',
          afterData: {
            name: campaign.name,
            status: campaign.status,
            sourceTypes: this.normalizeUniqueIds(input.sourceTypes),
            siteIds,
            participantUserIds,
          },
          performedById: input.userId || null,
        },
      });

      return campaign.id;
    });

    return this.getCampaign(created);
  }

  async updateCampaign(id: string, input: SaveCampaignInput) {
    const current = await this.prisma.inventoryCampaign.findUnique({
      where: { id },
      include: {
        sites: true,
        participants: true,
      },
    });
    if (!current) return { ok: false, error: 'Campanha não encontrada.' };

    const siteIds = input.siteIds ? this.normalizeUniqueIds(input.siteIds) : null;
    const participantUserIds = input.participantUserIds ? this.normalizeUniqueIds(input.participantUserIds) : null;

    if (siteIds) {
      const sites = await this.prisma.site.findMany({
        where: { id: { in: siteIds }, companyId: current.companyId },
        select: { id: true },
      });
      if (sites.length !== siteIds.length) return { ok: false, error: 'Uma ou mais unidades selecionadas não pertencem à empresa.' };
    }

    if (participantUserIds) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: participantUserIds } },
        select: { id: true },
      });
      if (users.length !== participantUserIds.length) return { ok: false, error: 'Um ou mais participantes não foram encontrados.' };
    }

    const nextStatus = input.status ? String(input.status) : current.status;
    const closedAt = nextStatus === 'COMPLETED'
      ? this.toDateOrNull(input.collectedAt) || current.closedAt || new Date()
      : nextStatus === 'CANCELLED'
      ? current.closedAt || new Date()
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryCampaign.update({
        where: { id },
        data: {
          name: input.name?.trim() || current.name,
          objective: input.objective !== undefined ? input.objective?.trim() || null : current.objective,
          scopeSummary: input.scopeSummary !== undefined ? input.scopeSummary?.trim() || null : current.scopeSummary,
          collectedAt: input.collectedAt !== undefined ? this.toDateOrNull(input.collectedAt) : current.collectedAt,
          notes: input.notes !== undefined ? input.notes?.trim() || null : current.notes,
          compareWithCampaignId: input.compareWithCampaignId !== undefined ? input.compareWithCampaignId || null : current.compareWithCampaignId,
          updatedById: input.userId || null,
          sourcesUsed: input.sourceTypes ? this.normalizeUniqueIds(input.sourceTypes) : current.sourcesUsed ?? undefined,
          status: nextStatus as any,
          closedAt,
        },
      });

      if (siteIds) {
        await tx.inventoryCampaignSite.deleteMany({ where: { campaignId: id } });
        if (siteIds.length > 0) {
          await tx.inventoryCampaignSite.createMany({
            data: siteIds.map((siteId) => ({ campaignId: id, siteId })),
          });
        }
      }

      if (participantUserIds) {
        await tx.inventoryCampaignParticipant.deleteMany({ where: { campaignId: id } });
        if (participantUserIds.length > 0) {
          await tx.inventoryCampaignParticipant.createMany({
            data: participantUserIds.map((userId) => ({ campaignId: id, userId })),
          });
        }
      }

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: current.companyId,
          campaignId: id,
          entityType: 'InventoryCampaign',
          entityId: id,
          action: 'UPDATE',
          beforeData: {
            name: current.name,
            status: current.status,
            siteIds: current.sites.map((item) => item.siteId),
            participantUserIds: current.participants.map((item) => item.userId),
          },
          afterData: {
            name: input.name?.trim() || current.name,
            status: nextStatus,
            siteIds: siteIds ?? current.sites.map((item) => item.siteId),
            participantUserIds: participantUserIds ?? current.participants.map((item) => item.userId),
          },
          performedById: input.userId || null,
        },
      });
    });

    return this.getCampaign(id);
  }

  async deleteCampaign(id: string, userId?: string | null) {
    const current = await this.prisma.inventoryCampaign.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assetSnapshots: true,
            documents: true,
            licenseEntitlements: true,
            issues: true,
            importBatches: true,
          },
        },
      },
    });
    if (!current) return { ok: false, error: 'Campanha não encontrada.' };

    await this.prisma.$transaction(async (tx) => {
      const assetSnapshots = await tx.inventoryAssetSnapshot.findMany({
        where: { campaignId: id },
        select: { id: true },
      });
      const assetSnapshotIds = assetSnapshots.map((item) => item.id);

      const softwareInstallations = assetSnapshotIds.length
        ? await tx.inventorySoftwareInstallation.findMany({
            where: { assetSnapshotId: { in: assetSnapshotIds } },
            select: { id: true },
          })
        : [];
      const softwareInstallationIds = softwareInstallations.map((item) => item.id);

      const entitlements = await tx.inventoryLicenseEntitlement.findMany({
        where: { campaignId: id },
        select: { id: true },
      });
      const entitlementIds = entitlements.map((item) => item.id);

      const documents = await tx.inventoryEvidenceDocument.findMany({
        where: { campaignId: id },
        select: { id: true },
      });
      const documentIds = documents.map((item) => item.id);

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: current.companyId,
          campaignId: id,
          entityType: 'InventoryCampaign',
          entityId: id,
          action: 'DELETE',
          beforeData: {
            name: current.name,
            status: current.status,
            counts: current._count,
          },
          performedById: userId || null,
        },
      });

      if (softwareInstallationIds.length > 0) {
        await tx.inventoryReconciliationResult.deleteMany({
          where: { softwareInstallationId: { in: softwareInstallationIds } },
        });
      }

      if (assetSnapshotIds.length > 0) {
        await tx.inventoryReconciliationResult.deleteMany({
          where: { assetSnapshotId: { in: assetSnapshotIds } },
        });
        await tx.inventoryIssue.deleteMany({
          where: { assetSnapshotId: { in: assetSnapshotIds } },
        });
      }

      if (entitlementIds.length > 0) {
        await tx.inventoryReconciliationResult.deleteMany({
          where: { entitlementId: { in: entitlementIds } },
        });
        await tx.inventoryLicenseAllocation.deleteMany({
          where: { entitlementId: { in: entitlementIds } },
        });
        await tx.inventoryEntitlementDocument.deleteMany({
          where: { entitlementId: { in: entitlementIds } },
        });
      }

      if (documentIds.length > 0) {
        await tx.inventoryEntitlementDocument.deleteMany({
          where: { documentId: { in: documentIds } },
        });
      }

      await tx.inventoryAiSuggestion.deleteMany({ where: { campaignId: id } });
      await tx.inventoryIssue.deleteMany({ where: { campaignId: id } });
      if (assetSnapshotIds.length > 0) {
        await tx.inventoryLicenseAllocation.deleteMany({
          where: { assetSnapshotId: { in: assetSnapshotIds } },
        });
      }

      if (assetSnapshotIds.length > 0) {
        await tx.inventorySoftwareInstallation.deleteMany({
          where: { assetSnapshotId: { in: assetSnapshotIds } },
        });
        await tx.inventoryHardwareSnapshot.deleteMany({
          where: { assetSnapshotId: { in: assetSnapshotIds } },
        });
      }

      await tx.inventoryImportBatch.deleteMany({ where: { campaignId: id } });
      await tx.inventoryCampaignParticipant.deleteMany({ where: { campaignId: id } });
      await tx.inventoryCampaignSite.deleteMany({ where: { campaignId: id } });
      await tx.inventoryEvidenceDocument.deleteMany({ where: { campaignId: id } });
      await tx.inventoryLicenseEntitlement.deleteMany({ where: { campaignId: id } });
      await tx.inventoryAssetSnapshot.deleteMany({ where: { campaignId: id } });
      await tx.inventoryAuditEvent.deleteMany({ where: { campaignId: id } });
      await tx.inventoryCampaign.delete({ where: { id } });
    });

    return { ok: true };
  }

  async listCampaignAssets(campaignId: string) {
    const campaign = await this.getCampaignOrError(campaignId);
    if (!campaign.ok) return campaign;

    const items = await this.prisma.inventoryAssetSnapshot.findMany({
      where: { campaignId },
      include: {
        site: true,
        assignedUser: true,
        hardware: true,
        softwareInstallations: {
          orderBy: [{ rawProductName: 'asc' }, { createdAt: 'asc' }],
        },
        _count: {
          select: {
            softwareInstallations: true,
          },
        },
      },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
    });

    return { ok: true, data: items.map((item) => this.serializeAssetSnapshot(item)) };
  }

  async listCampaignSoftware(campaignId: string) {
    const campaign = await this.getCampaignOrError(campaignId);
    if (!campaign.ok) return campaign;

    const installations = await this.prisma.inventorySoftwareInstallation.findMany({
      where: { assetSnapshot: { campaignId } },
      include: {
        product: {
          include: {
            vendor: true,
          },
        },
        assetSnapshot: {
          select: {
            id: true,
            displayName: true,
            hostname: true,
            sourceType: true,
          },
        },
      },
      orderBy: [{ rawProductName: 'asc' }, { createdAt: 'asc' }],
    });

    const grouped = new Map<string, any>();
    for (const item of installations) {
      const vendorName = item.product?.vendor?.name || item.rawVendorName || null;
      const productName = item.product?.name || item.rawProductName;
      const key = this.normalizeSoftwareKey(vendorName, productName, item.edition);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          vendorName,
          productName,
          edition: item.edition || null,
          versions: new Set<string>(),
          assetIds: new Set<string>(),
          assets: [] as any[],
          sourceTypes: new Set<string>(),
          items: [] as any[],
        });
      }
      const group = grouped.get(key);
      if (item.version) group.versions.add(item.version);
      if (item.assetSnapshotId) group.assetIds.add(item.assetSnapshotId);
      if (item.sourceType) group.sourceTypes.add(item.sourceType);
      group.assets.push({
        assetId: item.assetSnapshot.id,
        displayName: item.assetSnapshot.displayName,
        hostname: item.assetSnapshot.hostname || null,
      });
      group.items.push({
        id: item.id,
        version: item.version || null,
        notes: item.notes || null,
        sourceType: item.sourceType || null,
        verificationStatus: item.verificationStatus,
      });
    }

    return {
      ok: true,
      data: Array.from(grouped.values())
        .map((group) => ({
          key: group.key,
          vendorName: group.vendorName,
          productName: group.productName,
          edition: group.edition,
          versions: Array.from(group.versions.values()).sort(),
          sourceTypes: Array.from(group.sourceTypes.values()).sort(),
          installationCount: group.items.length,
          assetCount: group.assetIds.size,
          assets: group.assets.sort((a: any, b: any) => a.displayName.localeCompare(b.displayName)),
          items: group.items,
        }))
        .sort((a, b) => `${a.vendorName || ''} ${a.productName}`.localeCompare(`${b.vendorName || ''} ${b.productName}`)),
    };
  }

  async listCampaignEntitlements(campaignId: string) {
    const campaign = await this.getCampaignOrError(campaignId);
    if (!campaign.ok) return campaign;

    const items = await this.prisma.inventoryLicenseEntitlement.findMany({
      where: { campaignId },
      include: {
        product: {
          include: {
            vendor: true,
          },
        },
        supplier: true,
        entitlementDocuments: {
          include: {
            document: true,
          },
        },
      },
      orderBy: [{ rawProductName: 'asc' }, { createdAt: 'asc' }],
    });

    return { ok: true, data: items.map((item) => this.serializeEntitlement(item)) };
  }

  async createCampaignEntitlement(campaignId: string, input: SaveEntitlementInput, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const rawProductName = this.normalizeText(input.rawProductName);
    if (!rawProductName) return { ok: false, error: 'Informe o produto/licença.' };

    const documentIds = this.normalizeUniqueIds(input.documentIds);
    if (documentIds.length > 0) {
      const docs = await this.prisma.inventoryEvidenceDocument.findMany({
        where: { id: { in: documentIds }, campaignId },
        select: { id: true },
      });
      if (docs.length !== documentIds.length) return { ok: false, error: 'Um ou mais documentos não pertencem a esta campanha.' };
    }

    const rawVendorName = this.normalizeText(input.rawVendorName);
    const supplierName = this.normalizeText(input.supplierName);

    const entitlementId = await this.prisma.$transaction(async (tx) => {
      let vendorId: string | null = null;
      if (rawVendorName) {
        const vendor = await tx.softwareVendor.upsert({
          where: { name: rawVendorName },
          update: {},
          create: { name: rawVendorName },
        });
        vendorId = vendor.id;
      }

      const product =
        (await tx.softwareProduct.findFirst({
          where: { vendorId, name: rawProductName },
          select: { id: true },
        })) ||
        (await tx.softwareProduct.create({
          data: { vendorId, name: rawProductName },
          select: { id: true },
        }));

      let supplierId: string | null = null;
      if (supplierName) {
        const supplier = await tx.inventorySupplier.upsert({
          where: {
            companyId_name: {
              companyId: campaign.companyId,
              name: supplierName,
            },
          },
          update: {},
          create: {
            companyId: campaign.companyId,
            name: supplierName,
          },
        });
        supplierId = supplier.id;
      }

      const entitlement = await tx.inventoryLicenseEntitlement.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          productId: product.id,
          supplierId,
          rawProductName,
          edition: this.normalizeText(input.edition),
          version: this.normalizeText(input.version),
          licenseType: this.normalizeText(input.licenseType),
          licenseChannel: this.normalizeText(input.licenseChannel),
          allocationMetric: this.normalizeText(input.allocationMetric),
          activationMethod: this.normalizeText(input.activationMethod),
          activationAccountLabel: this.normalizeText(input.activationAccountLabel),
          tenantReference: this.normalizeText(input.tenantReference),
          serverReference: this.normalizeText(input.serverReference),
          keyMasked: this.normalizeText(input.keyMasked),
          quantityPurchased: input.quantityPurchased != null ? Number(input.quantityPurchased) : null,
          quantityInUse: input.quantityInUse != null ? Number(input.quantityInUse) : null,
          purchaseDate: this.toDateOrNull(input.purchaseDate),
          startDate: this.toDateOrNull(input.startDate),
          expiresAt: this.toDateOrNull(input.expiresAt),
          proofStatus: (input.proofStatus || 'UNVERIFIED') as any,
          notes: this.normalizeText(input.notes),
          sourceType: 'MANUAL',
          createdById: userId || null,
        },
      });

      if (documentIds.length > 0) {
        await tx.inventoryEntitlementDocument.createMany({
          data: documentIds.map((documentId) => ({
            entitlementId: entitlement.id,
            documentId,
          })),
        });
      }

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryLicenseEntitlement',
          entityId: entitlement.id,
          action: 'CREATE',
          afterData: {
            rawVendorName,
            rawProductName,
            edition: this.normalizeText(input.edition),
            version: this.normalizeText(input.version),
            quantityPurchased: input.quantityPurchased ?? null,
            proofStatus: input.proofStatus || 'UNVERIFIED',
            linkedDocuments: documentIds,
          },
          performedById: userId || null,
        },
      });

      return entitlement.id;
    });

    return { ok: true, data: { id: entitlementId } };
  }

  async listCampaignDocuments(campaignId: string) {
    const campaign = await this.getCampaignOrError(campaignId);
    if (!campaign.ok) return campaign;

    const items = await this.prisma.inventoryEvidenceDocument.findMany({
      where: { campaignId },
      include: {
        supplier: true,
        entitlementDocuments: {
          include: {
            entitlement: true,
          },
        },
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return { ok: true, data: items.map((item) => this.serializeEvidenceDocument(item)) };
  }

  async createCampaignDocument(campaignId: string, input: SaveEvidenceDocumentInput, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const title = this.normalizeText(input.title);
    if (!title) return { ok: false, error: 'Informe o título do documento.' };

    const entitlementIds = this.normalizeUniqueIds(input.entitlementIds);
    if (entitlementIds.length > 0) {
      const entitlements = await this.prisma.inventoryLicenseEntitlement.findMany({
        where: { id: { in: entitlementIds }, campaignId },
        select: { id: true },
      });
      if (entitlements.length !== entitlementIds.length) return { ok: false, error: 'Uma ou mais licenças não pertencem a esta campanha.' };
    }

    const supplierName = this.normalizeText(input.supplierName);

    const documentId = await this.prisma.$transaction(async (tx) => {
      let supplierId: string | null = null;
      if (supplierName) {
        const supplier = await tx.inventorySupplier.upsert({
          where: {
            companyId_name: {
              companyId: campaign.companyId,
              name: supplierName,
            },
          },
          update: {},
          create: {
            companyId: campaign.companyId,
            name: supplierName,
          },
        });
        supplierId = supplier.id;
      }

      const document = await tx.inventoryEvidenceDocument.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          supplierId,
          documentType: (input.documentType || 'INVOICE') as any,
          verificationStatus: (input.verificationStatus || 'NOT_REVIEWED') as any,
          title,
          documentNumber: this.normalizeText(input.documentNumber),
          fileUrl: this.normalizeText(input.fileUrl),
          issuedAt: this.toDateOrNull(input.issuedAt),
          expiresAt: this.toDateOrNull(input.expiresAt),
          notes: this.normalizeText(input.notes),
          sourceType: 'MANUAL',
          createdById: userId || null,
        },
      });

      if (entitlementIds.length > 0) {
        await tx.inventoryEntitlementDocument.createMany({
          data: entitlementIds.map((entitlementId) => ({
            entitlementId,
            documentId: document.id,
          })),
        });
      }

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryEvidenceDocument',
          entityId: document.id,
          action: 'CREATE',
          afterData: {
            title,
            documentType: input.documentType || 'INVOICE',
            documentNumber: this.normalizeText(input.documentNumber),
            linkedEntitlements: entitlementIds,
          },
          performedById: userId || null,
        },
      });

      return document.id;
    });

    return { ok: true, data: { id: documentId } };
  }

  async getCampaignComplianceSummary(campaignId: string) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const [softwareRes, entitlementsRes, documentsRes] = await Promise.all([
      this.listCampaignSoftware(campaignId),
      this.listCampaignEntitlements(campaignId),
      this.listCampaignDocuments(campaignId),
    ]);
    if (!softwareRes.ok) return softwareRes;
    if (!entitlementsRes.ok) return entitlementsRes;
    if (!documentsRes.ok) return documentsRes;

    const software = softwareRes.data as any[];
    const entitlements = entitlementsRes.data as any[];
    const documents = documentsRes.data as any[];

    const entitlementMap = new Map<string, any[]>();
    for (const entitlement of entitlements) {
      const key = this.normalizeSoftwareKey(entitlement.rawVendorName, entitlement.productName || entitlement.rawProductName, entitlement.edition);
      if (!entitlementMap.has(key)) entitlementMap.set(key, []);
      entitlementMap.get(key)!.push(entitlement);
    }

    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const findings = software.map((item) => {
      const key = this.normalizeSoftwareKey(item.vendorName, item.productName, item.edition);
      const matches = entitlementMap.get(key) || [];
      const purchased: number = this.sumNumbers(matches.map((entry) => entry.quantityPurchased));
      const withDocuments = matches.filter((entry) => (entry.documents || []).length > 0);
      const expired = matches.some((entry) => entry.expiresAt && new Date(entry.expiresAt) < now);
      const expiringSoon = matches.some((entry) => entry.expiresAt && new Date(entry.expiresAt) >= now && new Date(entry.expiresAt) <= in30Days);

      let status = 'PENDING_ANALYSIS';
      let summary = 'Aguardando revisão de licenças e documentos.';
      if (matches.length === 0 || purchased <= 0) {
        status = 'LICENSE_NOT_FOUND';
        summary = 'Instalação sem licença localizada.';
      } else if (withDocuments.length === 0) {
        status = 'DOCUMENT_NOT_FOUND';
        summary = 'Licença localizada, mas sem documento comprobatório vinculado.';
      } else if (expired) {
        status = 'EXPIRED';
        summary = 'Licença expirada para este software.';
      } else if (item.installationCount > purchased) {
        status = 'POSSIBLE_OVERUSE';
        summary = 'Quantidade encontrada maior que a quantidade comprada.';
      } else if (expiringSoon) {
        status = 'NEAR_EXPIRY';
        summary = 'Licença próxima do vencimento.';
      } else {
        status = 'REGULAR';
        summary = 'Uso coberto por licença e documento vinculado.';
      }

      return {
        key,
        vendorName: item.vendorName,
        productName: item.productName,
        edition: item.edition,
        installationCount: item.installationCount,
        assetCount: item.assetCount,
        quantityPurchased: purchased,
        matchedEntitlements: matches.length,
        matchedDocuments: withDocuments.length,
        status,
        summary,
      };
    });

    const statusCounts = findings.reduce((acc: Record<string, number>, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      ok: true,
      data: {
        overview: {
          softwareGroups: software.length,
          softwareInstallations: this.sumNumbers(software.map((item) => item.installationCount)),
          entitlements: entitlements.length,
          documents: documents.length,
          regular: statusCounts.REGULAR || 0,
          pendingAnalysis: statusCounts.PENDING_ANALYSIS || 0,
          missingLicense: statusCounts.LICENSE_NOT_FOUND || 0,
          missingDocument: statusCounts.DOCUMENT_NOT_FOUND || 0,
          possibleOveruse: statusCounts.POSSIBLE_OVERUSE || 0,
          expired: statusCounts.EXPIRED || 0,
          nearExpiry: statusCounts.NEAR_EXPIRY || 0,
        },
        findings: findings.sort((a, b) => `${a.vendorName || ''} ${a.productName}`.localeCompare(`${b.vendorName || ''} ${b.productName}`)),
      },
    };
  }

  async updateCampaignAsset(campaignId: string, assetId: string, input: SaveAssetInput, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const assetLookup = await this.getAssetSnapshotOrError(campaignId, assetId);
    if (!assetLookup.ok) return assetLookup;
    const current = assetLookup.data!;

    if (!this.normalizeText(input.displayName)) {
      return { ok: false, error: 'O nome do ativo é obrigatório.' };
    }

    const siteValidation = await this.validateSiteForCompany(campaign.companyId, input.siteId);
    if (!siteValidation.ok) return siteValidation;

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryAssetSnapshot.update({
        where: { id: current.id },
        data: {
          siteId: input.siteId !== undefined ? input.siteId || null : current.siteId || null,
          displayName: this.normalizeText(input.displayName) || current.displayName,
          hostname: this.normalizeText(input.hostname),
          serialNumber: this.normalizeText(input.serialNumber),
          assetTag: this.normalizeText(input.assetTag),
          manufacturer: this.normalizeText(input.manufacturer),
          model: this.normalizeText(input.model),
          operatingSystem: this.normalizeText(input.operatingSystem),
          operatingSystemVersion: this.normalizeText(input.operatingSystemVersion),
          notes: this.normalizeText(input.notes),
          sourceType: (input.sourceType || current.sourceType || 'MANUAL') as any,
        },
      });

      const hardwareData = {
        cpu: this.normalizeText(input.cpu),
        memoryGB: input.memoryGB != null ? Number(input.memoryGB) : null,
        storageSummary: this.normalizeText(input.storageSummary),
      };
      const hasHardwareData = hardwareData.cpu || hardwareData.memoryGB != null || hardwareData.storageSummary;

      if (current.hardware) {
        await tx.inventoryHardwareSnapshot.update({
          where: { assetSnapshotId: current.id },
          data: hardwareData,
        });
      } else if (hasHardwareData) {
        await tx.inventoryHardwareSnapshot.create({
          data: {
            assetSnapshotId: current.id,
            ...hardwareData,
          },
        });
      }

      await tx.inventoryAssetIdentity.update({
        where: { id: current.assetIdentityId },
        data: {
          displayName: this.normalizeText(input.displayName) || current.displayName,
          hostname: this.normalizeText(input.hostname),
          serialNumber: this.normalizeText(input.serialNumber),
          assetTag: this.normalizeText(input.assetTag),
          manufacturer: this.normalizeText(input.manufacturer),
          model: this.normalizeText(input.model),
          lastSeenSource: (input.sourceType || current.sourceType || 'MANUAL') as any,
        },
      });

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryAssetSnapshot',
          entityId: current.id,
          action: 'UPDATE',
          beforeData: {
            displayName: current.displayName,
            hostname: current.hostname,
            serialNumber: current.serialNumber,
            assetTag: current.assetTag,
            manufacturer: current.manufacturer,
            model: current.model,
            operatingSystem: current.operatingSystem,
            operatingSystemVersion: current.operatingSystemVersion,
            notes: current.notes,
            siteId: current.siteId,
          },
          afterData: {
            displayName: this.normalizeText(input.displayName),
            hostname: this.normalizeText(input.hostname),
            serialNumber: this.normalizeText(input.serialNumber),
            assetTag: this.normalizeText(input.assetTag),
            manufacturer: this.normalizeText(input.manufacturer),
            model: this.normalizeText(input.model),
            operatingSystem: this.normalizeText(input.operatingSystem),
            operatingSystemVersion: this.normalizeText(input.operatingSystemVersion),
            notes: this.normalizeText(input.notes),
            siteId: input.siteId || null,
            hardware: hardwareData,
          },
          performedById: userId || null,
        },
      });
    });

    const updated = await this.prisma.inventoryAssetSnapshot.findUnique({
      where: { id: assetId },
      include: {
        site: true,
        assignedUser: true,
        hardware: true,
        softwareInstallations: {
          orderBy: [{ rawProductName: 'asc' }, { createdAt: 'asc' }],
        },
        _count: {
          select: {
            softwareInstallations: true,
          },
        },
      },
    });

    return { ok: true, data: this.serializeAssetSnapshot(updated) };
  }

  async createManualSoftwareInstallation(campaignId: string, assetId: string, input: SaveSoftwareInstallationInput, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const assetLookup = await this.getAssetSnapshotOrError(campaignId, assetId);
    if (!assetLookup.ok) return assetLookup;
    const asset = assetLookup.data!;

    const rawProductName = this.normalizeText(input.rawProductName);
    if (!rawProductName) return { ok: false, error: 'Informe o nome do software.' };

    const rawVendorName = this.normalizeText(input.rawVendorName);
    const edition = this.normalizeText(input.edition);
    const version = this.normalizeText(input.version);
    const notes = this.normalizeText(input.notes);

    const installationId = await this.prisma.$transaction(async (tx) => {
      let vendorId: string | null = null;
      if (rawVendorName) {
        const vendor = await tx.softwareVendor.upsert({
          where: { name: rawVendorName },
          update: {},
          create: { name: rawVendorName },
        });
        vendorId = vendor.id;
      }

      const product =
        (await tx.softwareProduct.findFirst({
          where: { vendorId, name: rawProductName },
          select: { id: true },
        })) ||
        (await tx.softwareProduct.create({
          data: { vendorId, name: rawProductName },
          select: { id: true },
        }));

      const existing = await tx.inventorySoftwareInstallation.findFirst({
        where: {
          assetSnapshotId: asset.id,
          rawProductName,
          edition,
          version,
        },
        select: { id: true },
      });

      const installation = existing
        ? await tx.inventorySoftwareInstallation.update({
            where: { id: existing.id },
            data: {
              productId: product.id,
              rawVendorName,
              notes,
              sourceType: 'MANUAL',
            },
          })
        : await tx.inventorySoftwareInstallation.create({
            data: {
              assetSnapshotId: asset.id,
              productId: product.id,
              rawVendorName,
              rawProductName,
              edition,
              version,
              notes,
              sourceType: 'MANUAL',
            },
          });

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventorySoftwareInstallation',
          entityId: installation.id,
          action: existing ? 'UPDATE' : 'CREATE',
          afterData: {
            assetSnapshotId: asset.id,
            rawVendorName,
            rawProductName,
            edition,
            version,
            notes,
            sourceType: 'MANUAL',
          },
          performedById: userId || null,
        },
      });

      return installation.id;
    });

    return { ok: true, data: { id: installationId } };
  }

  async createManualAsset(campaignId: string, input: SaveAssetInput, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    if (!this.normalizeText(input.displayName)) {
      return { ok: false, error: 'O nome do ativo é obrigatório.' };
    }

    const siteValidation = await this.validateSiteForCompany(campaign.companyId, input.siteId);
    if (!siteValidation.ok) return siteValidation;

    const result = await this.prisma.$transaction(async (tx) => {
      const identityResult = await this.resolveAssetIdentity(
        tx,
        campaign.companyId,
        {
          ...input,
          sourceType: 'MANUAL',
        },
        true,
      );
      const snapshotResult = await this.upsertAssetSnapshot(
        tx,
        campaign,
        identityResult.identity.id,
        {
          ...input,
          sourceType: 'MANUAL',
        },
        true,
      );

      await tx.inventoryCampaign.update({
        where: { id: campaign.id },
        data: {
          sourcesUsed: this.normalizeUniqueIds([...this.getSourceTypesFromJson(campaign.sourcesUsed), 'MANUAL']),
          updatedById: userId || null,
        },
      });

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryAssetSnapshot',
          entityId: snapshotResult.snapshotId,
          action: snapshotResult.created ? 'CREATE' : 'UPDATE',
          afterData: {
            sourceType: 'MANUAL',
            displayName: this.normalizeText(input.displayName),
            hostname: this.normalizeText(input.hostname),
            serialNumber: this.normalizeText(input.serialNumber),
            assetTag: this.normalizeText(input.assetTag),
          },
          performedById: userId || null,
        },
      });

      return {
        assetSnapshotId: snapshotResult.snapshotId,
        createdIdentity: identityResult.created,
        createdSnapshot: snapshotResult.created,
      };
    });

    const asset = await this.prisma.inventoryAssetSnapshot.findUnique({
      where: { id: result.assetSnapshotId },
      include: {
        site: true,
        assignedUser: true,
        hardware: true,
        _count: { select: { softwareInstallations: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...this.serializeAssetSnapshot(asset),
        createdIdentity: result.createdIdentity,
        createdSnapshot: result.createdSnapshot,
      },
    };
  }

  async importGlpiAssets(campaignId: string, userId?: string | null) {
    const campaignLookup = await this.getCampaignOrError(campaignId);
    if (!campaignLookup.ok) return campaignLookup;
    const campaign = campaignLookup.data!;

    const glpiAssets = await this.glpi.listComputersForImport(campaign.companyId);
    if (!glpiAssets.ok) return glpiAssets;
    const glpiData: any = glpiAssets.data;

    const result = await this.prisma.$transaction(async (tx) => {
      let createdIdentities = 0;
      let createdSnapshots = 0;
      let updatedSnapshots = 0;

      for (const asset of glpiData.computers) {
        const identityResult = await this.resolveAssetIdentity(
          tx,
          campaign.companyId,
          {
            displayName: asset.displayName,
            hostname: asset.hostname,
            serialNumber: asset.serialNumber,
            assetTag: asset.assetTag,
            manufacturer: asset.manufacturer,
            model: asset.model,
            operatingSystem: asset.operatingSystem,
            operatingSystemVersion: asset.operatingSystemVersion,
            sourceExternalId: asset.externalId,
            cpu: asset.cpu,
            memoryGB: asset.memoryGB,
            storageSummary: asset.storageSummary,
            sourceType: 'GLPI',
          },
          false,
        );
        if (identityResult.created) createdIdentities += 1;

        const snapshotResult = await this.upsertAssetSnapshot(
          tx,
          campaign,
          identityResult.identity.id,
          {
            displayName: asset.displayName,
            hostname: asset.hostname,
            serialNumber: asset.serialNumber,
            assetTag: asset.assetTag,
            manufacturer: asset.manufacturer,
            model: asset.model,
            operatingSystem: asset.operatingSystem,
            operatingSystemVersion: asset.operatingSystemVersion,
            sourceExternalId: asset.externalId,
            cpu: asset.cpu,
            memoryGB: asset.memoryGB,
            storageSummary: asset.storageSummary,
            sourceType: 'GLPI',
          },
          false,
        );
        if (snapshotResult.created) createdSnapshots += 1;
        else updatedSnapshots += 1;
      }

      await tx.inventoryCampaign.update({
        where: { id: campaign.id },
        data: {
          sourcesUsed: this.normalizeUniqueIds([...this.getSourceTypesFromJson(campaign.sourcesUsed), 'GLPI']),
          updatedById: userId || null,
        },
      });

      const batch = await tx.inventoryImportBatch.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          sourceType: 'GLPI',
          fileName: glpiData.selectedEntity?.fullPath || glpiData.selectedEntity?.name || 'GLPI',
          externalSourceId: glpiData.selectedEntity?.id || null,
          summary: {
            selectedEntity: glpiData.selectedEntity,
            includeSubentities: glpiData.includeSubentities,
            totalImported: glpiData.computers.length,
            totalReportedByGlpi: glpiData.totalAvailable,
            truncated: glpiData.truncated,
            createdIdentities,
            createdSnapshots,
            updatedSnapshots,
          },
          createdById: userId || null,
        },
      });

      await tx.inventoryAuditEvent.create({
        data: {
          companyId: campaign.companyId,
          campaignId: campaign.id,
          entityType: 'InventoryImportBatch',
          entityId: batch.id,
          action: 'IMPORT_GLPI',
          afterData: {
            selectedEntity: glpiData.selectedEntity,
            includeSubentities: glpiData.includeSubentities,
            totalImported: glpiData.computers.length,
            totalReportedByGlpi: glpiData.totalAvailable,
            truncated: glpiData.truncated,
            createdIdentities,
            createdSnapshots,
            updatedSnapshots,
          },
          performedById: userId || null,
        },
      });

      return {
        totalImported: glpiData.computers.length,
        totalAvailable: glpiData.totalAvailable,
        truncated: glpiData.truncated,
        createdIdentities,
        createdSnapshots,
        updatedSnapshots,
      };
    });

    return { ok: true, data: result };
  }
}
