import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { promises as dns } from 'dns';

type ZabbixConfig = { url: string; token: string; groupPrefix?: string };

@Injectable()
export class ZabbixService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async setConfig(companyId: string, cfg: ZabbixConfig, updatedBy?: string) {
    if (!cfg?.url || !cfg?.token) return { ok: false, error: 'url e token são obrigatórios' };
    await this.settings.setZabbixConfig(companyId, cfg, updatedBy);
    return { ok: true };
  }

  async getConfig(companyId: string) {
    const cfg = (await this.settings.getZabbixConfig(companyId)) as ZabbixConfig | null;
    if (!cfg) return null;
    return { url: cfg.url, groupPrefix: cfg.groupPrefix, maskedToken: cfg.token ? `${cfg.token.slice(0,3)}****${cfg.token.slice(-4)}` : '****' };
  }

  private parseCidr(cidr: string) {
    const [ipRaw, maskRaw] = cidr.split('/');
    const ip = String(ipRaw || '').trim();
    const mask = Number(String(maskRaw || '').trim());
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v) || v < 0 || v > 255) || !Number.isFinite(mask) || mask < 0 || mask > 32) {
      return { start: 0, end: -1 };
    }
    const ipInt = (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
    const block = 2 ** (32 - mask);
    const start = Math.floor(ipInt / block) * block;
    const end = start + block - 1;
    return { start, end };
  }

  private ipToInt(ip: string): number {
    const p = String(ip || '').trim().split('.').map((x) => Number(x));
    if (p.length !== 4 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return 0;
    const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
    return n;
  }

  private async postJson(url: string, headers: any, body: any, timeoutMs = 10000): Promise<any> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  private async resolveDns(name: string, timeoutMs = 1500): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r: any = await dns.lookup(name, { family: 4 });
        return r?.address ? String(r.address) : undefined;
      } finally {
        clearTimeout(t);
      }
    } catch {
      return undefined;
    }
  }

  async sync(companyId: string, debug?: boolean, dnsFallback?: boolean) {
    const cfg = (await this.settings.getZabbixConfig(companyId)) as ZabbixConfig | null;
    if (!cfg) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const url = cfg.url.replace(/\/$/, '') + '/api_jsonrpc.php';
    const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` };
    let groupIds: string[] = [];
    if (cfg.groupPrefix) {
      try {
        const gpPayload = { jsonrpc: '2.0', method: 'hostgroup.get', params: { output: ['groupid', 'name'], search: { name: cfg.groupPrefix }, searchWildcardsEnabled: true }, id: 1 };
        const gpData = await this.postJson(url, headers, gpPayload, 10000);
        const groups: any[] = Array.isArray(gpData?.result) ? gpData.result : [];
        groupIds = groups.map((g: any) => String(g.groupid)).filter(Boolean);
      } catch {
        groupIds = [];
      }
    }
    const params: any = {
      output: ['host', 'name', 'status'],
      selectInterfaces: ['ip', 'dns', 'useip'],
      selectGroups: ['groupid', 'name'],
    };
    if (groupIds.length > 0) params.groupids = groupIds;
    const payload = { jsonrpc: '2.0', method: 'host.get', params, id: 2 };
    let data: any;
    try {
      data = await this.postJson(url, headers, payload, 15000);
    } catch (e) {
      return { ok: false, error: 'Falha ao consultar Zabbix.' };
    }
    let hosts: any[] = Array.isArray(data?.result) ? data.result : [];
    const prefix = (cfg.groupPrefix || '').trim().replace(/\/+$/, '');
    let groupFiltered = 0;
    if (prefix) {
      const before = hosts.length;
      hosts = hosts.filter((h: any) => {
        const groups: any[] = Array.isArray(h?.groups) ? h.groups : [];
        return groups.some((g: any) => {
          const n = String(g?.name || '').trim();
          return n === prefix || n.startsWith(prefix + '/');
        });
      });
      groupFiltered = before - hosts.length;
    }
    const subnets = await this.prisma.ipSubnet.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    const ranges = subnets.map((s) => ({ id: s.id, cidr: String(s.cidr || '').trim(), ...this.parseCidr(String(s.cidr || '').trim()) }));
    let created = 0;
    let ipMissing = 0;
    let unmatched = 0;
    const unmatchedSamples: Array<{ host: string; ip?: string }> = [];
    for (const h of hosts) {
      let iface = Array.isArray(h?.interfaces) ? h.interfaces.find((i: any) => i?.ip && i.ip !== '127.0.0.1' && !String(i.ip).startsWith('169.254.')) : null;
      let ipStr: string | undefined = iface?.ip;
      if ((!ipStr || ipStr === '0.0.0.0') && dnsFallback) {
        const dnsName = iface?.dns || String(h?.name || h?.host || '');
        if (dnsName) ipStr = await this.resolveDns(dnsName, 1500);
      }
      if (!ipStr) { ipMissing++; if (debug && unmatchedSamples.length < 50) unmatchedSamples.push({ host: String(h?.name || h?.host || ''), ip: undefined }); continue; }
      const ipInt = this.ipToInt(String(ipStr));
      const range = ranges.find((r) => ipInt >= r.start && ipInt <= r.end);
      if (!range) { unmatched++; if (debug && unmatchedSamples.length < 50) unmatchedSamples.push({ host: String(h?.name || h?.host || ''), ip: String(ipStr) }); continue; }
      const hostname = String(iface.dns || h.name || h.host || '').trim();
      try {
        await this.prisma.ipAddress.upsert({
          where: { subnetId_address: { subnetId: range.id, address: ipStr } },
          update: { hostname, status: 'ASSIGNED' },
          create: { subnetId: range.id, address: ipStr, hostname, status: 'ASSIGNED' },
        });
        created += 1;
      } catch {}
    }
    const baseDetails = { totalHosts: hosts.length, addedOrUpdated: created };
    if (!debug) return { ok: true, data: baseDetails };
    return {
      ok: true,
      data: {
        ...baseDetails,
        companyId,
        subnetsTotal: subnets.length,
        groupPrefix: cfg.groupPrefix || null,
        groupIdsCount: groupIds.length,
        groupFiltered,
        ipMissing,
        unmatched,
        unmatchedSamples,
        cidrs: subnets.map((s) => String(s.cidr || '').trim()),
      },
    };
  }
}
