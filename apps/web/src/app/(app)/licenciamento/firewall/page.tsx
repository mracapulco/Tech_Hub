"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Company = { id: string; name: string };
type Site = { id: string; name: string };
type Lic = { id: string; companyId: string; siteId?: string | null; ipAddressId?: string | null; vendor: string; model: string; serial: string; licenseName: string; expiresAt: string; notes?: string | null };
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
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);

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
      if (!token || !companyId) { setSites([]); setSiteId(''); setList([]); return; }
      const s = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
      if (Array.isArray(s)) setSites(s);
      const l = await apiGet<Lic[]>(`/licensing/firewall?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
      if (Array.isArray(l)) setList(l);
      const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
      setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
      setIpAddressId('');
    })();
  }, [token, companyId, siteId]);

  const createLic = async () => {
    if (!token || !companyId || !model || !serial || !licenseName || !expiresAt) return;
    await apiPost(`/licensing/firewall`, token, { companyId, siteId: siteId || undefined, vendor, model, serial, licenseName, expiresAt, notes: notes || undefined, ipAddressId: ipAddressId || undefined });
    setModel(''); setSerial(''); setLicenseName(''); setExpiresAt(''); setNotes('');
    const l = await apiGet<Lic[]>(`/licensing/firewall?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
    if (Array.isArray(l)) setList(l);
    setAddresses([]); setIpAddressId('');
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
                <label className="block text-sm mb-1">Licença</label>
                <input value={licenseName} onChange={(e) => setLicenseName(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
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
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Licenças</h2></div>
          {list.length === 0 ? (
            <div className="text-sm text-muted">Nenhum registro.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Fornecedor</th>
                  <th className="py-2">Modelo</th>
                  <th className="py-2">Serial</th>
                  <th className="py-2">Licença</th>
                  <th className="py-2">Vencimento</th>
                  <th className="py-2">Dias</th>
                  {isAdminOrTech && <th className="py-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
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
                      {isAdminOrTech && (
                        <td className="py-2 space-x-2">
                          <a href={`/licenciamento/firewall/${l.id}`} className="px-2 py-1 bg-primary text-white rounded">Editar</a>
                          <button onClick={() => removeLic(l.id)} className="px-2 py-1 bg-red-600 text-white rounded">Excluir</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
