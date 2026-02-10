"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DualListSelector from "@/components/DualListSelector";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";

function imgUrl(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/uploads")) return `${process.env.NEXT_PUBLIC_API_URL}${u}`;
  return u;
}

type DeviceType = { id: string; name: string; description?: string | null; status: string };

export default function NewBrandPage() {
  const router = useRouter();
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState<boolean>(false);
  const [form, setForm] = useState<{ name: string; description: string; logoUrl: string }>({ name: "", description: "", logoUrl: "" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    (async () => {
      setLoadingTypes(true);
      const res = await apiGet<{ ok: boolean; data?: DeviceType[]; error?: string }>(`/device-types`, token);
      setLoadingTypes(false);
      if (res?.ok) setDeviceTypes(res.data || []);
    })();
  }, []);

  async function handleSave() {
    const token = getToken();
    if (!token) return;
    if (!form.name.trim()) { alert("Informe um nome."); return; }
    setSaving(true);
    const res = await apiPost<{ ok: boolean; data?: any; error?: string }>(`/brands`, token, {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
      deviceTypeIds: selectedIds,
    });
    setSaving(false);
    if (!res?.ok) { alert(res?.error || "Falha ao criar marca."); return; }
    router.push("/configuracoes/marcas");
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nova marca</h1>
        <Link href="/configuracoes/marcas" className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Voltar</Link>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted">Nome</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="border border-border rounded px-2 py-1 text-sm w-full" />
          </div>
          <div>
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
          <Link href="/configuracoes/marcas" className="px-3 py-2 rounded bg-muted text-foreground hover:opacity-80">Cancelar</Link>
        </div>
      </div>
    </div>
  );
}