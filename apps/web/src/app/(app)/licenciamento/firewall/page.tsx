"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiUpload } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Company = { id: string; name: string };
type Site = { id: string; name: string };
type Lic = { id: string; companyId: string; siteId?: string | null; ipAddressId?: string | null; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string | null; licenseFileUrl?: string | null; expiresAt: string; notes?: string | null };
type Brand = { id: string; name: string };
type IpAddr = { id: string; address: string; hostname?: string | null; subnetName?: string; cidr?: string };

export default function FirewallLicPage() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [list, setList] = useState<Lic[]>([]);
  const [addresses, setAddresses] = useState<IpAddr[]>([]);
  const [ipAddressId, setIpAddressId] = useState('');
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [licenseName, setLicenseName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseFileUrl, setLicenseFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sortBy, setSortBy] = useState<'vendor'|'model'|'serial'|'licenseName'|'expiresAt'|'days'>('expiresAt');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          setIsAdminOrTech(memberships.some((m) => m.role === 'ADMIN' || m.role === 'TECHNICIAN'));
        } catch {}
      }
      const comps = await apiGet<{ ok: boolean; data: any[] }>(`/companies`, token);
      if (comps?.ok) setCompanies(comps.data.map((c: any) => ({ id: c.id, name: c.name })));

      try {
        const dtypes = await apiGet<{ ok: boolean; data: any[] }>(`/device-types`, token);
        const firewallType = (dtypes?.data || []).find((t: any) => String(t.name).toLowerCase() === 'firewall');
        if (firewallType?.id) {
          const bres = await apiGet<{ ok: boolean; data: any[] }>(`/brands?deviceTypeId=${firewallType.id}`, token);
          if (bres?.ok) setBrands((bres.data || []).map((b: any) => ({ id: b.id, name: b.name })));
        }
      } catch {}
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (companyId) {
        const s = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
        if (Array.isArray(s)) setSites(s);
        const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
        setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
        setIpAddressId('');
      } else {
        setSites([]); setSiteId(''); setAddresses([]); setIpAddressId('');
      }
      const path = companyId ? `/licensing/firewall?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}` : `/licensing/firewall`;
      const l = await apiGet<Lic[]>(path, token);
      if (Array.isArray(l)) setList(l);
    })();
  }, [token, companyId, siteId]);

  const createLic = async () => {
    if (!token || !companyId || !model || !serial || !licenseName || !expiresAt) return;
    await apiPost(`/licensing/firewall`, token, { companyId, siteId: siteId || undefined, vendor, model, serial, licenseName, licenseNumber: licenseNumber || undefined, licenseFileUrl: licenseFileUrl || undefined, expiresAt, notes: notes || undefined, ipAddressId: ipAddressId || undefined });
    setModel(''); setSerial(''); setLicenseName(''); setLicenseNumber(''); setLicenseFileUrl(''); setExpiresAt(''); setNotes('');
    const l = await apiGet<Lic[]>(`/licensing/firewall?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(l)) setList(l);
    setAddresses([]); setIpAddressId('');
  };

  const onUploadPdf = async (file?: File) => {
    if (!token || !file) return;
    if (file.type.toLowerCase() !== 'application/pdf') { alert('Envie apenas PDF.'); return; }
    setUploading(true);
    try {
      const res = await apiUpload('/uploads/pdf', token, file);
      if (res?.ok && res.path) setLicenseFileUrl(res.path);
    } finally { setUploading(false); }
  };

  const removeLic = async (id: string) => {
    if (!token) return;
    await apiDelete(`/licensing/firewall/${id}`, token);
    const l = await apiGet<Lic[]>(`/licensing/firewall?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(l)) setList(l);
  };

  function daysLeft(d: string): number {
    try { const dt = new Date(d).getTime(); const now = Date.now(); return Math.ceil((dt - now) / (1000*60*60*24)); } catch { return 0; }
  }

  const sorted = (() => {
    const arr = [...list];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortBy === 'days') { av = daysLeft(a.expiresAt); bv = daysLeft(b.expiresAt); }
      else if (sortBy === 'expiresAt') { av = new Date(a.expiresAt).getTime(); bv = new Date(b.expiresAt).getTime(); }
      else { av = (a as any)[sortBy] ?? ''; bv = (b as any)[sortBy] ?? ''; }
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  })();

  const toggleSort = (col: 'vendor'|'model'|'serial'|'licenseName'|'expiresAt'|'days') => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Licenciamento — Firewall</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded p-4">
          <div className="mb-3">
            <label className="block text-sm mb-1">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Selecione...</option>
              {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Opcional</option>
              {sites.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">IP do Firewall</label>
            <select value={ipAddressId} onChange={(e) => setIpAddressId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
              <option value="">Opcional</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>{a.address}{a.hostname ? ` — ${a.hostname}` : ''}{a.subnetName ? ` — ${a.subnetName} (${a.cidr})` : ''}</option>
              ))}
            </select>
          </div>
          {isAdminOrTech && (
            <>
              <div className="mb-3">
                <label className="block text-sm mb-1">Fornecedor</label>
                <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full border border-border rounded px-2 py-2">
                  <option value="">Selecione...</option>
                  {brands.map((b) => (<option key={b.id} value={b.name}>{b.name}</option>))}
                </select>
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Modelo</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Serial</label>
                <input value={serial} onChange={(e) => setSerial(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Tipo da licença</label>
                <input value={licenseName} onChange={(e) => setLicenseName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Número da licença</label>
                <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">PDF da licença</label>
                <input type="file" accept="application/pdf" onChange={(e) => onUploadPdf(e.target.files?.[0])} className="w-full" />
                {licenseFileUrl && (
                  <div className="text-xs mt-1"><a href={`${process.env.NEXT_PUBLIC_API_URL}${licenseFileUrl}`} target="_blank" rel="noreferrer" className="text-primary underline">Abrir PDF</a></div>
                )}
                {uploading && <div className="text-xs text-muted mt-1">Enviando...</div>}
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Vencimento</label>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <div className="mb-3">
                <label className="block text-sm mb-1">Notas</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
              </div>
              <button onClick={createLic} disabled={!companyId || !vendor || !model || !serial || !licenseName || !expiresAt} className="px-4 py-2 bg-primary text-white rounded">Adicionar</button>
            </>
          )}
        </div>

        <div className="md:col-span-2 bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Detalhes</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('vendor')}>Fornecedor {sortBy==='vendor' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('model')}>Modelo {sortBy==='model' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('serial')}>Serial {sortBy==='serial' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('licenseName')}>Tipo da licença {sortBy==='licenseName' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('expiresAt')}>Vencimento {sortBy==='expiresAt' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2 cursor-pointer" onClick={() => toggleSort('days')}>Dias {sortBy==='days' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                  <th className="py-2">Anexo</th>
                  {isAdminOrTech && <th className="py-2">Ações</th>}
              </tr>
            </thead>
            <tbody>
                {sorted.map((l) => {
                  const d = daysLeft(l.expiresAt);
                  const cls = d <= 30 ? 'text-red-600' : d <= 60 ? 'text-yellow-600' : 'text-green-600';
                  return (
                    <tr key={l.id} className="border-b border-border">
                      <td className="py-2">{l.vendor}</td>
                      <td className="py-2">{l.model}</td>
                      <td className="py-2">{l.serial}</td>
                      <td className="py-2">{l.licenseName}</td>
                      <td className="py-2">{new Date(l.expiresAt).toLocaleDateString()}</td>
                      <td className={`py-2 ${cls}`}>{d}</td>
                      <td className="py-2">{l.licenseFileUrl ? <span title="PDF anexado">📎 ✓</span> : '—'}</td>
                      {isAdminOrTech && (
                        <td className="py-2 space-x-2">
                          {l.licenseFileUrl ? (
                            <a href={`${process.env.NEXT_PUBLIC_API_URL}${l.licenseFileUrl}`} target="_blank" rel="noreferrer" className="px-2 py-1 bg-border text-text rounded">Visualizar</a>
                          ) : (
                            <span className="px-2 py-1 bg-border text-muted rounded">Visualizar</span>
                          )}
                          <a href={`/licenciamento/firewall/${l.id}`} className="px-2 py-1 bg-primary text-white rounded">Editar</a>
                          <button onClick={() => removeLic(l.id)} className="px-2 py-1 bg-red-600 text-white rounded">Excluir</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
