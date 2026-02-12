"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPut, apiDelete, apiUpload, apiPost } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

type Lic = { id: string; companyId: string; siteId?: string | null; ipAddressId?: string | null; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string | null; licenseFileUrl?: string | null; expiresAt: string; notes?: string | null };
type Company = { id: string; name: string };
type Site = { id: string; name: string };
type IpAddr = { id: string; address: string; hostname?: string | null; subnetName?: string; cidr?: string };
type Brand = { id: string; name: string };

export default function FirewallLicEdit({ params }: { params: { id: string } }) {
  const { id } = params;
  const token = typeof window !== 'undefined' ? getToken() : null;
  const user = typeof window !== 'undefined' ? getUser() : null;
  const [lic, setLic] = useState<Lic | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [addresses, setAddresses] = useState<IpAddr[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [ipAddressId, setIpAddressId] = useState('');
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [licenseName, setLicenseName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseFileUrl, setLicenseFileUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (user?.id) {
        try {
          const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (res?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!res?.data?.isGlobalAdmin;
          setIsAdminOrTech(isGlobalAdmin || memberships.some((m) => m.role === 'ADMIN' || m.role === 'TECHNICIAN'));
        } catch {}
      }
      const licData = await apiGet<Lic>(`/licensing/firewall/${id}`, token);
      if (licData && (licData as any).id) {
        setLic(licData);
        setCompanyId((licData as any).companyId);
        setSiteId((licData as any).siteId || '');
        setIpAddressId((licData as any).ipAddressId || '');
        setVendor((licData as any).vendor || '');
        setModel((licData as any).model || '');
        setSerial((licData as any).serial || '');
        setLicenseName((licData as any).licenseName || '');
        setLicenseNumber((licData as any).licenseNumber || '');
        setLicenseFileUrl((licData as any).licenseFileUrl || '');
        setExpiresAt(((licData as any).expiresAt || '').slice(0, 10));
        setNotes((licData as any).notes || '');
      }
      const comps = await apiGet<{ ok: boolean; data: any[] }>(`/companies`, token);
      if (comps?.ok) setCompanies(comps.data.map((c: any) => ({ id: c.id, name: c.name })));
      if (companyId) {
        const s = await apiGet<Site[]>(`/sites?companyId=${companyId}`, token);
        if (Array.isArray(s)) setSites(s);
        const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
        setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
      }
      try {
        const dtypes = await apiGet<{ ok: boolean; data: any[] }>(`/device-types`, token);
        const firewallType = (dtypes?.data || []).find((t: any) => String(t.name).toLowerCase() === 'firewall');
        if (firewallType?.id) {
          const bres = await apiGet<{ ok: boolean; data: any[] }>(`/brands?deviceTypeId=${firewallType.id}`, token);
          if (bres?.ok) setBrands((bres.data || []).map((b: any) => ({ id: b.id, name: b.name })));
        }
      } catch {}
    })();
  }, [token, id, companyId, siteId]);

  const save = async () => {
    if (!token || !lic) return;
    setStatusMsg(null);
    try {
      const res: any = await apiPut(`/licensing/firewall/${lic.id}`, token, {
        siteId: siteId || undefined,
        ipAddressId: ipAddressId || undefined,
        vendor,
        model,
        serial,
        licenseName,
        licenseNumber: licenseNumber || undefined,
        licenseFileUrl: licenseFileUrl || undefined,
        expiresAt,
        notes: notes || undefined,
      });
      if (res?.ok === false) {
        setStatusMsg({ type: 'error', text: res.error || 'Falha ao salvar' });
      } else {
        setStatusMsg({ type: 'success', text: 'Salvo com sucesso' });
      }
      const licData = await apiGet<Lic>(`/licensing/firewall/${id}`, token);
      if (licData && (licData as any).id) setLic(licData);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch {
      setStatusMsg({ type: 'error', text: 'Falha ao salvar' });
    }
  };

  const remove = async () => {
    if (!token || !lic) return;
    await apiDelete(`/licensing/firewall/${lic.id}`, token);
    location.href = '/licenciamento/firewall';
  };

  const onUploadPdf = async (file?: File) => {
    if (!token || !file) return;
    if (file.type.toLowerCase() !== 'application/pdf') return;
    setUploading(true);
    try {
      const res = await apiUpload('/uploads/pdf', token, file);
      if (res?.ok && res.path) setLicenseFileUrl(res.path);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Editar Licença de Firewall</h1>
        <a href={`/licenciamento/firewall/${id}`} className="px-3 py-2 rounded bg-border text-text">Visualizar</a>
      </div>
      {!lic ? (
        <div className="text-sm text-muted">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded p-4">
            {statusMsg && (
              <div className={`mb-3 text-sm ${statusMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{statusMsg.text}</div>
            )}
            <div className="mb-3">
              <label className="block text-sm mb-1">Empresa</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-border rounded px-2 py-2" disabled>
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
                <div className="flex items-center gap-2 text-xs mt-1">
                  <a href={`${process.env.NEXT_PUBLIC_API_URL}${licenseFileUrl}`} target="_blank" rel="noreferrer" className="text-primary underline">Abrir PDF</a>
                  <button
                    onClick={async () => {
                      if (!token || !licenseFileUrl || !lic) return;
                      setRemoving(true);
                      setStatusMsg(null);
                      try {
                        const res = await apiPost<{ ok: boolean; error?: string }>(`/uploads/remove`, token, { path: licenseFileUrl });
                        if (!res?.ok) {
                          setStatusMsg({ type: 'error', text: res?.error || 'Falha ao remover anexo' });
                        } else {
                          await apiPut(`/licensing/firewall/${lic.id}`, token, { licenseFileUrl: null });
                          setLicenseFileUrl('');
                          setStatusMsg({ type: 'success', text: 'Anexo removido' });
                        }
                      } catch {
                        setStatusMsg({ type: 'error', text: 'Falha ao remover anexo' });
                      } finally {
                        setRemoving(false);
                        setTimeout(() => setStatusMsg(null), 3000);
                      }
                    }}
                    className="px-2 py-1 rounded bg-red-600 text-white"
                    disabled={removing}
                  >
                    {removing ? 'Removendo...' : 'Remover PDF'}
                  </button>
                </div>
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
            <div className="flex gap-2">
              <button onClick={save} className="px-4 py-2 bg-primary text-white rounded">Salvar</button>
              <button onClick={remove} className="px-4 py-2 bg-red-600 text-white rounded">Excluir</button>
            </div>
          </div>
          <div className="md:col-span-2 bg-card border border-border rounded p-4">
            <div className="font-semibold mb-3">Resumo</div>
            {(() => {
              const siteName = sites.find((s) => s.id === siteId)?.name || '';
              const ipInfo = addresses.find((a) => a.id === ipAddressId);
              let days = 0;
              try {
                const dt = new Date(expiresAt).getTime();
                const now = Date.now();
                days = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
              } catch { days = 0; }
              const daysCls = days <= 30 ? 'text-red-600' : days <= 60 ? 'text-yellow-600' : 'text-green-600';
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Equipamento</div>
                      <div className="text-sm font-medium">{vendor || '—'} {model || ''}</div>
                      <div className="text-xs text-muted">Serial {serial || '—'}</div>
                      <div className="text-xs text-muted mt-1">{siteName ? `Site ${siteName}` : 'Site —'}</div>
                      <div className="text-xs text-muted">{ipInfo ? `IP ${ipInfo.address}${ipInfo.hostname ? ` — ${ipInfo.hostname}` : ''}` : 'IP —'}</div>
                    </div>
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Licença</div>
                      <div className="text-sm font-medium">{licenseName || '—'}</div>
                      <div className="text-xs text-muted">Número {licenseNumber || '—'}</div>
                      <div className="text-xs text-muted mt-1">Vencimento {expiresAt || '—'}</div>
                    </div>
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Status</div>
                      <div className={`text-2xl font-semibold ${daysCls}`}>{Number.isFinite(days) ? days : 0}</div>
                      <div className="text-xs text-muted">dias restantes</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Anexo</div>
                      {licenseFileUrl ? (
                        <a href={`${process.env.NEXT_PUBLIC_API_URL}${licenseFileUrl}`} target="_blank" rel="noreferrer" className="px-3 py-2 inline-block rounded bg-primary text-white">Abrir PDF</a>
                      ) : (
                        <div className="text-sm text-muted">Nenhum anexo</div>
                      )}
                    </div>
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Notas</div>
                      <div className="text-sm">{notes || '—'}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
