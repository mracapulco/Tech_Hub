"use client";
import { useEffect, useState } from 'react';
import { apiGet, apiPut, apiUpload } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';

type Lic = { id: string; companyId: string; siteId?: string | null; ipAddressId?: string | null; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string | null; expiresAt: string; notes?: string | null };
type UploadResp = { ok: boolean; path?: string };
type Site = { id: string; name: string };
type IpAddr = { id: string; address: string; hostname?: string | null; subnetName?: string; cidr?: string };

export default function FirewallLicEdit({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const token = typeof window !== 'undefined' ? getToken() : null;
  const [lic, setLic] = useState<Lic | null>(null);
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [licenseName, setLicenseName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseFileUrl, setLicenseFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [addresses, setAddresses] = useState<IpAddr[]>([]);
  const [ipAddressId, setIpAddressId] = useState('');

  useEffect(() => {
    (async () => {
      if (!token) return;
      const l = await apiGet<Lic>(`/licensing/firewall/${id}`, token);
      if (l) {
        setLic(l);
        setVendor(l.vendor || '');
        setModel(l.model || '');
        setSerial(l.serial || '');
        setLicenseName(l.licenseName || '');
        setLicenseNumber((l as any).licenseNumber || '');
        setLicenseFileUrl((l as any).licenseFileUrl || '');
        setExpiresAt(l.expiresAt ? l.expiresAt.substring(0,10) : '');
        setNotes(l.notes || '');
        setSiteId(l.siteId || '');
        setIpAddressId(l.ipAddressId || '');
        const s = await apiGet<Site[]>(`/sites?companyId=${l.companyId}`, token);
        if (Array.isArray(s)) setSites(s);
        const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${l.companyId}${l.siteId ? `&siteId=${l.siteId}` : ''}`, token);
        setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
      }
    })();
  }, [token, id]);

  useEffect(() => {
    (async () => {
      if (!token || !lic) return;
      const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${lic.companyId}${siteId ? `&siteId=${siteId}` : ''}`, token);
      setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
      if (ipAddressId && !addrs?.some((a: any) => a.id === ipAddressId)) setIpAddressId('');
    })();
  }, [token, lic, siteId]);

  const save = async () => {
    if (!token || !lic) return;
    await apiPut(`/licensing/firewall/${lic.id}`, token, { vendor, model, serial, licenseName, licenseNumber: licenseNumber || undefined, licenseFileUrl: licenseFileUrl || undefined, expiresAt, notes: notes || undefined, siteId: siteId || undefined, ipAddressId: ipAddressId || null });
    router.back();
  };

  const onUploadPdf = async (file?: File) => {
    if (!token || !file) return;
    if (file.type.toLowerCase() !== 'application/pdf') { alert('Envie apenas PDF.'); return; }
    setUploading(true);
    try {
      const res = await apiUpload('/uploads/pdf', token, file) as UploadResp;
      if (res?.ok && res.path) setLicenseFileUrl(res.path);
    } finally { setUploading(false); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Editar Licença — Firewall</h1>
        <button onClick={() => router.back()} className="px-3 py-2 rounded bg-border text-text">Voltar</button>
      </div>
      {!lic ? (
        <div className="text-sm text-muted">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded p-4">
            <div className="mb-3">
              <label className="block text-sm mb-1">Fornecedor</label>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
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
              <label className="block text-sm mb-1">IP do Firewall</label>
              <select value={ipAddressId} onChange={(e) => setIpAddressId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
                <option value="">Opcional</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>{a.address}{a.hostname ? ` — ${a.hostname}` : ''}{a.subnetName ? ` — ${a.subnetName} (${a.cidr})` : ''}</option>
                ))}
              </select>
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
              <label className="block text-sm mb-1">Site</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full border border-border rounded px-2 py-2">
                <option value="">Opcional</option>
                {sites.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm mb-1">Notas</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-border rounded px-2 py-2" />
            </div>
            <button onClick={save} className="px-4 py-2 bg-primary text-white rounded">Salvar</button>
          </div>
          <div className="md:col-span-2 bg-card border border-border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Anexo da licença (PDF)</h2>
              {licenseFileUrl && (
                <a href={`${process.env.NEXT_PUBLIC_API_URL}${licenseFileUrl}`} target="_blank" rel="noreferrer" className="text-primary underline">Abrir em nova aba</a>
              )}
            </div>
            {!licenseFileUrl ? (
              <div className="text-sm text-muted">Nenhum PDF anexado.</div>
            ) : (
              <div className="border border-border rounded overflow-hidden">
                <iframe src={`${process.env.NEXT_PUBLIC_API_URL}${licenseFileUrl}`} title="Licença PDF" className="w-full" style={{ height: 600 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
