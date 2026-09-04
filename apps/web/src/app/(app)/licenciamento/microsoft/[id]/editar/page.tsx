"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";
import AgreementForm from "../../_agreement-form";
import {
  Company,
  MicrosoftAgreement,
  emptyAgreementDraft,
  getUploadUrl,
  microsoftDocumentTypes,
  statusLabel,
} from "../../_lib";

export default function MicrosoftAgreementEditPage({ params }: { params: { id: string } }) {
  const token = typeof window !== "undefined" ? getToken() : null;
  const [agreement, setAgreement] = useState<MicrosoftAgreement | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [docForm, setDocForm] = useState({
    provider: "MANUAL",
    documentType: "PDF",
    title: "",
    documentNumber: "",
    fileUrl: "",
    issuedAt: "",
    amount: "",
    currency: "BRL",
    notes: "",
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const [agreementRes, companiesRes] = await Promise.all([
        apiGet<{ ok: boolean; data?: MicrosoftAgreement; error?: string }>(`/licensing/microsoft/agreements/${params.id}`, token),
        apiGet<{ ok: boolean; data?: any[] }>("/companies", token),
      ]);

      if (agreementRes?.ok && agreementRes.data) setAgreement(agreementRes.data);
      if (companiesRes?.ok) {
        setCompanies((companiesRes.data || []).map((item: any) => ({ id: item.id, name: item.name })));
      }
    })();
  }, [token, params.id]);

  async function reloadAgreement() {
    if (!token) return;
    const res = await apiGet<{ ok: boolean; data?: MicrosoftAgreement; error?: string }>(`/licensing/microsoft/agreements/${params.id}`, token);
    if (res?.ok && res.data) setAgreement(res.data);
  }

  async function saveAgreement(body: any) {
    if (!token || !agreement) return;
    const res = await apiPut<{ ok: boolean; error?: string }>(`/licensing/microsoft/agreements/${agreement.id}`, token, body);
    if (!res?.ok) {
      setStatusMessage({ type: "error", text: res?.error || "Falha ao salvar acordo." });
      return;
    }
    setStatusMessage({ type: "success", text: "Acordo salvo com sucesso." });
    await reloadAgreement();
  }

  async function removeAgreement() {
    if (!token || !agreement || !window.confirm("Excluir este acordo?")) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/licensing/microsoft/agreements/${agreement.id}`, token);
    if (!res?.ok) {
      setStatusMessage({ type: "error", text: res?.error || "Falha ao excluir acordo." });
      return;
    }
    window.location.href = "/licenciamento/microsoft";
  }

  async function uploadDocument(file?: File) {
    if (!token || !file) return;
    if (file.type.toLowerCase() !== "application/pdf") {
      setStatusMessage({ type: "error", text: "Envie apenas PDFs." });
      return;
    }
    setUploading(true);
    try {
      const res = await apiUpload("/uploads/pdf", token, file);
      if (res?.ok && res.path) {
        setDocForm((current) => ({ ...current, fileUrl: res.path || "", title: current.title || file.name.replace(/\.pdf$/i, "") }));
      } else {
        setStatusMessage({ type: "error", text: res?.error || "Falha ao enviar PDF." });
      }
    } finally {
      setUploading(false);
    }
  }

  async function addDocument() {
    if (!token || !agreement) return;
    const res = await apiPost<{ ok: boolean; error?: string }>(`/licensing/microsoft/agreements/${agreement.id}/documents`, token, {
      ...docForm,
      amount: docForm.amount === "" ? null : Number(docForm.amount),
    });
    if (!res?.ok) {
      setStatusMessage({ type: "error", text: res?.error || "Falha ao adicionar documento." });
      return;
    }
    setDocForm({
      provider: "MANUAL",
      documentType: "PDF",
      title: "",
      documentNumber: "",
      fileUrl: "",
      issuedAt: "",
      amount: "",
      currency: "BRL",
      notes: "",
    });
    setStatusMessage({ type: "success", text: "Documento adicionado." });
    await reloadAgreement();
  }

  async function removeDocument(documentId: string, fileUrl?: string | null) {
    if (!token || !window.confirm("Remover este documento?")) return;
    const res = await apiDelete<{ ok: boolean; error?: string }>(`/licensing/microsoft/documents/${documentId}`, token);
    if (!res?.ok) {
      setStatusMessage({ type: "error", text: res?.error || "Falha ao remover documento." });
      return;
    }
    if (fileUrl) {
      await apiPost("/uploads/remove", token, { path: fileUrl });
    }
    setStatusMessage({ type: "success", text: "Documento removido." });
    await reloadAgreement();
  }

  if (!token) {
    return <div className="p-4 text-sm text-muted">Faça login para continuar.</div>;
  }

  if (!agreement) {
    return <div className="p-4 text-sm text-muted">Carregando acordo...</div>;
  }

  if (agreement.isReadOnly) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Assinatura somente leitura</h1>
          <p className="text-sm text-muted">
            Esta assinatura foi importada pela integração e não pode ser editada manualmente.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/licenciamento/microsoft/${agreement.id}`} className="px-3 py-2 rounded bg-border text-text">
            Visualizar
          </a>
          <a href="/licenciamento/microsoft" className="px-3 py-2 rounded bg-border text-text">
            Voltar
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Editar acordo manual</h1>
          <p className="text-sm text-muted">{agreement.productName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/licenciamento/microsoft/${agreement.id}`} className="px-3 py-2 rounded bg-border text-text">
            Visualizar
          </a>
          <a href="/licenciamento/microsoft" className="px-3 py-2 rounded bg-border text-text">
            Voltar
          </a>
        </div>
      </div>

      <AgreementForm
        token={token}
        companies={companies}
        initialValue={{
          ...emptyAgreementDraft(agreement.companyId || ""),
          companyId: agreement.companyId || "",
          siteId: agreement.siteId || "",
          category: agreement.category,
          productName: agreement.productName,
          sku: agreement.sku || "",
          licenseType: agreement.licenseType || "",
          licenseChannel: agreement.licenseChannel || "",
          billingModel: agreement.billingModel || "",
          tenantName: agreement.tenantName || "",
          tenantDomain: agreement.tenantDomain || "",
          quantityPurchased: agreement.quantityPurchased ?? null,
          quantityActive: agreement.quantityActive ?? null,
          unitCost: agreement.unitCost ?? null,
          totalCost: agreement.totalCost ?? null,
          currency: agreement.currency || "BRL",
          purchaseDate: agreement.purchaseDate ? agreement.purchaseDate.slice(0, 10) : "",
          startDate: agreement.startDate ? agreement.startDate.slice(0, 10) : "",
          renewalDate: agreement.renewalDate ? agreement.renewalDate.slice(0, 10) : "",
          expiresAt: agreement.expiresAt ? agreement.expiresAt.slice(0, 10) : "",
          autoRenew: agreement.autoRenew,
          alertLeadDays: agreement.alertLeadDays,
          status: agreement.status || "",
          notes: agreement.notes || "",
        }}
        mode="edit"
        statusMessage={statusMessage}
        lockCompany
        onSubmit={saveAgreement}
        onDelete={removeAgreement}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Adicionar documento</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Fornecedor</label>
              <input
                value={docForm.provider}
                onChange={(e) => setDocForm((current) => ({ ...current, provider: e.target.value.toUpperCase() }))}
                className="w-full border border-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Tipo</label>
              <select
                value={docForm.documentType}
                onChange={(e) => setDocForm((current) => ({ ...current, documentType: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2"
              >
                {microsoftDocumentTypes.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Titulo</label>
              <input
                value={docForm.title}
                onChange={(e) => setDocForm((current) => ({ ...current, title: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Numero do documento</label>
              <input
                value={docForm.documentNumber}
                onChange={(e) => setDocForm((current) => ({ ...current, documentNumber: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Data de emissao</label>
              <input
                type="date"
                value={docForm.issuedAt}
                onChange={(e) => setDocForm((current) => ({ ...current, issuedAt: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Valor</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={docForm.amount}
                  onChange={(e) => setDocForm((current) => ({ ...current, amount: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Moeda</label>
                <input
                  value={docForm.currency}
                  onChange={(e) => setDocForm((current) => ({ ...current, currency: e.target.value.toUpperCase() }))}
                  className="w-full border border-border rounded px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">PDF</label>
              <input type="file" accept="application/pdf" onChange={(e) => void uploadDocument(e.target.files?.[0])} className="w-full" />
              {uploading && <div className="text-xs text-muted mt-1">Enviando...</div>}
              {docForm.fileUrl && (
                <a href={getUploadUrl(docForm.fileUrl)} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  Abrir PDF enviado
                </a>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Notas</label>
              <textarea
                rows={3}
                value={docForm.notes}
                onChange={(e) => setDocForm((current) => ({ ...current, notes: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2"
              />
            </div>
            <button onClick={addDocument} className="px-3 py-2 rounded bg-primary text-white">
              Adicionar documento
            </button>
          </div>
        </div>

        <div className="xl:col-span-2 bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Documentos do acordo</h2>
            <span className="text-xs text-muted">{agreement.documents.length} item(ns)</span>
          </div>
          <div className="space-y-3">
            {agreement.documents.map((doc) => (
              <div key={doc.id} className="border border-border rounded p-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-muted">
                    {statusLabel(doc.documentType)} - {doc.documentNumber || "-"} - {doc.issuedAt ? doc.issuedAt.slice(0, 10) : "-"}
                  </div>
                  <div className="text-xs text-muted">{doc.notes || "-"}</div>
                  {doc.fileUrl && (
                    <a href={getUploadUrl(doc.fileUrl)} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                      Abrir anexo
                    </a>
                  )}
                </div>
                <button onClick={() => removeDocument(doc.id, doc.fileUrl)} className="px-3 py-2 rounded bg-red-600 text-white">
                  Remover
                </button>
              </div>
            ))}
            {agreement.documents.length === 0 && <div className="text-sm text-muted">Nenhum documento cadastrado.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
