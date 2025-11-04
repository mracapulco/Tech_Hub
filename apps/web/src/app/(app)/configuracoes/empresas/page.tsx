"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

export default function EmpresasPage() {
  const [form, setForm] = useState({
    cnpj: "",
    name: "",
    fantasyName: "",
    address: "",
    city: "",
    state: "",
    zipcode: "",
    phone: "",
    logoUrl: "",
  });
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  async function handleLookup() {
    setMsg(null);
    const digits = onlyDigits(form.cnpj);
    if (!digits || digits.length !== 14) {
      setMsg({ type: "error", text: "Informe um CNPJ válido com 14 dígitos." });
      return;
    }
    const token = getToken();
    if (!token) {
      setMsg({ type: "error", text: "Sessão expirada. Faça login novamente." });
      return;
    }
    setLoadingLookup(true);
    const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/companies/cnpj/${digits}`, token);
    setLoadingLookup(false);
    if (!res?.ok) {
      setMsg({ type: "error", text: res?.error || "Não foi possível buscar dados pelo CNPJ." });
      return;
    }
    const data = res.data || {};
    setForm((f) => ({
      ...f,
      cnpj: digits,
      name: data.name || f.name,
      fantasyName: data.fantasyName || f.fantasyName,
      address: data.address || f.address,
      city: data.city || f.city,
      state: data.state || f.state,
      zipcode: data.zipcode || f.zipcode,
      phone: data.phone || f.phone,
    }));
    setMsg({ type: "success", text: "Dados pré-preenchidos com base no CNPJ." });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const token = getToken();
    if (!token) {
      setMsg({ type: "error", text: "Sessão expirada. Faça login novamente." });
      return;
    }
    if (!form.name?.trim()) {
      setMsg({ type: "error", text: "O campo Nome (Razão Social) é obrigatório." });
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      cnpj: form.cnpj ? onlyDigits(form.cnpj) : undefined,
    };
    const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/companies`, token, payload);
    setSaving(false);
    if (!res?.ok) {
      setMsg({ type: "error", text: res?.error || "Erro ao salvar empresa." });
      return;
    }
    setMsg({ type: "success", text: "Empresa cadastrada com sucesso." });
    setForm({ cnpj: "", name: "", fantasyName: "", address: "", city: "", state: "", zipcode: "", phone: "", logoUrl: "" });
    // Atualiza listagem e fecha formulário
    await fetchCompanies();
    setShowForm(false);
  }

  async function fetchCompanies() {
    setListMsg(null);
    const token = getToken();
    if (!token) {
      setListMsg("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingList(true);
    const res = await apiGet<{ ok: boolean; data?: any[]; error?: string }>(`/companies`, token);
    setLoadingList(false);
    if (!res?.ok) {
      setListMsg(res?.error || "Falha ao carregar empresas.");
      return;
    }
    setCompanies(res.data || []);
  }

  async function fetchIsAdmin() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string }[];
      setIsAdmin(memberships.some((m) => m.role === 'ADMIN'));
    } catch {
      // Se falhar, mantém não-admin por segurança
      setIsAdmin(false);
    }
  }

  // Carrega lista ao abrir a página
  // e mantém o formulário fechado até clicar em "Nova Empresa"
  // para priorizar visualização das empresas
  // (layout protegido já garante autenticação)
  useEffect(() => {
    fetchCompanies();
    fetchIsAdmin();
  }, []);

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="mt-2 text-gray-600">Visualize e cadastre empresas com busca automática por CNPJ.</p>
        </div>
        {isAdmin && (
          <Link
            href="/configuracoes/empresas/nova"
            className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Nova Empresa
          </Link>
        )}
      </div>

      {/* Formulário inline removido: criação agora em página dedicada */}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Empresas cadastradas</h2>
          <button
            type="button"
            onClick={fetchCompanies}
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
          >
            Atualizar lista
          </button>
        </div>
        {listMsg && <p className="mt-2 text-sm text-red-600">{listMsg}</p>}
        {loadingList ? (
          <p className="mt-4 text-gray-600">Carregando...</p>
        ) : companies.length === 0 ? (
          <p className="mt-4 text-gray-600">Nenhuma empresa cadastrada.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border bg-white">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Logo</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Nome Fantasia</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Usuários</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Estado</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Cidade</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Telefone</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-4 py-2 text-sm">
                      {c.logoUrl ? (
                        <img
                          src={imgUrl(c.logoUrl)}
                          alt={c.fantasyName || c.name || 'Logo'}
                          className="h-10 w-10 object-contain"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-100 border"></div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">{c.fantasyName || '-'}</td>
                    <td className="px-4 py-2 text-sm">{typeof c.membershipsCount === 'number' ? c.membershipsCount : 0}</td>
                    <td className="px-4 py-2 text-sm">{c.state || '-'}</td>
                    <td className="px-4 py-2 text-sm">{c.city || '-'}</td>
                    <td className="px-4 py-2 text-sm">{c.phone || '-'}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link href={`/configuracoes/empresas/${c.id}`} className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700">
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}