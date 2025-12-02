import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private getMasterKey(): Buffer {
    const mk = process.env.CONFIG_MASTER_KEY;
    if (!mk) throw new Error('CONFIG_MASTER_KEY ausente.');
    // Derivar 32 bytes via SHA-256 do texto fornecido
    return crypto.createHash('sha256').update(mk).digest();
  }

  private encrypt(value: string): string {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ciphertext.toString('base64') });
  }

  private decrypt(enc: string): string {
    const key = this.getMasterKey();
    let payload: { iv: string; tag: string; ct: string };
    try {
      payload = JSON.parse(enc);
    } catch {
      throw new Error('Formato inválido de valor cifrado.');
    }
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ct = Buffer.from(payload.ct, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return plaintext;
  }

  async setOpenAiKey(value: string, updatedBy?: string) {
    const valueEnc = this.encrypt(value);
    const key = 'OPENAI_API_KEY';
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.setting.update({ where: { key }, data: { valueEnc, updatedBy: updatedBy || existing.updatedBy } });
    } else {
      await this.prisma.setting.create({ data: { key, valueEnc, updatedBy } });
    }
    return { ok: true };
  }

  async getOpenAiKeyMasked(): Promise<{ masked: string; updatedAt?: string; updatedBy?: string } | null> {
    const key = 'OPENAI_API_KEY';
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (!existing) return null;
    try {
      const full = this.decrypt(existing.valueEnc);
      const masked = full.length > 8 ? `${full.slice(0, 3)}****${full.slice(-4)}` : '****';
      return { masked, updatedAt: (existing as any).updatedAt?.toISOString?.() ?? (existing as any).updatedAt, updatedBy: existing.updatedBy || undefined };
    } catch {
      return { masked: '****', updatedAt: (existing as any).updatedAt?.toISOString?.() ?? (existing as any).updatedAt, updatedBy: existing.updatedBy || undefined };
    }
  }

  async getOpenAiKeyRaw(): Promise<string | null> {
    const key = 'OPENAI_API_KEY';
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (!existing) return null;
    try {
      return this.decrypt(existing.valueEnc);
    } catch {
      return null;
    }
  }

  // Utilitários genéricos para outras configurações cifradas
  private async setEncryptedSetting(key: string, value: string, updatedBy?: string) {
    const valueEnc = this.encrypt(value);
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.setting.update({ where: { key }, data: { valueEnc, updatedBy: updatedBy || existing.updatedBy } });
    } else {
      await this.prisma.setting.create({ data: { key, valueEnc, updatedBy } });
    }
  }

  private async getDecryptedSetting(key: string): Promise<string | null> {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (!existing) return null;
    try {
      return this.decrypt(existing.valueEnc);
    } catch {
      return null;
    }
  }

  async getAiConfig(): Promise<{ provider: string; baseURL?: string; model: string }> {
    // Fallback para ambiente quando não houver configuração persistida
    const envProvider = process.env.AI_PROVIDER || 'openai';
    const envBaseURL = process.env.AI_BASE_URL || undefined;
    const envModel = process.env.AI_MODEL || 'gpt-4o-mini';

    const provider = (await this.getDecryptedSetting('AI_PROVIDER')) || envProvider;
    const baseURL = (await this.getDecryptedSetting('AI_BASE_URL')) || envBaseURL;
    const model = (await this.getDecryptedSetting('AI_MODEL')) || envModel;
    return { provider, baseURL: baseURL || undefined, model };
  }

  async setAiConfig(cfg: { provider?: string; baseURL?: string; model?: string }, updatedBy?: string) {
    const tasks: Promise<any>[] = [];
    if (cfg.provider) tasks.push(this.setEncryptedSetting('AI_PROVIDER', cfg.provider, updatedBy));
    if (typeof cfg.baseURL === 'string') tasks.push(this.setEncryptedSetting('AI_BASE_URL', cfg.baseURL, updatedBy));
    if (cfg.model) tasks.push(this.setEncryptedSetting('AI_MODEL', cfg.model, updatedBy));
    if (tasks.length) await Promise.all(tasks);
    return { ok: true };
  }

  // ---------- Tech Master Standards (Company Standards) ----------
  async getCompanyStandards(): Promise<any | null> {
    const raw = await this.getDecryptedSetting('COMPANY_STANDARDS');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setCompanyStandards(standards: any, updatedBy?: string) {
    const payload = JSON.stringify(standards ?? {});
    await this.setEncryptedSetting('COMPANY_STANDARDS', payload, updatedBy);
    return { ok: true };
  }

  // ---------- Client Profile (per company) ----------
  async getClientProfile(companyId: string): Promise<any | null> {
    if (!companyId) return null;
    const key = `CLIENT_PROFILE_${String(companyId)}`;
    const raw = await this.getDecryptedSetting(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setClientProfile(companyId: string, profile: any, updatedBy?: string) {
    if (!companyId) throw new Error('companyId requerido');
    const key = `CLIENT_PROFILE_${String(companyId)}`;
    const payload = JSON.stringify(profile ?? {});
    await this.setEncryptedSetting(key, payload, updatedBy);
    return { ok: true };
  }

  async getZabbixConfig(companyId: string): Promise<any | null> {
    if (!companyId) return null;
    const key = `ZABBIX_CFG_${String(companyId)}`;
    const raw = await this.getDecryptedSetting(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setZabbixConfig(companyId: string, cfg: any, updatedBy?: string) {
    if (!companyId) throw new Error('companyId requerido');
    const key = `ZABBIX_CFG_${String(companyId)}`;
    const payload = JSON.stringify(cfg ?? {});
    await this.setEncryptedSetting(key, payload, updatedBy);
    return { ok: true };
  }
}
