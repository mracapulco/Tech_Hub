"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type DeviceType = { id: string; name: string; description?: string | null; status: string };

export default function DeviceTypeDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<DeviceType | null>(null);
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
        const res = await apiGet<{ ok: boolean; data?: DeviceType; error?: string }>(`/device-types/${id}`, token);
        if (!res?.ok || !res.data) {
          setError(res?.error || "Tipo não encontrado.");
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
        setError("Falha ao carregar tipo de dispositivo.");
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleDelete() {
    const token = getToken();
    if (!token || !id) return;
    if (!window.confirm("Tem certeza que deseja excluir este tipo de dispositivo?")) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/device-types/${id}`, token);
      if (!res?.ok) {
        alert(res?.error || "Erro ao excluir tipo.");
      } else {
        alert("Tipo de dispositivo excluído com sucesso.");
        router.push("/configuracoes/tipo-dispositivo");
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
        <h1 className="text-2xl font-semibold">Detalhe do Tipo de Dispositivo</h1>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-sm">
        <Link href="/configuracoes/tipo-dispositivo" className="underline hover:opacity-80">Voltar para Tipos de Dispositivo</Link>
      </div>
    </div>
  );
}