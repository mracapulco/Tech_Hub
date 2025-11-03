"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type Brand = { id: string; name: string; description?: string | null; logoUrl?: string | null; status: string };
type DeviceType = { id: string; name: string; description?: string | null; status: string };

export default function BrandsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isTech, setIsTech] = useState<boolean>(false);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(true);
  const [items, setItems] = useState<Brand[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [msgList, setMsgList] = useState<string | null>(null);
  const [showNew] = useState<boolean>(false);
  const [savingNew] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit] = useState<boolean>(false);
  const [uploadingLogoNew] = useState<boolean>(false);
  const [uploadingLogoEdit] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) {
      setIsAdmin(false);
      setIsTech(false);
      setLoadingPerms(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
        const memberships = (res?.data?.memberships || []) as { role: string }[];
        setIsAdmin(memberships.some((m) => m.role === "ADMIN"));
        setIsTech(memberships.some((m) => m.role === "TECHNICIAN"));
      } catch {
        setIsAdmin(false);
        setIsTech(false);
      } finally {
        setLoadingPerms(false);
      }
    })();
  }, []);

  const canManage = isAdmin; // somente admins criam/editam/excluem

  async function fetchList() {
    setMsgList(null);
    const token = getToken();
    if (!token) {
      setMsgList("Sessão expirada. Faça login novamente.");
      return;
    }
    setLoadingList(true);
    const res = await apiGet<{ ok: boolean; data?: Brand[]; error?: string }>(`/brands`, token);
    setLoadingList(false);
    if (!res?.ok) {
      setMsgList(res?.error || "Falha ao carregar marcas.");
      return;
    }
    setItems((res.data || []).map((i) => ({ id: i.id, name: i.name, description: i.description || null, logoUrl: (i as any).logoUrl || null, status: i.status })));
  }

  useEffect(() => {
    fetchList();
  }, []);

  // UI de criação/edição movida para telas dedicadas (nova/editar)

  // criação agora é feita em /configuracoes/marcas/nova

  // edição agora é feita em /configuracoes/marcas/[id]/editar

  // atualização removida da tabela; usar tela de edição

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    if (!confirm("Confirma excluir esta marca?")) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/brands/${id}`, token);
    if (!res?.ok) {
      alert(res?.error || "Falha ao excluir marca.");
      return;
    }
    await fetchList();
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Marcas</h1>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Link href="/configuracoes/marcas/nova" className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90">Nova marca</Link>
          </div>
        ) : (
          <div className="text-sm text-muted">Visualização somente (técnicos e clientes)</div>
        )}
      </div>

      {loadingPerms ? (
        <div className="text-sm text-muted">Carregando permissões…</div>
      ) : (
        <div className="bg-card border border-border rounded p-4">
          <div className="text-sm text-muted mb-2">Catálogo simples de marcas: ex. APC, Dell, HP.</div>
          {loadingList ? (
            <div className="text-sm text-muted">Carregando marcas…</div>
          ) : msgList ? (
            <div className="text-sm text-red-600">{msgList}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Logo</th>
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">Descrição</th>
                  <th className="py-2 pr-2">Status</th>
                  {canManage && <th className="py-2 pr-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-2 pr-2">
                      {item.logoUrl ? (
                          <div className="h-8 w-8 rounded border border-border bg-white flex items-center justify-center overflow-hidden">
                            <img src={imgUrl(item.logoUrl)} alt={item.name} className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted border border-border" />
                        )}
                    </td>
                    <td className="py-2 pr-2">
                      <span>{item.name}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className="text-muted">{item.description || ""}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className="text-muted">{item.status}</span>
                    </td>
                    {canManage && (
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <Link href={`/configuracoes/marcas/${item.id}`} className="px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">Visualizar</Link>
                          <Link href={`/configuracoes/marcas/${item.id}/editar`} className="px-2 py-1 rounded bg-muted text-foreground hover:opacity-80">Editar</Link>
                          <button onClick={() => handleDelete(item.id)} className="px-2 py-1 rounded bg-error text-white hover:bg-error/90">Excluir</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="py-3 text-muted">Nenhuma marca cadastrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-4 text-sm">
        <Link href="/configuracoes" className="underline hover:opacity-80">Voltar para Configurações</Link>
      </div>
    </div>
  );
}