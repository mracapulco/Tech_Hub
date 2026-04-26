"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { getToken } from "@/lib/auth";
import Link from "next/link";

export default function BackupOverviewPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ repos: number; proxies: number; cores: number; jobs: number; runs: number } | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const companiesRes = await apiGet<{ ok: boolean; data?: any[] }>(`/companies`, token);
        const companies = Array.isArray(companiesRes?.data) ? companiesRes.data : [];
        const company = companies[0];
        if (!company?.id) {
          setError("Nenhuma empresa encontrada.");
          setLoading(false);
          return;
        }
        const res = await apiGet<{ ok: boolean; data?: any }>(`/backup/overview?companyId=${company.id}`, token);
        if (res?.ok) {
          setData(res.data || { repos: 0, proxies: 0, cores: 0, jobs: 0, runs: 0 });
        } else {
          setError("Falha ao carregar indicadores.");
        }
      } catch {
        setError("Falha ao comunicar com a API.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Backup</h1>
      <p className="mt-2 text-sm text-gray-700">Visão geral do módulo de Backup.</p>

      {error && (<p className="mt-4 text-sm text-error">{error}</p>)}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Repositórios</h2>
            <p className="text-sm font-medium text-gray-600">Total</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : (data?.repos ?? 0)}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Proxies</h2>
            <p className="text-sm font-medium text-gray-600">Total</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : (data?.proxies ?? 0)}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Core</h2>
            <p className="text-sm font-medium text-gray-600">Total</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : (data?.cores ?? 0)}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Jobs</h2>
            <p className="text-sm font-medium text-gray-600">Total</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : (data?.jobs ?? 0)}</div>
        </section>
        <section className="p-4 bg-card border border-border rounded shadow flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Execuções (30d)</h2>
            <p className="text-sm font-medium text-gray-600">Total</p>
          </div>
          <div className="text-3xl font-bold text-primary">{loading ? "-" : (data?.runs ?? 0)}</div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/gestao/backup/repositorios" className="p-4 bg-card border border-border rounded shadow text-primary">Gerir Repositórios</Link>
        <Link href="/gestao/backup/proxies" className="p-4 bg-card border border-border rounded shadow text-primary">Gerir Proxies</Link>
        <Link href="/gestao/backup/rotinas" className="p-4 bg-card border border-border rounded shadow text-primary">Ver Rotinas</Link>
      </div>
    </main>
  );
}
