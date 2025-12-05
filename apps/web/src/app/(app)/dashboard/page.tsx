"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { getToken } from "@/lib/auth";

type UsersListResponse = { ok: boolean; data?: any[]; error?: string };
type CompaniesListResponse = { ok: boolean; data?: any[]; error?: string };
type MaturityListResponse = { ok: boolean; data?: any[]; error?: string };

export default function DashboardPage() {
  const [usersCount, setUsersCount] = useState<number>(0);
  const [companiesCount, setCompaniesCount] = useState<number>(0);
  const [maturityTestsCount, setMaturityTestsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ipamTotals, setIpamTotals] = useState<{ subnets: number; used: number; capacity: number; occupancy: number }>({ subnets: 0, used: 0, capacity: 0, occupancy: 0 });
  const [topSubnets, setTopSubnets] = useState<Array<{ name: string; cidr: string; occ: number }>>([]);
  const [zabbixConfigured, setZabbixConfigured] = useState<number>(0);
  const [upcomingFw, setUpcomingFw] = useState<Array<{ vendor: string; model: string; serial: string; days: number; expiresAt: string; company: string }>>([]);

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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoading(true);
    Promise.all([
      apiGet<UsersListResponse>("/users", token),
      apiGet<CompaniesListResponse>("/companies", token),
      apiGet<MaturityListResponse>("/maturity", token),
    ]).then(async ([usersRes, companiesRes, maturityRes]) => {
        const uCount = usersRes.ok && Array.isArray(usersRes.data) ? usersRes.data.length : 0;
        const cCount = companiesRes.ok && Array.isArray(companiesRes.data) ? companiesRes.data.length : 0;
        setUsersCount(uCount);
        setCompaniesCount(cCount);
        const mCount = maturityRes.ok && Array.isArray(maturityRes.data) ? maturityRes.data.length : 0;
        setMaturityTestsCount(mCount);
        if (!usersRes.ok || !companiesRes.ok || !maturityRes.ok) {
          setError(usersRes.error || companiesRes.error || maturityRes.error || "Falha ao carregar indicadores");
        } else {
          setError(null);
        }
        try {
          const companies = (companiesRes.data || []) as any[];
          let totalSubnets = 0;
          let totalUsed = 0;
          let totalCapacity = 0;
          const topMap = new Map<string, { name: string; cidr: string; occ: number }>();
          let zCfg = 0;
          const fwList: Array<{ vendor: string; model: string; serial: string; days: number; expiresAt: string; company: string }> = [];
          const seenFw = new Set<string>();
          const daysLeft = (d: string) => { try { const dt = new Date(d).getTime(); const now = Date.now(); return Math.ceil((dt - now) / (1000*60*60*24)); } catch { return 0; } };
          for (const comp of companies) {
            const statsRes = await apiGet<any[]>(`/ipam/subnets-stats?companyId=${comp.id}`, token);
            const statsList = Array.isArray(statsRes) ? statsRes : [];
            totalSubnets += statsList.length;
            for (const s of statsList) {
              const cap = capacityFromCidr(s.cidr);
              const used = s.usageCount || 0;
              totalCapacity += cap;
              totalUsed += used;
              const occ = cap > 0 ? Math.round((used / cap) * 100) : 0;
              const key = `${String(s.name).trim().toUpperCase()}|${s.cidr}`;
              const existing = topMap.get(key);
              if (!existing || occ > existing.occ) topMap.set(key, { name: s.name, cidr: s.cidr, occ });
            }
            const cfgRes = await apiGet<{ ok: boolean; data?: any }>(`/integrations/zabbix/config?companyId=${comp.id}`, token);
            if (cfgRes?.ok && cfgRes.data?.url) zCfg += 1;
            const fwRes = await apiGet<any[]>(`/licensing/firewall?companyId=${comp.id}`, token);
            const items = Array.isArray(fwRes) ? fwRes : [];
            for (const lic of items) {
              const key = String(lic.serial).trim().toUpperCase();
              if (seenFw.has(key)) continue;
              seenFw.add(key);
              const d = daysLeft(lic.expiresAt);
              fwList.push({ vendor: lic.vendor, model: lic.model, serial: lic.serial, days: d, expiresAt: lic.expiresAt, company: (comp.fantasyName || comp.name) });
            }
          }
          const uniques = Array.from(topMap.values()).sort((a, b) => b.occ - a.occ).slice(0, 5);
          setTopSubnets(uniques);
          const occAvg = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
          setIpamTotals({ subnets: totalSubnets, used: totalUsed, capacity: totalCapacity, occupancy: occAvg });
          setZabbixConfigured(zCfg);
          fwList.sort((a, b) => a.days - b.days);
          setUpcomingFw(fwList.slice(0, 10));
        } catch {}
      })
      .catch(() => setError("Falha ao comunicar com a API."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Dashboard principal</h1>
      <p className="mt-2 text-sm text-gray-700">Aqui você verá um resumo de cada módulo.</p>

      {error && (
        <p className="mt-4 text-sm text-error">{error}</p>
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Usuários</h2>
            <p className="text-sm font-medium text-gray-600">Total cadastrado</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : usersCount}</div>
        </section>

        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Empresas</h2>
            <p className="text-sm font-medium text-gray-600">Total cadastrado</p>
          </div>
          <div className="text-3xl font-bold text-success">{loading ? "-" : companiesCount}</div>
        </section>

        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Teste de maturidade</h2>
            <p className="text-sm font-medium text-gray-600">Total registrado</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : maturityTestsCount}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow">
          <h2 className="font-semibold mb-2">IPAM — Resumo</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xl font-semibold">{ipamTotals.subnets}</div>
              <div className="text-xs text-muted">Subnets</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{ipamTotals.used}</div>
              <div className="text-xs text-muted">IPs usados</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{ipamTotals.occupancy}%</div>
              <div className="text-xs text-muted">Ocupação média</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-medium mb-1">Top por ocupação</div>
            {topSubnets.length === 0 ? (
              <div className="text-xs text-muted">Sem dados.</div>
            ) : (
              <div className="space-y-1">
                {topSubnets.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 truncate">{t.name} <span className="text-muted">({t.cidr})</span></div>
                    <div className="w-24 h-2 bg-border rounded">
                      <div className={`h-2 rounded ${t.occ >= 90 ? 'bg-red-600' : t.occ >= 70 ? 'bg-yellow-500' : 'bg-green-600'}`} style={{ width: `${t.occ}%` }} />
                    </div>
                    <div className="w-10 text-right">{t.occ}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Zabbix</h2>
            <p className="text-sm font-medium text-gray-600">Empresas integradas</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : zabbixConfigured}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow max-h-64 overflow-auto">
          <h2 className="font-semibold mb-2">Firewall — próximos a expirar</h2>
          {upcomingFw.length === 0 ? (
            <div className="text-sm text-muted">Nenhum registro.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2">Empresa</th>
                  <th className="py-2">Modelo</th>
                  <th className="py-2">Serial</th>
                  <th className="py-2">Venc.</th>
                  <th className="py-2">Dias</th>
                </tr>
              </thead>
              <tbody>
                {upcomingFw.slice(0,10).map((i, idx) => {
                  const cls = i.days <= 30 ? 'text-red-600' : i.days <= 60 ? 'text-yellow-600' : 'text-green-600';
                  return (
                    <tr key={idx} className="border-b border-border">
                      <td className="py-1">{i.company}</td>
                      <td className="py-1">{i.model}</td>
                      <td className="py-1">{i.serial}</td>
                      <td className="py-1">{new Date(i.expiresAt).toLocaleDateString()}</td>
                      <td className={`py-1 ${cls}`}>{i.days}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/ipam" className="p-4 bg-card border border-border rounded shadow text-primary">Abrir IPAM</a>
        <a href="/ipam/sites" className="p-4 bg-card border border-border rounded shadow text-primary">Gerir Sites</a>
        <a href="/configuracoes/zabbix" className="p-4 bg-card border border-border rounded shadow text-primary">Configurar Zabbix</a>
      </div>
    </main>
  );
}
