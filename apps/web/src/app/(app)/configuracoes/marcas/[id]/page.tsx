"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type Brand = {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  status: string;
  deviceTypes?: { deviceTypeId: string; deviceType: { id: string; name: string } }[];
};

export default function BrandDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Brand | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    if (!token || !id) {
      setError("Sessão expirada. Faça login novamente.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<{ ok: boolean; data?: Brand; error?: string }>(`/brands/${id}`, token);
        if (!res?.ok || !res.data) {
          setError(res?.error || "Marca não encontrada.");
        } else {
          setItem(res.data);
        }
        const user = getUser();
        if (user?.id) {
          const ur = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (ur?.data?.memberships || []) as { role: string }[];
          setIsAdmin(memberships.some((m) => m.role === "ADMIN"));
        } else {
          setIsAdmin(false);
        }
      } catch {
        setError("Falha ao carregar marca.");
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleDelete() {
    const token = getToken();
    if (!token || !id) return;
    if (!window.confirm("Tem certeza que deseja excluir esta marca?")) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/brands/${id}`, token);
      if (!res?.ok) {
        alert(res?.error || "Erro ao excluir marca.");
      } else {
        alert("Marca excluída com sucesso.");
        router.push("/configuracoes/marcas");
      }
    } catch {
      alert("Falha ao comunicar com a API.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Detalhe da Marca</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Voltar</button>
          {isAdmin && (
            <button onClick={handleDelete} disabled={deleting} className="px-3 py-2 rounded bg-error text-white hover:bg-error/90 disabled:opacity-50">
              {deleting ? "Excluindo…" : "Excluir"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4">
        {loading ? (
          <div className="text-sm text-muted">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : item ? (
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 rounded border border-border bg-white flex items-center justify-center overflow-hidden">
              {item.logoUrl ? (
                <img src={imgUrl(item.logoUrl)} alt={item.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted">Nome</label>
                <div className="text-sm">{item.name}</div>
              </div>
              <div>
                <label className="block text-xs text-muted">Status</label>
                <div className="text-sm">{item.status}</div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted">Descrição</label>
                <div className="text-sm text-muted">{item.description || ""}</div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted">Tipos de dispositivo associados</label>
                {item.deviceTypes && item.deviceTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.deviceTypes.map((bt) => (
                      <span key={bt.deviceTypeId} className="px-2 py-0.5 text-xs rounded bg-muted border border-border">
                        {bt.deviceType?.name || "—"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted">Nenhum tipo associado.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-sm">
        <Link href="/configuracoes/marcas" className="underline hover:opacity-80">Voltar para Marcas</Link>
      </div>
    </div>
  );
}