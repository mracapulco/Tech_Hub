import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { promises as dns } from 'dns';

type ZabbixConfig = { url: string; token: string; groupPrefix?: string };

@Injectable()
export class ZabbixService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private getRpcErrorMessage(response: any, fallback: string): string {
    const message = String(response?.error?.data || response?.error?.message || '').trim();
    return message || fallback;
  }

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

  private async getCompanyConfig(companyId: string) {
    const cfg = (await this.settings.getZabbixConfig(companyId)) as ZabbixConfig | null;
    if (!cfg?.url || !cfg?.token) return null;
    return {
      cfg,
      url: cfg.url.replace(/\/$/, '') + '/api_jsonrpc.php',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` } as Record<string, string>,
    };
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

  private async getGroupIds(companyId: string): Promise<{ cfg: ZabbixConfig; url: string; headers: Record<string, string>; groupIds: string[] } | null> {
    const base = await this.getCompanyConfig(companyId);
    if (!base) return null;
    const { cfg, url, headers } = base;
    let groupIds: string[] = [];
    if (cfg.groupPrefix) {
      try {
        const gpPayload = {
          jsonrpc: '2.0',
          method: 'hostgroup.get',
          params: { output: ['groupid', 'name'], search: { name: cfg.groupPrefix }, searchWildcardsEnabled: true },
          id: 1,
        };
        const gpData = await this.postJson(url, headers, gpPayload, 10000);
        const groups: any[] = Array.isArray(gpData?.result) ? gpData.result : [];
        groupIds = groups.map((g: any) => String(g.groupid)).filter(Boolean);
      } catch {
        groupIds = [];
      }
    }
    return { cfg, url, headers, groupIds };
  }

  async listHostsWithItem(companyId: string, itemKey: string) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { cfg, url, headers, groupIds } = scoped;
    const hostParams: any = {
      output: ['hostid', 'host', 'name', 'status'],
      sortfield: ['name'],
      sortorder: 'ASC',
    };
    if (groupIds.length > 0) hostParams.groupids = groupIds;
    const hostPayload = { jsonrpc: '2.0', method: 'host.get', params: hostParams, id: 2 };
    const hostData = await this.postJson(url, headers, hostPayload, 15000);
    let hosts: any[] = Array.isArray(hostData?.result) ? hostData.result : [];
    const prefix = (cfg.groupPrefix || '').trim().replace(/\/+$/, '');
    if (prefix) {
      const groupPayload = {
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: ['hostid', 'host', 'name', 'status'],
          selectGroups: ['groupid', 'name'],
          ...(groupIds.length > 0 ? { groupids: groupIds } : {}),
        },
        id: 3,
      };
      const groupData = await this.postJson(url, headers, groupPayload, 15000);
      const withGroups: any[] = Array.isArray(groupData?.result) ? groupData.result : [];
      hosts = withGroups.filter((host: any) => {
        const groups: any[] = Array.isArray(host?.groups) ? host.groups : [];
        return groups.some((group: any) => {
          const name = String(group?.name || '').trim();
          return name === prefix || name.startsWith(prefix + '/');
        });
      });
    }
    const hostIds = hosts.map((host: any) => String(host.hostid)).filter(Boolean);
    if (hostIds.length === 0) return { ok: true, data: [] };
    const itemPayload = {
      jsonrpc: '2.0',
      method: 'item.get',
      params: {
        output: ['itemid', 'hostid', 'key_', 'lastclock'],
        hostids: hostIds,
        filter: { key_: [itemKey] },
        monitored: true,
      },
      id: 4,
    };
    const itemData = await this.postJson(url, headers, itemPayload, 15000);
    const items: any[] = Array.isArray(itemData?.result) ? itemData.result : [];
    const itemsByHostId = new Map<string, any>();
    for (const item of items) {
      const hostId = String(item?.hostid || '');
      const current = itemsByHostId.get(hostId);
      if (!current || Number(item?.lastclock || 0) > Number(current?.lastclock || 0)) {
        itemsByHostId.set(hostId, item);
      }
    }
    const data = hosts
      .filter((host: any) => itemsByHostId.has(String(host.hostid)))
      .map((host: any) => {
        const item = itemsByHostId.get(String(host.hostid));
        return {
          hostId: String(host.hostid),
          host: String(host.host || ''),
          name: String(host.name || host.host || ''),
          status: String(host.status || ''),
          itemId: String(item?.itemid || ''),
          lastClock: Number(item?.lastclock || 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, data };
  }

  async getHostItemLastValue(companyId: string, hostId: string, itemKey: string) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { url, headers } = scoped;
    const payload = {
      jsonrpc: '2.0',
      method: 'item.get',
      params: {
        output: ['itemid', 'hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
        hostids: [hostId],
        filter: { key_: [itemKey] },
        monitored: true,
        sortfield: 'lastclock',
        sortorder: 'DESC',
        limit: 1,
      },
      id: 5,
    };
    const data = await this.postJson(url, headers, payload, 15000);
    const item = Array.isArray(data?.result) ? data.result[0] : null;
    if (!item?.itemid) return { ok: false, error: 'Item não encontrado para o host selecionado.' };
    return {
      ok: true,
      data: {
        itemId: String(item.itemid),
        hostId: String(item.hostid || hostId),
        key: String(item.key_ || itemKey),
        name: String(item.name || ''),
        lastValue: String(item.lastvalue || ''),
        lastClock: Number(item.lastclock || 0),
      },
    };
  }

  async getItemLastValueById(companyId: string, itemId: string) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { url, headers } = scoped;
    const payload = {
      jsonrpc: '2.0',
      method: 'item.get',
      params: {
        output: ['itemid', 'hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
        itemids: [itemId],
      },
      id: 6,
    };
    const data = await this.postJson(url, headers, payload, 15000);
    const item = Array.isArray(data?.result) ? data.result[0] : null;
    if (!item?.itemid) return { ok: false, error: 'Item não encontrado para o host selecionado.' };
    return {
      ok: true,
      data: {
        itemId: String(item.itemid),
        hostId: String(item.hostid || ''),
        key: String(item.key_ || ''),
        name: String(item.name || ''),
        lastValue: String(item.lastvalue || ''),
        lastClock: Number(item.lastclock || 0),
      },
    };
  }

  async getValidatedItem(
    companyId: string,
    input: { hostId?: string; itemId?: string; itemKey?: string },
  ) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { url, headers } = scoped;
    const buildItem = (item: any) => ({
      itemId: String(item.itemid),
      hostId: String(item.hostid || input.hostId || ''),
      key: String(item.key_ || ''),
      name: String(item.name || ''),
      status: String(item.status ?? ''),
      state: String(item.state ?? ''),
      error: String(item.error || ''),
      valueType: Number(item.value_type ?? -1),
    });
    const requestItem = async (params: Record<string, any>, requestId: number) => {
      const payload = {
        jsonrpc: '2.0',
        method: 'item.get',
        params,
        id: requestId,
      };
      const data = await this.postJson(url, headers, payload, 15000);
      if (data?.error) {
        return { ok: false as const, error: this.getRpcErrorMessage(data, 'Falha ao consultar item no Zabbix.') };
      }
      const items = Array.isArray(data?.result) ? data.result : [];
      return { ok: true as const, data: items };
    };
    const baseParams: any = {
      output: ['itemid', 'hostid', 'name', 'key_', 'status', 'state', 'error', 'value_type'],
    };
    if (input.hostId) baseParams.hostids = [input.hostId];
    if (input.itemKey) baseParams.filter = { key_: [input.itemKey] };

    let items: any[] = [];
    if (input.itemId) {
      const primaryParams = { ...baseParams, itemids: [input.itemId] };
      const primary = await requestItem(primaryParams, 7);
      if (!primary.ok) return primary;
      items = primary.data;
    }
    if (items.length === 0 && input.hostId && input.itemKey) {
      const fallback = await requestItem(baseParams, 71);
      if (!fallback.ok) return fallback;
      items = fallback.data;
    }
    if (items.length === 0 && !input.hostId && input.itemId) {
      const byItemId = await requestItem({ ...baseParams, itemids: [input.itemId] }, 72);
      if (!byItemId.ok) return byItemId;
      items = byItemId.data;
    }
    const item = items[0] || null;
    if (!item?.itemid) return { ok: false, error: 'Item veeam.get.metrics não encontrado para o host selecionado.' };
    return { ok: true, data: buildItem(item) };
  }

  async getItemTextHistory(companyId: string, itemId: string) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { url, headers } = scoped;
    const payload = {
      jsonrpc: '2.0',
      method: 'history.get',
      params: {
        output: 'extend',
        history: 4,
        itemids: [itemId],
        sortfield: 'clock',
        sortorder: 'DESC',
        limit: 1,
      },
      id: 8,
    };
    const data = await this.postJson(url, headers, payload, 15000);
    if (data?.error) {
      return { ok: false, error: this.getRpcErrorMessage(data, 'Falha ao consultar histórico do item no Zabbix.') };
    }
    const rows: any[] = Array.isArray(data?.result) ? data.result : [];
    return {
      ok: true,
      data: rows.map((row: any) => ({
        itemId: String(row.itemid || itemId),
        clock: Number(row.clock || 0),
        ns: Number(row.ns || 0),
        value: String(row.value || ''),
      })),
    };
  }

  async sync(companyId: string, debug?: boolean, dnsFallback?: boolean) {
    const scoped = await this.getGroupIds(companyId);
    if (!scoped) return { ok: false, error: 'Configuração Zabbix ausente para a empresa.' };
    const { cfg, url, headers, groupIds } = scoped;
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
