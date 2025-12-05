"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { getUser } from '@/lib/auth';

type Company = { id: string; name: string };
type Site = { id: string; name: string };
type Vlan = { id: string; siteId: string; number: number; name: string };
type Subnet = { id: string; name: string; cidr: string; description?: string | null; siteId?: string | null; vlanId?: string | null };
type SubnetStats = Subnet & { usageCount: number };

export default function IpamPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [vlanId, setVlanId] = useState('');
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [stats, setStats] = useState<SubnetStats[]>([]);
  const [expected, setExpected] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [planBase, setPlanBase] = useState<string>('10.0.0.0/16');
  const [vlanExpectations, setVlanExpectations] = useState<Record<string, string>>({});
  const [planResult, setPlanResult] = useState<any[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [companyDetail, setCompanyDetail] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const token = typeof window !== 'undefined' ? getToken() : null;
  const user = typeof window !== 'undefined' ? getUser() : null;
  const router = useRouter();
  const [sortBy, setSortBy] = useState<'name'|'cidr'|'description'|'site'|'vlan'>('name');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          setIsAdminOrTech(memberships.some((m) => m.role === 'ADMIN' || m.role === 'TECHNICIAN'));
        } catch { setIsAdminOrTech(false); }
      }
      const res = await apiGet<{ ok: boolean; data: any[] }>(`/companies`, token);
      if (res?.ok) setCompanies(res.data.map((c: any) => ({ id: c.id, name: c.name })));
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      if (!token || !companyId) { setSites([]); setSiteId(''); setVlans([]); setVlanId(''); setSubnets([]); return; }
      const s = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
      if (Array.isArray(s)) setSites(s);
      const res = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}`, token);
      if (Array.isArray(res)) setSubnets(res);
      const st = await apiGet<SubnetStats[]>(`/ipam/subnets-stats?companyId=${companyId}`, token);
      if (Array.isArray(st)) setStats(st);
      try {
        const det = await apiGet<{ ok: boolean; data?: any }>(`/companies/${companyId}`, token);
        if (det?.ok) setCompanyDetail(det.data);
      } catch {}
      if (!siteId) {
        const vAll = await apiGet<Vlan[]>(`/vlans?companyId=${companyId}`, token);
        if (Array.isArray(vAll)) setVlans(vAll);
      }
    })();
  }, [token, companyId]);

  useEffect(() => {
    (async () => {
      if (!token || !siteId) { setVlans([]); setVlanId(''); return; }
      const v = await apiGet<Vlan[]>(`/vlans?siteId=${siteId}`, token);
      if (Array.isArray(v)) setVlans(v);
      const res = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}&siteId=${siteId}`, token);
      if (Array.isArray(res)) setSubnets(res);
      const st = await apiGet<SubnetStats[]>(`/ipam/subnets-stats?companyId=${companyId}&siteId=${siteId}`, token);
      if (Array.isArray(st)) setStats(st);
    })();
  }, [token, siteId]);

  const onCreate = async () => {
    if (!token || !companyId || !name || !cidr) return;
    setLoading(true);
    try {
      const created = await apiPost<Subnet>(`/ipam/subnets`, token, { companyId, siteId: siteId || undefined, vlanId: vlanId || undefined, name, cidr, description: description || undefined });
      if (created && created.id) {
        setName('');
        setCidr('');
        setDescription('');
        const list = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
        if (Array.isArray(list)) setSubnets(list);
      }
    } finally {
      setLoading(false);
    }
  };

  function capacityFromCidr(c: string): number {
    try {
      const parts = c.split('/');
      const mask = Number(parts[1]);
      if (!Number.isFinite(mask) || mask < 0 || mask > 32) return 0;
      const hosts = Math.pow(2, 32 - mask);
      const usable = mask >= 31 ? hosts : hosts - 2;
      return Math.max(0, usable);
    } catch {
      return 0;
    }
  }

  function imgUrl(u?: string | null) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
    return u;
  }

  function csvEscape(v: any) {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV() {
    const lines: string[] = [];
    const companyName = companies.find(c => c.id === companyId)?.name || 'Empresa';
    lines.push(['Empresa', companyName].map(csvEscape).join(','));
    lines.push('');
    lines.push(['Subnet', 'CIDR', 'Site', 'VLAN', 'Capacidade', 'Usados', 'Ocupação (%)', 'Saúde'].map(csvEscape).join(','));
    const mapStats = new Map(stats.map(s => [s.id, s] as [string, SubnetStats]));
    sortedSubnets.forEach((s) => {
      const st = mapStats.get(s.id);
      const cap = capacityFromCidr(s.cidr);
      const used = st?.usageCount || 0;
      const occ = occupancy(used, cap);
      const hl = health(occ);
      const siteName = s.siteId ? (sites.find(x => x.id === s.siteId)?.name || '') : '';
      const vlanName = s.vlanId ? (vlans.find(x => x.id === s.vlanId)?.name || '') : '';
      lines.push([s.name, s.cidr, siteName, vlanName, cap, used, occ, hl].map(csvEscape).join(','));
    });
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ipam_${companyName.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    const companyName = companies.find(c => c.id === companyId)?.name || 'Empresa';
    const companyLogo = imgUrl(companyDetail?.logoUrl || '');
    const totalCap = subnets.reduce((sum, s) => sum + capacityFromCidr(s.cidr), 0);
    const usedMap = new Map(stats.map(s => [s.id, s.usageCount] as [string, number]));
    const totalUsed = subnets.reduce((sum, s) => sum + (usedMap.get(s.id) || 0), 0);
    const avgOcc = totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0;
    const top = [...subnets].map(s => {
      const cap = capacityFromCidr(s.cidr);
      const used = usedMap.get(s.id) || 0;
      const occ = cap > 0 ? Math.round((used / cap) * 100) : 0;
      return { id: s.id, name: s.name, cidr: s.cidr, occ };
    }).sort((a,b)=>b.occ-a.occ).slice(0,10);
    const healthCounts = (() => {
      let ok = 0, high = 0, critical = 0;
      subnets.forEach(s => {
        const cap = capacityFromCidr(s.cidr);
        const used = usedMap.get(s.id) || 0;
        const occ = occupancy(used, cap);
        const h = health(occ);
        if (h === 'OK') ok++; else if (h === 'Alto') high++; else critical++;
      });
      const total = subnets.length || 1;
      const okP = Math.round((ok/total)*100), highP = Math.round((high/total)*100), critP = Math.round((critical/total)*100);
      return { ok, high, critical, okP, highP, critP };
    })();
    const now = new Date().toLocaleString();
    const addrMap = new Map<string, Array<{ address: string; hostname?: string; status?: string }>>();
    for (const s of sortedSubnets) {
      const list = await apiGet<Array<{ address: string; hostname?: string; status?: string }>>(`/ipam/addresses?subnetId=${s.id}`, token!);
      if (Array.isArray(list)) addrMap.set(s.id, list);
    }
    const styles = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
        .container { max-width: 900px; margin: 0 auto; padding: 24px; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
        .logo { height: 52px; object-fit: contain; }
        .powered { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
        h1 { font-size: 20px; margin: 0; }
        h2 { font-size: 18px; margin: 20px 0 8px; }
        p { font-size: 14px; line-height: 1.6; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
        th { background: #f9fafb; text-align: left; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #ffffff; }
        .big { font-size: 22px; font-weight: 600; }
        .muted { color: #6b7280; font-size: 12px; }
        .chart { margin-top: 8px; }
        svg { display: block; }
        .section { margin-top: 16px; }
        .section > h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .page-break { height: 1px; }
        @media print { .page-break { page-break-after: always; } }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { margin: 16mm; }
        .zebra tbody tr:nth-child(even) { background: #f9fafb; }
        .tight td, .tight th { padding: 6px; font-size: 12px; }
        .subnet-title { margin: 12px 0 6px; font-weight: 600; }
        .addresses-wrap table thead tr th:nth-child(3), .addresses-wrap table tbody tr td:nth-child(3) { display: none; }
      </style>
    `;
    const intro = `Este documento apresenta o panorama de endereçamento IP da organização, consolidando subnets, ocupação e endereços cadastrados por site/VLAN. Foi gerado pelo Tech Hub em ${now} e é adequado para arquivamento interno, auditorias e planejamento de capacidade.`;
    const chartBars = top.map(t => {
      const color = t.occ >= 90 ? '#dc2626' : t.occ >= 70 ? '#f59e0b' : '#10b981';
      const full = 300;
      const filled = Math.round((t.occ / 100) * full);
      return `<div style=\"display:flex;align-items:center;gap:8px;margin:6px 0\">
        <div style=\"width:180px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">${t.name}</div>
        <svg width=\"${full}\" height=\"10\" xmlns=\"http://www.w3.org/2000/svg\">
          <rect x=\"0\" y=\"1\" width=\"${full}\" height=\"8\" fill=\"#e5e7eb\" rx=\"4\" ry=\"4\" />
          <rect x=\"0\" y=\"1\" width=\"${filled}\" height=\"8\" fill=\"${color}\" rx=\"4\" ry=\"4\" />
        </svg>
        <div style=\"width:40px;text-align:right;font-size:12px\">${t.occ}%</div>
      </div>`;
    }).join('');
    const stackedSummary = (() => {
      const total = Math.max(1, subnets.length);
      const width = 380;
      const okW = Math.round((healthCounts.ok/total)*width);
      const highW = Math.round((healthCounts.high/total)*width);
      const critW = Math.round((healthCounts.critical/total)*width);
      return `<div style=\"display:flex;align-items:center;gap:8px;margin:6px 0\">
        <div style=\"width:160px;font-size:12px\">Distribuição de saúde</div>
        <svg width=\"${width}\" height=\"12\" xmlns=\"http://www.w3.org/2000/svg\">
          <rect x=\"0\" y=\"2\" width=\"${okW}\" height=\"8\" fill=\"#10b981\" />
          <rect x=\"${okW}\" y=\"2\" width=\"${highW}\" height=\"8\" fill=\"#f59e0b\" />
          <rect x=\"${okW+highW}\" y=\"2\" width=\"${critW}\" height=\"8\" fill=\"#dc2626\" />
        </svg>
        <div style=\"font-size:12px\">OK ${healthCounts.okP}% • Alto ${healthCounts.highP}% • Crítico ${healthCounts.critP}%</div>
      </div>`;
    })();
    const rows = sortedSubnets.map((s) => {
      const st = stats.find(x => x.id === s.id);
      const cap = capacityFromCidr(s.cidr);
      const used = st?.usageCount || 0;
      const occ = occupancy(used, cap);
      const hl = health(occ);
      const siteName = s.siteId ? (sites.find(x => x.id === s.siteId)?.name || '') : '';
      const vlanLabel = s.vlanId ? (() => {
        const v = vlans.find(x => x.id === s.vlanId);
        return v ? `VLAN ${v.number} — ${v.name}` : '';
      })() : '';
      return `<tr>
        <td>${s.name}</td>
        <td>${s.cidr}</td>
        <td>${siteName || '—'}</td>
        <td>${vlanLabel || '—'}</td>
        <td>${cap}</td>
        <td>${used}</td>
        <td>${occ}%</td>
       </tr>`;
    }).join('');
    const addressesSection = sortedSubnets.map((s) => {
      const addrs = addrMap.get(s.id) || [];
      if (!addrs.length) return '';
      return `
        <div class=\"section\">
          <div class=\"subnet-title\">Endereços — ${s.name} <span class=\"muted\">(${s.cidr})</span></div>
          <table class=\"zebra tight\">
            <thead><tr><th>IP</th><th>Hostname</th></tr></thead>
            <tbody>
              ${addrs.map(a => `<tr><td>${a.address}</td><td>${a.hostname || ''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Relatório IPAM - ${companyName}</title>
          ${styles}
        </head>
        <body>
          <div class=\"container\"> 
            <div class=\"header\">
              <div style=\"display:flex;align-items:center;gap:12px;\">
                ${companyLogo ? `<img src=\"${companyLogo}\" class=\"logo\" alt=\"Logo da empresa\" />` : ''}
                <div>
                  <h1>Relatório de IPAM</h1>
                  <div style=\"font-size:12px;color:#374151\">Empresa: <strong>${companyName}</strong></div>
                </div>
              </div>
              <div class=\"powered\">
                <span>Powered by</span>
                <img src=\"/logo.svg\" class=\"logo\" alt=\"Tech Hub\" />
              </div>
            </div>
            <div class=\"section\">
              <h2>1. Cabeçalho e Introdução</h2>
              <p>${intro}</p>
            </div>
            <div class=\"section\">
              <h2>2. Resumo Geral</h2>
              <div class=\"cards\">
                <div class=\"card\"><div class=\"big\">${subnets.length}</div><div class=\"muted\">Subnets</div></div>
                <div class=\"card\"><div class=\"big\">${totalUsed}</div><div class=\"muted\">IPs usados</div></div>
                <div class=\"card\"><div class=\"big\">${avgOcc}%</div><div class=\"muted\">Ocupação média</div></div>
              </div>
              <h3 style=\"margin-top:12px\">Top 10 por ocupação</h3>
              <div class=\"chart\">${chartBars || '<div class=\"muted\">Sem dados.</div>'}</div>
              
            </div>
            <div class=\"page-break\"></div>
            <div class=\"section\">
              <h2>3. Subnets</h2>
            <table>
              <thead>
                <tr><th>Subnet</th><th>CIDR</th><th>Site</th><th>VLAN</th><th>Capacidade</th><th>Usados</th><th>Ocupação</th></tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan=\"8\">Nenhum subnet cadastrado.</td></tr>`}
              </tbody>
            </table>
            </div>
            <div class=\"page-break\"></div>
            <div class=\"section\">
              <h2>4. Endereços Cadastrados por Subnet</h2>
              <div class=\"addresses-wrap\">${addressesSection || '<div class=\"muted\">Sem endereços cadastrados.</div>'}</div>
            </div>
            <script>window.onload=function(){window.focus();setTimeout(function(){window.print();},300);};</script>
          </div>
        </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (!w) { alert('Bloqueio de pop-ups impediu abrir o PDF.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function occupancy(used: number, cap: number): number {
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((used / cap) * 100));
  }

  function health(occ: number): 'OK' | 'Alto' | 'Crítico' {
    if (occ >= 90) return 'Crítico';
    if (occ >= 70) return 'Alto';
    return 'OK';
  }

  function recommendMask(expectedHosts: number): number {
    const target = Math.ceil(expectedHosts * 1.2) + 2;
    const power = Math.ceil(Math.log2(Math.max(2, target)));
    const hosts = Math.pow(2, power);
    const mask = 32 - power;
    return Math.max(0, Math.min(32, mask));
  }

  function ipToInt(ip: string): number {
    const p = ip.split('.').map((x) => Number(x));
    if (p.length !== 4 || p.some((v) => !Number.isFinite(v))) return 0;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }

  function parseCidr(c: string) {
    const parts = String(c || '').split('/');
    const ip = parts[0] || '0.0.0.0';
    const mask = Number(parts[1] || '0');
    return { ipInt: ipToInt(ip), mask: Number.isFinite(mask) ? mask : 0, raw: c };
  }

  function toggleSort(col: 'name'|'cidr'|'description'|'site'|'vlan') {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  const sortedSubnets = [...subnets].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') {
      const av = String(a.name || '');
      const bv = String(b.name || '');
      cmp = av.localeCompare(bv);
    } else if (sortBy === 'description') {
      const av = String(a.description || '');
      const bv = String(b.description || '');
      cmp = av.localeCompare(bv);
    } else if (sortBy === 'site') {
      const an = a.siteId ? (sites.find(x => x.id === a.siteId)?.name || '') : '';
      const bn = b.siteId ? (sites.find(x => x.id === b.siteId)?.name || '') : '';
      cmp = an.localeCompare(bn);
    } else if (sortBy === 'vlan') {
      const av = a.vlanId ? vlans.find(x => x.id === a.vlanId) : undefined;
      const bv = b.vlanId ? vlans.find(x => x.id === b.vlanId) : undefined;
      if (av && bv) {
        if (av.number !== bv.number) cmp = av.number - bv.number; else cmp = String(av.name || '').localeCompare(String(bv.name || ''));
      } else if (av && !bv) cmp = 1; else if (!av && bv) cmp = -1; else cmp = 0;
    } else {
      const pa = parseCidr(String(a.cidr || ''));
      const pb = parseCidr(String(b.cidr || ''));
      if (pa.ipInt === pb.ipInt) cmp = pa.mask - pb.mask; else cmp = pa.ipInt - pb.ipInt;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  async function startEditSubnet(s: Subnet) {
    router.push(`/ipam/subnets/${s.id}`);
  }

  async function saveEditSubnet() {
    if (!token || !editingId) return;
    await apiPut(`/ipam/subnets/${editingId}`, token, { name: editName, description: editDescription || undefined });
    const res = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(res)) setSubnets(res);
    const st = await apiGet<SubnetStats[]>(`/ipam/subnets-stats?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(st)) setStats(st);
    setEditingId('');
    setEditName('');
    setEditDescription('');
  }

  async function deleteSubnet(id: string) {
    if (!token) return;
    await apiDelete(`/ipam/subnets/${id}`, token);
    const res = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(res)) setSubnets(res);
    const st = await apiGet<SubnetStats[]>(`/ipam/subnets-stats?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(st)) setStats(st);
    if (editingId === id) {
      setEditingId('');
      setEditName('');
      setEditDescription('');
    }
  }

  async function generatePlan() {
    if (!token || !siteId || !planBase) return;
    const expectations: Record<string, number> = {};
    vlans.forEach((v) => {
      const val = Number(vlanExpectations[v.id] || '');
      if (Number.isFinite(val) && val > 0) expectations[v.id] = val;
    });
    const res = await apiPost<{ ok: boolean; data?: { base: string; suggestions: any[] } }>(`/ipam/plan`, token, { siteId, baseCidr: planBase, expectations });
    if (res && (res as any).ok && (res as any).data) setPlanResult((res as any).data.suggestions || []);
  }

  async function applyPlan() {
    if (!token || !companyId || planResult.length === 0) return;
    for (const s of planResult) {
      if (!s.suggestedCidr || s.conflict) continue;
      const name = `VLAN ${s.vlanNumber} — ${s.vlanName}`;
      await apiPost(`/ipam/subnets`, token, { companyId, siteId: siteId || undefined, vlanId: s.vlanId, name, cidr: s.suggestedCidr });
    }
    const res = await apiGet<Subnet[]>(`/ipam/subnets?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(res)) setSubnets(res);
    const st = await apiGet<SubnetStats[]>(`/ipam/subnets-stats?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(st)) setStats(st);
    setPlanResult([]);
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">IPAM</h1>
        <div className="relative">
          <button onClick={() => setExportOpen((v)=>!v)} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">Exportar</button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-lg border border-border bg-white shadow">
              <button onClick={() => { setExportOpen(false); exportPDF(); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50">PDF</button>
              <button onClick={() => { setExportOpen(false); exportCSV(); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50">CSV</button>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded p-4">
          <div className="mb-3">
            <label className="block text-sm mb-1">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Selecione...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {isAdminOrTech && (
          <div className="mb-3">
            <label className="block text-sm mb-1">Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Opcional</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          )}
          {isAdminOrTech && (
          <div className="mb-3">
            <label className="block text-sm mb-1">VLAN</label>
            <select value={vlanId} onChange={(e) => setVlanId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Opcional</option>
              {vlans.map((v) => (
                <option key={v.id} value={v.id}>VLAN {v.number} — {v.name}</option>
              ))}
            </select>
          </div>
          )}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Nome do Subnet</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: Datacenter VLAN 10" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">CIDR</label>
            <input value={cidr} onChange={(e) => setCidr(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Ex.: 192.168.10.0/24" />
          </div>)}
          {isAdminOrTech && (<div className="mb-3">
            <label className="block text-sm mb-1">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-border rounded px-2 py-2" placeholder="Opcional" />
          </div>)}
          {isAdminOrTech && (<button onClick={onCreate} disabled={loading || !companyId || !name || !cidr} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50">{loading ? 'Salvando...' : 'Criar Subnet'}</button>)}
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Subnets</h2></div>
          {sortedSubnets.length === 0 ? (
            <div className="text-sm text-muted">Nenhum subnet cadastrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('name')}>Nome {sortBy==='name' ? (sortDir==='asc' ? '↑' : '↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('cidr')}>CIDR {sortBy==='cidr' ? (sortDir==='asc' ? '↑' : '↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('site')}>Site {sortBy==='site' ? (sortDir==='asc' ? '↑' : '↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('vlan')}>VLAN {sortBy==='vlan' ? (sortDir==='asc' ? '↑' : '↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('description')}>Descrição {sortBy==='description' ? (sortDir==='asc' ? '↑' : '↓') : ''}</th>
                  {isAdminOrTech && <th className="py-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {sortedSubnets.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className="py-2"><a href={`/ipam/subnets/${s.id}`} className="text-primary underline">{s.name}</a></td>
                    <td className="py-2">{s.cidr}</td>
                    <td className="py-2">{s.siteId ? (sites.find(x => x.id === s.siteId)?.name || '—') : '—'}</td>
                    <td className="py-2">{s.vlanId ? (() => { const v = vlans.find(x => x.id === s.vlanId); return v ? `VLAN ${v.number} — ${v.name}` : '—'; })() : '—'}</td>
                    <td className="py-2">{s.description || ''}</td>
                    {isAdminOrTech && (
                      <td className="py-2 space-x-2">
                        <button onClick={() => startEditSubnet(s)} className="px-2 py-1 bg-primary text-white rounded">Editar</button>
                        <button onClick={() => deleteSubnet(s.id)} className="px-2 py-1 bg-red-600 text-white rounded">Excluir</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isAdminOrTech && editingId && (
        <div className="mt-4 bg-card border border-border rounded p-4">
          <div className="font-semibold mb-2">Editar Subnet</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1">Nome</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <div>
              <label className="block text-sm mb-1">Descrição</label>
              <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={saveEditSubnet} className="px-4 py-2 bg-primary text-white rounded">Salvar</button>
              <button onClick={() => { setEditingId(''); setEditName(''); setEditDescription(''); }} className="px-4 py-2 bg-border text-text rounded">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 bg-card border border-border rounded p-4">
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Planejamento e Ocupação</h2></div>
        {stats.length === 0 ? (
          <div className="text-sm text-muted">Sem dados de ocupação.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-2">Subnet</th>
                <th className="py-2">Capacidade</th>
                <th className="py-2">Usados</th>
                <th className="py-2">Ocupação</th>
                <th className="py-2">Saúde</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const cap = capacityFromCidr(s.cidr);
                const occ = occupancy(s.usageCount || 0, cap);
                return (
                  <tr key={s.id} className="border-b border-border">
                    <td className="py-2">{s.name} <span className="text-muted">({s.cidr})</span></td>
                    <td className="py-2">{cap}</td>
                    <td className="py-2">{s.usageCount || 0}</td>
                    <td className="py-2">
                      <div className="w-full h-2 bg-border rounded">
                        <div className={`h-2 rounded ${occ >= 90 ? 'bg-red-600' : occ >= 70 ? 'bg-yellow-500' : 'bg-green-600'}`} style={{ width: `${occ}%` }} />
                      </div>
                      <div className="text-xs text-muted mt-1">{occ}%</div>
                    </td>
                    <td className="py-2">{health(occ)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      
    </div>
  );
}
