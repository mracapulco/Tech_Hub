import Link from "next/link";
export default function BackupOverviewPage() {
  return (
    <main>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Backup</h1>
          <p className="mt-2 text-sm text-gray-700">
            Centralize as ações do módulo de backup e abra o relatório Veeam somente quando precisar consultar ou exportar a linha do tempo.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded border border-border bg-card p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/gestao/backup/relatorio" className="rounded border border-border bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50">
            <div className="text-base font-semibold text-primary">Relatório Veeam</div>
            <p className="mt-2 text-sm text-muted">
              Gere a linha do tempo diária das execuções, aplique filtros e exporte em CSV ou PDF.
            </p>
          </Link>
          <Link href="/gestao/backup/repositorios" className="rounded border border-border bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50">
            <div className="text-base font-semibold text-primary">Repositórios / Planejamento</div>
            <p className="mt-2 text-sm text-muted">
              Cruce dados automáticos do Zabbix com overrides manuais e simule retenção por repositório.
            </p>
          </Link>
          <Link href="/gestao/backup/proxies" className="rounded border border-border bg-white p-4 shadow-sm transition hover:border-gray-300 hover:bg-gray-50">
            <div className="text-base font-semibold text-primary">Gerir Proxies</div>
            <p className="mt-2 text-sm text-muted">
              Acompanhe proxies e ajuste a base operacional do ambiente de backup.
            </p>
          </Link>
          <Link href="/gestao/backup/rotinas" className="rounded border border-border bg-white p-4 shadow-sm transition hover:border-gray-300 hover:bg-gray-50">
            <div className="text-base font-semibold text-primary">Ver Rotinas</div>
            <p className="mt-2 text-sm text-muted">
              Navegue pelas rotinas registradas e use esta tela como entrada principal do módulo.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
