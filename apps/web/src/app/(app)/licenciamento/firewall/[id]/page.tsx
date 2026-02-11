"use client";
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { getToken } from '@/lib/auth';

type Lic = { id: string; companyId: string; siteId?: string | null; ipAddressId?: string | null; vendor: string; model: string; serial: string; licenseName: string; licenseNumber?: string | null; licenseFileUrl?: string | null; expiresAt: string; notes?: string | null };
type Site = { id: string; name: string };
type IpAddr = { id: string; address: string; hostname?: string | null; subnetName?: string; cidr?: string };

export default function FirewallLicView({ params }: { params: { id: string } }) {
  const { id } = params;
  const token = typeof window !== 'undefined' ? getToken() : null;
  const [lic, setLic] = useState<Lic | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [addresses, setAddresses] = useState<IpAddr[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');

  function imgUrl(u?: string | null) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    if (u.startsWith('/uploads')) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
    return u;
  }

  useEffect(() => {
    (async () => {
      if (!token) return;
      const licData = await apiGet<Lic>(`/licensing/firewall/${id}`, token);
      if (licData && (licData as any).id) {
        setLic(licData);
        const s = await apiGet<Site[]>(`/sites?companyId=${(licData as any).companyId}`, token);
        if (Array.isArray(s)) setSites(s);
        const addrs = await apiGet<any[]>(`/ipam/addresses-by-company?companyId=${(licData as any).companyId}${(licData as any).siteId ? `&siteId=${(licData as any).siteId}` : ''}`, token);
        setAddresses((addrs || []).map((a: any) => ({ id: a.id, address: a.address, hostname: a.hostname, subnetName: a.subnetName, cidr: a.cidr })));
        try {
          const comp = await apiGet<{ ok: boolean; data?: any }>(`/companies/${(licData as any).companyId}`, token);
          if (comp?.ok && comp.data) {
            setCompanyLogo(imgUrl(comp.data.logoUrl || ''));
            setCompanyName(comp.data.name || '');
          }
        } catch {}
      }
    })();
  }, [token, id]);

  function exportPDF() {
    if (!lic) return;
    const siteName = lic.siteId ? (sites.find(s => s.id === lic.siteId)?.name || '') : '';
    const ipInfo = lic.ipAddressId ? addresses.find(a => a.id === lic.ipAddressId) : undefined;
    const now = new Date().toLocaleString();
    const API_BASE = (process.env.NEXT_PUBLIC_API_URL as string) || location.origin;
    const cmpLogo = companyLogo || '';
    const cmpName = companyName || '';
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Relatório de Firewall</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .container { max-width: 900px; margin: 0 auto; padding: 24px; }
            .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
            .logo { height: 40px; object-fit: contain; }
            h1 { font-size: 20px; margin: 0; }
            h2 { font-size: 18px; margin: 20px 0 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
            th { background: #f9fafb; text-align: left; }
            .muted { color: #6b7280; font-size: 12px; }
            .section { margin-top: 16px; }
            .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #ffffff; }
            .btn { display: inline-block; padding: 8px 12px; background: #111827; color: #fff; text-decoration: none; border-radius: 6px; font-size: 12px; }
            .page-break { page-break-before: always; }
            @page { margin: 16mm; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div>
                <h1>Relatório de Firewall</h1>
                <div class="muted">Gerado pelo Tech Hub em ${now}</div>
              </div>
              <img class="logo" src="${location.origin}/logo.svg" onerror="this.style.display='none'" />
            </div>
            <div class="section">
              <h2>Resumo</h2>
              <div class="cards">
                <div class="card">
                  <div class="muted">Equipamento</div>
                  <div><strong>${lic.vendor || '—'} ${lic.model || ''}</strong></div>
                  <div class="muted">Serial ${lic.serial || '—'}</div>
                  <div class="muted">${siteName ? 'Site ' + siteName : 'Site —'}</div>
                  <div class="muted">${ipInfo ? ('IP ' + ipInfo.address + (ipInfo.hostname ? ' — ' + ipInfo.hostname : '')) : 'IP —'}</div>
                </div>
                <div class="card">
                  <div class="muted">Licença</div>
                  <div><strong>${lic.licenseName || '—'}</strong></div>
                  <div class="muted">Número ${lic.licenseNumber || '—'}</div>
                  <div class="muted">Vencimento ${new Date(lic.expiresAt).toLocaleDateString()}</div>
                </div>
                <div class="card" style="display:flex;align-items:center;justify-content:center;gap:8px">
                  <div style="width:100%">
                    <div class="muted">Empresa ${cmpName ? '— ' + cmpName : ''}</div>
                    ${cmpLogo ? '<img src="' + cmpLogo + '" alt="Logo da empresa" style="max-height:56px;object-fit:contain;margin-top:6px" />' : '<div style="height:56px;border:1px solid #e5e7eb;border-radius:8px;background:#f3f4f6"></div>'}
                  </div>
                </div>
              </div>
            </div>
            <div class="section">
              <h2>Detalhes</h2>
              <table>
                <tbody>
                  <tr><th>Fornecedor</th><td>${lic.vendor || '—'}</td></tr>
                  <tr><th>Modelo</th><td>${lic.model || '—'}</td></tr>
                  <tr><th>Serial</th><td>${lic.serial || '—'}</td></tr>
                  <tr><th>Tipo da licença</th><td>${lic.licenseName || '—'}</td></tr>
                  <tr><th>Número da licença</th><td>${lic.licenseNumber || '—'}</td></tr>
                  <tr><th>Vencimento</th><td>${new Date(lic.expiresAt).toLocaleDateString()}</td></tr>
                  <tr><th>Notas</th><td>${lic.notes || '—'}</td></tr>
                </tbody>
              </table>
            </div>
            ${lic.licenseFileUrl ? `
              <div class="section page-break">
                <h2>Anexo</h2>
                <iframe src="${API_BASE}${lic.licenseFileUrl}" style="width:100%;height:800px;border:1px solid #e5e7eb;border-radius:8px;"></iframe>
              </div>
            ` : ''}
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) setTimeout(() => w.print(), 300);
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Visualizar Firewall</h1>
        <div className="flex gap-2">
          <a href="/licenciamento/firewall" className="px-3 py-2 rounded bg-border text-text">Voltar</a>
          <a href={`/licenciamento/firewall/${id}/editar`} className="px-3 py-2 rounded bg-primary text-white">Editar</a>
          <button onClick={exportPDF} className="px-3 py-2 rounded bg-border text-text">Exportar PDF</button>
        </div>
      </div>
      {!lic ? (
        <div className="text-sm text-muted">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-card border border-border rounded p-4">
            <div className="font-semibold mb-3">Resumo</div>
            {(() => {
              const siteName = lic.siteId ? (sites.find((s) => s.id === lic.siteId)?.name || '') : '';
              const ipInfo = lic.ipAddressId ? addresses.find((a) => a.id === lic.ipAddressId) : undefined;
              let days = 0;
              try {
                const dt = new Date(lic.expiresAt).getTime();
                const now = Date.now();
                days = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
              } catch { days = 0; }
              const daysCls = days <= 30 ? 'text-red-600' : days <= 60 ? 'text-yellow-600' : 'text-green-600';
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Equipamento</div>
                      <div className="text-sm font-medium">{lic.vendor || '—'} {lic.model || ''}</div>
                      <div className="text-xs text-muted">Serial {lic.serial || '—'}</div>
                      <div className="text-xs text-muted mt-1">{siteName ? `Site ${siteName}` : 'Site —'}</div>
                      <div className="text-xs text-muted">{ipInfo ? `IP ${ipInfo.address}${ipInfo.hostname ? ` — ${ipInfo.hostname}` : ''}` : 'IP —'}</div>
                    </div>
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Licença</div>
                      <div className="text-sm font-medium">{lic.licenseName || '—'}</div>
                      <div className="text-xs text-muted">Número {lic.licenseNumber || '—'}</div>
                      <div className="text-xs text-muted mt-1">Vencimento {new Date(lic.expiresAt).toLocaleDateString()}</div>
                    </div>
                    <div className="border border-border rounded p-3 flex items-center justify-center">
                      <div className="text-xs text-muted mb-2 w-full">Empresa {companyName ? `— ${companyName}` : ''}</div>
                      {companyLogo ? (
                        <div className="w-full flex items-center justify-center">
                          <img src={companyLogo} alt={companyName || 'Logo'} className="max-h-14 object-contain" />
                        </div>
                      ) : (
                        <div className="w-full h-14 border border-border rounded bg-muted" />
                      )}
                    </div>
                    <div className="border border-border rounded p-3">
                      <div className="text-xs text-muted mb-1">Status</div>
                      <div className={`text-2xl font-semibold ${daysCls}`}>{Number.isFinite(days) ? days : 0}</div>
                      <div className="text-xs text-muted">dias restantes</div>
                    </div>
                  </div>
                  <div className="border border-border rounded p-3">
                    <div className="text-xs text-muted mb-1">Notas</div>
                    <div className="text-sm">{lic.notes || '—'}</div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="bg-card border border-border rounded p-4">
            <div className="font-semibold mb-3">Anexo</div>
            {lic.licenseFileUrl ? (
              <iframe src={`${process.env.NEXT_PUBLIC_API_URL}${lic.licenseFileUrl}`} className="w-full h-[480px] border border-border rounded" />
            ) : (
              <div className="text-sm text-muted">Nenhum anexo disponível.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
