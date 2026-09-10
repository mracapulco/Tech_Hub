"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import { MicrosoftAgreement, formatBillingPeriod, formatCurrency, formatDate, getUploadUrl, statusLabel, statusTone } from "../_lib";

export default function MicrosoftAgreementViewPage({ params }: { params: { id: string } }) {
  const token = typeof window !== "undefined" ? getToken() : null;
  const user = typeof window !== "undefined" ? getUser() : null;
  const [agreement, setAgreement] = useState<MicrosoftAgreement | null>(null);
  const [isAdminOrTech, setIsAdminOrTech] = useState(false);
  // Margem/custo são informação interna — só ADMIN vê (nem técnico, nem cliente).
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!token) return;
      const res = await apiGet<{ ok: boolean; data?: MicrosoftAgreement; error?: string }>(`/licensing/microsoft/agreements/${params.id}`, token);
      if (res?.ok && res.data) {
        setAgreement(res.data);
        if (res.data.companyId) {
          try {
            const comp = await apiGet<{ ok: boolean; data?: any }>(`/companies/${res.data.companyId}`, token);
            if (comp?.ok && comp.data?.logoUrl) setCompanyLogo(getUploadUrl(comp.data.logoUrl));
          } catch {}
        }
      }
      if (user?.id) {
        try {
          const userRes = await apiGet<{ ok: boolean; data?: any }>(`/users/${user.id}`, token);
          const memberships = (userRes?.data?.memberships || []) as { role: string }[];
          const isGlobalAdmin = !!userRes?.data?.isGlobalAdmin;
          setIsAdminOrTech(isGlobalAdmin || memberships.some((item) => item.role === "ADMIN" || item.role === "TECHNICIAN" || item.role === "COMERCIAL"));
          setIsAdmin(isGlobalAdmin || memberships.some((item) => item.role === "ADMIN"));
        } catch {}
      }
    })();
  }, [token, user?.id, params.id]);

  function exportPDF() {
    if (!agreement) return;
    const now = new Date().toLocaleString();
    const cmpName = agreement.companyName || "";
    const cmpLogo = companyLogo || "";
    const costRows = isAdmin
      ? `
        <tr><th>Custo unitário</th><td>${formatCurrency(agreement.unitCost, agreement.currency)}</td></tr>
        <tr><th>Custo da cobrança</th><td>${formatCurrency(agreement.billingCost, agreement.currency)}</td></tr>
        <tr><th>Margem</th><td>${formatCurrency(agreement.margin, agreement.currency)}</td></tr>
        <tr><th>Margem %</th><td>${agreement.marginPercent != null ? `${agreement.marginPercent.toFixed(2)}%` : "—"}</td></tr>
      `
      : "";
    const docsRows = agreement.documents.length
      ? agreement.documents
          .map(
            (doc) => `
        <tr>
          <td>${doc.title}</td>
          <td>${statusLabel(doc.documentType)}</td>
          <td>${formatDate(doc.issuedAt)}</td>
          <td>${doc.amount != null ? formatCurrency(doc.amount, doc.currency) : "—"}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" style="text-align:center;color:#6b7280">Nenhum documento associado.</td></tr>`;
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Relatório de Licenciamento Microsoft</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .container { max-width: 900px; margin: 0 auto; padding: 24px; }
            .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
            .logo { height: 40px; object-fit: contain; }
            h1 { font-size: 20px; margin: 0; }
            h2 { font-size: 18px; margin: 20px 0 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
            th { background: #f9fafb; text-align: left; }
            .muted { color: #6b7280; font-size: 12px; }
            .section { margin-top: 16px; }
            .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #ffffff; }
            @page { margin: 16mm; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div>
                <h1>Relatório de Licenciamento Microsoft</h1>
                <div class="muted">Gerado pelo Tech Hub em ${now}</div>
              </div>
              <img class="logo" src="${location.origin}/logo.svg" onerror="this.style.display='none'" />
            </div>
            <div class="section">
              <h2>Resumo</h2>
              <div class="cards">
                <div class="card">
                  <div class="muted">Assinatura</div>
                  <div><strong>${agreement.productName || "—"}</strong></div>
                  <div class="muted">Categoria ${agreement.category || "—"}</div>
                  <div class="muted">Fornecedor ${statusLabel(agreement.sourceProvider || "MANUAL")}</div>
                </div>
                <div class="card">
                  <div class="muted">Status</div>
                  <div><strong>${statusLabel(agreement.providerStatus || agreement.status)}</strong></div>
                  <div class="muted">${agreement.isRecurring ? "Recorrente" : "Não recorrente"}</div>
                  <div class="muted">Vencimento ${formatDate(agreement.expiresAt)}</div>
                </div>
                <div class="card" style="display:flex;align-items:center;justify-content:center;gap:8px">
                  <div style="width:100%">
                    <div class="muted">Empresa ${cmpName ? "— " + cmpName : "(não mapeado)"}</div>
                    ${cmpLogo ? '<img src="' + cmpLogo + '" alt="Logo da empresa" style="max-height:56px;object-fit:contain;margin-top:6px" />' : '<div style="height:56px;border:1px solid #e5e7eb;border-radius:8px;background:#f3f4f6"></div>'}
                  </div>
                </div>
              </div>
            </div>
            <div class="section">
              <h2>Detalhes</h2>
              <table>
                <tbody>
                  <tr><th>Cliente externo</th><td>${titleCase(agreement.externalCustomerName) || "—"}</td></tr>
                  <tr><th>Tenant/domain Microsoft</th><td>${agreement.microsoftDomain || agreement.tenantDomain || "—"}</td></tr>
                  <tr><th>Quantidade</th><td>${agreement.quantityPurchased ?? "—"}</td></tr>
                  <tr><th>Cobrança</th><td>${formatBillingPeriod(agreement.billingModel)}</td></tr>
                  <tr><th>Compromisso</th><td>${formatBillingPeriod(agreement.subscriptionPeriod)}</td></tr>
                  <tr><th>Data de criação</th><td>${formatDate(agreement.startDate || agreement.createdAt)}</td></tr>
                  <tr><th>Renovação</th><td>${agreement.isRecurring ? formatDate(agreement.renewalDate) : "Não recorrente"}</td></tr>
                  <tr><th>Preço unitário</th><td>${formatCurrency(agreement.unitPrice, agreement.currency)}</td></tr>
                  <tr><th>Valor da cobrança</th><td>${formatCurrency(agreement.billingAmount ?? agreement.totalPrice, agreement.currency)}</td></tr>
                  ${costRows}
                </tbody>
              </table>
            </div>
            <div class="section">
              <h2>Documentos</h2>
              <table>
                <thead>
                  <tr><th>Título</th><th>Tipo</th><th>Emissão</th><th>Valor</th></tr>
                </thead>
                <tbody>${docsRows}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) setTimeout(() => w.print(), 300);
  }

  if (!token) {
    return <div className="p-4 text-sm text-muted">Faça login para continuar.</div>;
  }

  if (!agreement) {
    return <div className="p-4 text-sm text-muted">Carregando assinatura...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{agreement.productName}</h1>
          <p className="text-sm text-muted">
            {agreement.companyName || "Não mapeado"} · {statusLabel(agreement.sourceProvider || "MANUAL")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/licenciamento/microsoft" className="px-3 py-2 rounded bg-border text-text">
            Voltar
          </a>
          {isAdminOrTech && !agreement.isReadOnly && (
            <a href={`/licenciamento/microsoft/${agreement.id}/editar`} className="px-3 py-2 rounded bg-primary text-white">
              Editar
            </a>
          )}
          <button onClick={exportPDF} className="px-3 py-2 rounded bg-border text-text">
            Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Status" value={statusLabel(agreement.providerStatus || agreement.status)} tone={statusTone(agreement.providerStatus || agreement.status)} />
        <SummaryCard label="Tipo" value={agreement.isRecurring ? "Recorrente" : "Não recorrente"} />
        <SummaryCard label="Quantidade" value={String(agreement.quantityPurchased ?? "—")} helper="Licenças" />
        <SummaryCard label="Valor da cobrança" value={formatCurrency(agreement.billingAmount ?? agreement.totalPrice, agreement.currency)} helper={formatBillingPeriod(agreement.billingModel)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Detalhe da assinatura</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Empresa Tech Hub" value={agreement.companyName || "—"} />
            <Field label="Cliente externo" value={titleCase(agreement.externalCustomerName) || "—"} />
            <Field label="Fornecedor" value={statusLabel(agreement.sourceProvider || "MANUAL")} />
            <Field label="Nome do produto" value={agreement.productName} />
            <Field label="Subscription ID" value={agreement.externalSubscriptionId || "—"} />
            <Field label="Vendor Subscription ID" value={agreement.vendorSubscriptionId || "—"} />
            <Field label="Product ID" value={agreement.productId || "—"} />
            <Field label="MPN" value={agreement.mpn || agreement.sku || "—"} />
            <Field label="Tenant/domain Microsoft" value={agreement.microsoftDomain || agreement.tenantDomain || "—"} />
            <Field label="Microsoft customer ID" value={agreement.microsoftCustomerId || "—"} />
            <Field label="Microsoft tenant ID" value={agreement.microsoftTenantId || "—"} />
            <Field label="Quantidade" value={String(agreement.quantityPurchased ?? "—")} />
            <Field label="Status" value={statusLabel(agreement.providerStatus || agreement.status)} />
            <Field label="Tipo" value={agreement.isRecurring ? "Recorrente" : "Não recorrente"} />
            <Field label="Cobrança" value={formatBillingPeriod(agreement.billingModel)} />
            <Field label="Compromisso" value={formatBillingPeriod(agreement.subscriptionPeriod)} />
            <Field label="Data de criação" value={formatDate(agreement.startDate || agreement.createdAt)} />
            <Field label="Renewal Date" value={agreement.isRecurring ? formatDate(agreement.renewalDate) : "Não recorrente"} />
            <Field label="Expiration Date" value={formatDate(agreement.expiresAt)} />
            <Field label="Preço unitário" value={formatCurrency(agreement.unitPrice, agreement.currency)} />
            <Field label="Valor da cobrança" value={formatCurrency(agreement.billingAmount ?? agreement.totalPrice, agreement.currency)} />
            {isAdmin && (
              <>
                <Field label="Custo unitário" value={formatCurrency(agreement.unitCost, agreement.currency)} />
                <Field label="Custo da cobrança" value={formatCurrency(agreement.billingCost, agreement.currency)} />
                <Field label="Margem" value={formatCurrency(agreement.margin, agreement.currency)} />
                <Field label="Margem %" value={agreement.marginPercent != null ? `${agreement.marginPercent.toFixed(2)}%` : "—"} />
              </>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded p-4">
          <h2 className="font-semibold mb-3">Documentos</h2>
          <div className="space-y-3">
            {agreement.documents.map((doc) => (
              <div key={doc.id} className="border border-border rounded p-3">
                <div className="font-medium">{doc.title}</div>
                <div className="text-xs text-muted">
                  {statusLabel(doc.documentType)} · {formatDate(doc.issuedAt)}
                </div>
                <div className="text-xs text-muted">
                  {doc.documentNumber || "—"} {doc.amount != null ? `· ${formatCurrency(doc.amount, doc.currency)}` : ""}
                </div>
                {doc.fileUrl && (
                  <a href={getUploadUrl(doc.fileUrl)} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    Abrir anexo
                  </a>
                )}
              </div>
            ))}
            {agreement.documents.length === 0 && <div className="text-sm text-muted">Nenhum documento associado.</div>}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded p-4">
        <h2 className="font-semibold mb-3">Fontes do registro</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-2">Fornecedor</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Cliente externo</th>
                <th className="py-2">Registro</th>
                <th className="py-2">Observado em</th>
              </tr>
            </thead>
            <tbody>
              {agreement.sources.map((source) => (
                <tr key={source.id} className="border-b border-border">
                  <td className="py-3">{statusLabel(source.provider)}</td>
                  <td className="py-3">{statusLabel(source.sourceType)}</td>
                  <td className="py-3">
                    <div>{titleCase(source.externalCustomerName) || "—"}</div>
                    <div className="text-xs text-muted">{source.externalCustomerId || "—"}</div>
                  </td>
                  <td className="py-3">
                    <div>{source.externalReference || "—"}</div>
                    <div className="text-xs text-muted">{source.externalRecordId || "—"}</div>
                  </td>
                  <td className="py-3">{formatDate(source.observedAt)}</td>
                </tr>
              ))}
              {agreement.sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted">
                    Nenhuma fonte registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tone || ""}`}>{value}</div>
      {helper && <div className="text-xs text-muted mt-1">{helper}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div>{value}</div>
    </div>
  );
}
