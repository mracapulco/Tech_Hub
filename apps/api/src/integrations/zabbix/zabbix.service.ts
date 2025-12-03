import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SettingsService } from '../../settings/settings.service';

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
    const [ip, maskStr] = cidr.split('/');
    const mask = Number(maskStr);
    const parts = ip.split('.').map((p) => Number(p));
    const base = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    const size = 2 ** (32 - mask);
    const start = base & ((~0 << (32 - mask)) >>> 0);
    const end = start + size - 1;
    return { start, end };
  }

  private ipToInt(ip: string): number {
    const p = ip.split('.').map((x) => Number(x));
    if (p.length !== 4 || p.some((v) => !Number.isFinite(v))) return 0;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }

  async sync(companyId: string, debug?: boolean) {
    const cfg = (await this.settings.getZabbixConfig(companyId)) as ZabbixConfig | null;
    if (!cfg) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const url = cfg.url.replace(/\/$/, '') + '/api_jsonrpc.php';
    const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` };
    let groupIds: string[] = [];
    if (cfg.groupPrefix) {
      try {
        const gpPayload = { jsonrpc: '2.0', method: 'hostgroup.get', params: { output: ['groupid', 'name'], search: { name: cfg.groupPrefix }, searchWildcardsEnabled: true }, id: 1 };
        const gpRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(gpPayload) });
        const gpData = await gpRes.json();
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
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      data = await res.json();
    } catch (e) {
      return { ok: false, error: 'Falha ao consultar Zabbix.' };
    }
    const hosts: any[] = Array.isArray(data?.result) ? data.result : [];
    const subnets = await this.prisma.ipSubnet.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    const ranges = subnets.map((s) => ({ id: s.id, cidr: s.cidr, ...this.parseCidr(s.cidr) }));
    let created = 0;
    let ipMissing = 0;
    let unmatched = 0;
    const unmatchedSamples: Array<{ host: string; ip?: string }> = [];
    for (const h of hosts) {
      const iface = Array.isArray(h?.interfaces) ? h.interfaces.find((i: any) => i?.ip && i.ip !== '127.0.0.1' && !i.ip.startsWith('169.254.')) : null;
      if (!iface?.ip) { ipMissing++; if (debug && unmatchedSamples.length < 50) unmatchedSamples.push({ host: String(h?.name || h?.host || ''), ip: undefined }); continue; }
      const ipInt = this.ipToInt(String(iface.ip));
      const range = ranges.find((r) => ipInt >= r.start && ipInt <= r.end);
      if (!range) { unmatched++; if (debug && unmatchedSamples.length < 50) unmatchedSamples.push({ host: String(h?.name || h?.host || ''), ip: String(iface.ip) }); continue; }
      const hostname = String(iface.dns || h.name || h.host || '').trim();
      try {
        await this.prisma.ipAddress.upsert({
          where: { subnetId_address: { subnetId: range.id, address: iface.ip } },
          update: { hostname, status: 'ASSIGNED' },
          create: { subnetId: range.id, address: iface.ip, hostname, status: 'ASSIGNED' },
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
        ipMissing,
        unmatched,
        unmatchedSamples,
      },
    };
  }
}
