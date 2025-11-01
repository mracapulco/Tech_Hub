"use client";

import { useState, useEffect } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

export default function EmpresaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<any>(null);
  const [dependencies, setDependencies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTech, setIsTech] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  async function fetchCompanyDetails() {
    if (!id) return;
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/companies/${id}`, token);
      if (res.ok) {
        setCompany(res.data);
        await computePermissions();
      } else {
        setError(res.error || "Empresa não encontrada.");
      }
    } catch {
      setError("Falha ao carregar dados da empresa.");
    } finally {
      setLoading(false);
    }
  }

  async function computePermissions() {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) return;
    try {
      const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
      const memberships = (res?.data?.memberships || []) as { role: string; companyId: string }[];
      const admin = memberships.some((m) => m.role === 'ADMIN');
      const tech = memberships.some((m) => m.role === 'TECHNICIAN');
      const hasCompany = memberships.some((m) => m.companyId === id);
      setIsAdmin(admin);
      setIsTech(tech);
      setCanEdit(admin || tech || hasCompany);
      setCanDelete(admin);
    } catch {
      setIsAdmin(false);
      setIsTech(false);
      setCanEdit(false);
      setCanDelete(false);
    }
  }

  async function checkDependencies() {
    const token = getToken();
    if (!token || !id) return;
    const res = await apiGet<{ ok: boolean; data?: any }>(`/companies/${id}/dependencies`, token);
    if (res.ok) {
      const deps = res.data;
      if (deps.counts.memberships > 0) {
        setDependencies(deps);
        setConfirmDelete(true); // Abre modal de confirmação com dependências
      } else {
        handleDelete(false); // Exclui direto se não houver dependências
      }
    }
  }

  async function handleDelete(force = false) {
    const token = getToken();
    if (!token || !id) return;

    if (!force && !window.confirm("Tem certeza que deseja excluir esta empresa?")) {
      return;
    }

    setDeleting(true);
    try {
      const url = force ? `/companies/${id}?force=true` : `/companies/${id}`;
      const res = await apiDelete<{ ok: boolean; error?: string }>(url, token);
      if (res.ok) {
        alert("Empresa excluída com sucesso.");
        router.push("/configuracoes/empresas");
      } else {
        alert(res.error || "Erro ao excluir empresa.");
      }
    } catch {
      alert("Falha ao comunicar com a API.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  useEffect(() => {
    fetchCompanyDetails();
  }, [id]);

  if (loading) return <p>Carregando...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!company) return <p>Empresa não encontrada.</p>;

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="mt-2 text-gray-600">{company.fantasyName || company.cnpj}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.back()}
            className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
          >
            Voltar
          </button>
          {canEdit && (
            <Link href={`/configuracoes/empresas/${id}/editar`} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              Editar
            </Link>
          )}
          {canDelete && (
            <button
              onClick={checkDependencies}
              disabled={deleting}
              className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          )}
        </div>
      </div>

      {/* Detalhes da empresa */}
      <div className="mt-6 bg-white p-4 rounded shadow">
        {company.logoUrl && (
          <div className="mb-4">
            <img src={imgUrl(company.logoUrl)} alt="Logo da empresa" className="h-16 w-auto object-contain" />
          </div>
        )}
        <p><strong>Razão Social:</strong> {company.name}</p>
        <p><strong>Nome Fantasia:</strong> {company.fantasyName || '-'}</p>
        <p><strong>CNPJ:</strong> {company.cnpj || '-'}</p>
        <p><strong>Cidade/UF:</strong> {[company.city, company.state].filter(Boolean).join('/') || '-'}</p>
        <p><strong>Endereço:</strong> {company.address || '-'}</p>
        <p><strong>CEP:</strong> {company.zipcode || '-'}</p>
        <p><strong>Telefone:</strong> {company.phone || '-'}</p>
      </div>

      {/* Modal de confirmação de exclusão com dependências */}
      {confirmDelete && dependencies && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-md">
            <h3 className="text-lg font-bold">Atenção: Dependências Encontradas</h3>
            <p className="mt-2">A empresa possui os seguintes itens vinculados:</p>
            <ul className="mt-2 list-disc list-inside">
              {dependencies.items.memberships.map((m: any) => (
                <li key={m.id}>Vínculo com usuário: {m.user?.name ?? m.userId} ({m.role})</li>
              ))}
            </ul>
            <p className="mt-4">Deseja realmente excluir a empresa e todos os seus vínculos?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(false)} className="rounded bg-gray-200 px-4 py-2">
                Cancelar
              </button>
              <button onClick={() => handleDelete(true)} className="rounded bg-red-600 px-4 py-2 text-white">
                Sim, Excluir Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}