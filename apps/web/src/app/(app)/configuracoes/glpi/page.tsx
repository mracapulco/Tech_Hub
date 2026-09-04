"use client";

import Link from "next/link";

export default function GlpiSettingsScopePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GLPI</h1>
        <p className="mt-2 text-sm text-gray-600">
          A configuração do GLPI não é global. Cada cliente possui no máximo uma conexão própria, configurada dentro do cadastro da empresa.
        </p>
      </div>

      <div className="rounded border border-border bg-white p-6">
        <h2 className="text-lg font-medium">Onde configurar</h2>
        <p className="mt-2 text-sm text-gray-600">
          Acesse <strong>Configurações &gt; Empresas</strong>, abra o cliente desejado e entre na seção <strong>GLPI</strong>.
        </p>
        <div className="mt-4">
          <Link href="/configuracoes/empresas" className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Ir para empresas
          </Link>
        </div>
      </div>
    </div>
  );
}
