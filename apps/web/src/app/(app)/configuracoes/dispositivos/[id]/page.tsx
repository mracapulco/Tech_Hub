"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";

type DeviceType = { id: string; name: string };
type Brand = { id: string; name: string };
type Device = {
  id: string;
  model: string;
  deviceTypeId: string;
  brandId: string;
  uHeight?: number | null;
  isFullDepth?: boolean;
  frontImage?: boolean;
  rearImage?: boolean;
  weight?: number | null;
  weightUnit?: string | null;
  airflow?: string | null;
  consolePorts?: any;
  interfaces?: any;
  moduleBays?: any;
  status?: string;
  deviceType?: DeviceType;
  brand?: Brand;
};

export default function DeviceDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Device | null>(null);
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
        const res = await apiGet<{ ok: boolean; data?: Device; error?: string }>(`/devices/${id}`, token);
        if (!res?.ok || !res.data) {
          setError(res?.error || "Dispositivo não encontrado.");
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
        setError("Falha ao carregar dispositivo.");
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleDelete() {
    const token = getToken();
    if (!token || !id) return;
    if (!window.confirm("Tem certeza que deseja excluir este dispositivo?")) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ ok: boolean; error?: string }>(`/devices/${id}`, token);
      if (!res?.ok) {
        alert(res?.error || "Erro ao excluir dispositivo.");
      } else {
        alert("Dispositivo excluído com sucesso.");
        router.push("/configuracoes/dispositivos");
      }
    } catch {
      alert("Falha ao comunicar com a API.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Detalhes do dispositivo</h1>
        <div className="text-sm">
          <Link href="/configuracoes/dispositivos" className="underline hover:opacity-80">Voltar</Link>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted">Carregando…</div>
      ) : error ? (
        <div className="bg-card border border-border rounded p-4 text-sm">{error}</div>
      ) : item ? (
        <div className="bg-card border border-border rounded p-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted">Modelo</label>
              <div className="text-sm">{item.model}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Tipo</label>
              <div className="text-sm">{item.deviceType?.name || item.deviceTypeId}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Marca</label>
              <div className="text-sm">{item.brand?.name || item.brandId}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Altura (U)</label>
              <div className="text-sm">{typeof item.uHeight === 'number' ? item.uHeight : '—'}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Profundidade total</label>
              <div className="text-sm">{item.isFullDepth ? 'Sim' : 'Não'}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Fluxo de ar</label>
              <div className="text-sm">{item.airflow || '—'}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Peso</label>
              <div className="text-sm">{typeof item.weight === 'number' ? `${item.weight} ${item.weightUnit || 'kg'}` : '—'}</div>
            </div>
            <div>
              <label className="block text-xs text-muted">Status</label>
              <div className="text-sm">{item.status || 'ACTIVE'}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link href={`/configuracoes/dispositivos/${item.id}/editar`} className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90">Editar</Link>
            {isAdmin ? (
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 text-sm">
        <Link href="/configuracoes" className="underline hover:opacity-80">Voltar para Configurações</Link>
      </div>
    </div>
  );
}