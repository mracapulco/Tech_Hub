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
    ])
      .then(([usersRes, companiesRes, maturityRes]) => {
        const uCount = usersRes.ok && Array.isArray(usersRes.data) ? usersRes.data.length : 0;
        const cCount = companiesRes.ok && Array.isArray(companiesRes.data) ? companiesRes.data.length : 0;
        setUsersCount(uCount);
        setCompaniesCount(cCount);
        // Contagem de testes de maturidade via API
        const mCount = maturityRes.ok && Array.isArray(maturityRes.data) ? maturityRes.data.length : 0;
        setMaturityTestsCount(mCount);
        if (!usersRes.ok || !companiesRes.ok || !maturityRes.ok) {
          setError(usersRes.error || companiesRes.error || maturityRes.error || "Falha ao carregar indicadores");
        } else {
          setError(null);
        }
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
      </div>
    </main>
  );
}