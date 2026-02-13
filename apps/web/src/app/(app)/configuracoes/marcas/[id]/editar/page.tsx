"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DualListSelector from "@/components/DualListSelector";
import { apiGet, apiPut, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type DeviceType = { id: string; name: string; description?: string | null; status: string };

export default function EditBrandPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState<boolean>(false);
  const [form, setForm] = useState<{ name: string; description: string; logoUrl: string; status: string }>({ name: "", description: "", logoUrl: "", status: "ACTIVE" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !id) { setError("Sessão expirada."); setLoading(false); return; }
    (async () => {
      try {
        setLoadingTypes(true);
        const typesRes = await apiGet<{ ok: boolean; data?: DeviceType[]; error?: string }>(`/device-types`, token);
        setLoadingTypes(false);
        setDeviceTypes(typesRes?.data || []);
        const brandRes = await apiGet<{ ok: boolean; data?: any; error?: string }>(`/brands/${id}`, token);
        if (!brandRes?.ok || !brandRes.data) { setError(brandRes?.error || "Marca não encontrada."); }
        else {
          const b = brandRes.data;
          setForm({ name: b.name || "", description: b.description || "", logoUrl: b.logoUrl || "", status: b.status || "ACTIVE" });
          const ids = (b.deviceTypes || []).map((bt: any) => bt.deviceTypeId).filter((s: any) => typeof s === 'string');
          setSelectedIds(ids);
        }
      } catch {
        setError("Falha ao carregar dados.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleSave() {
    const token = getToken();
    if (!token || !id) return;
    if (!form.name.trim()) { alert("Informe um nome."); return; }
    setSaving(true);
    const res = await apiPut<{ ok: boolean; data?: any; error?: string }>(`/brands/${id}`, token, {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
      status: form.status.trim() || "ACTIVE",
      deviceTypeIds: selectedIds,
    });
    setSaving(false);
    if (!res?.ok) { alert(res?.error || "Falha ao atualizar marca."); return; }
    router.push(`/configuracoes/marcas/${id}`);
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Editar marca</h1>
        <Link href={`/configuracoes/marcas/${id}`} className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Voltar</Link>
      </div>

      <div className="bg-card border border-border rounded p-4">
        {loading ? (
          <div className="text-sm text-muted">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted">Nome</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs text-muted">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted">Descrição</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted">Logo (URL) — https://... ou /uploads/...</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.logoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                    className="border border-border rounded px-2 py-1 text-sm w-96"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      const token = getToken();
                      if (!token) { alert('Sessão expirada. Faça login novamente.'); return; }
                      setUploadingLogo(true);
                      const res = await apiUpload('/uploads', token, file);
                      setUploadingLogo(false);
                      if (!res?.ok || !res.path) { alert(res?.error || 'Falha ao enviar logo.'); return; }
                      setForm((f) => ({ ...f, logoUrl: res.path! }));
                    }}
                    className="border border-border rounded px-2 py-1 text-sm"
                  />
                  {uploadingLogo && <span className="text-sm text-muted">Enviando…</span>}
                  {form.logoUrl && (
                    <div className="h-8 w-8 rounded border border-border bg-white flex items-center justify-center overflow-hidden">
                      <img src={imgUrl(form.logoUrl)} alt="Prévia" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-muted mb-1">Tipos de dispositivo</label>
                {loadingTypes ? (
                  <div className="text-sm text-muted">Carregando tipos…</div>
                ) : (
                  <DualListSelector
                    available={deviceTypes.map((t) => ({ id: t.id, name: t.name }))}
                    selectedIds={selectedIds}
                    onChange={setSelectedIds}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button disabled={saving} onClick={handleSave} className="px-3 py-2 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">Salvar</button>
              <Link href={`/configuracoes/marcas/${id}`} className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Cancelar</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}