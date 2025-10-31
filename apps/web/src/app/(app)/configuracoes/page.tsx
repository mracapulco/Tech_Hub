import Link from 'next/link';

export default function ConfiguracoesPage() {
  return (
    <main>
      <h1 className="text-2xl font-bold">Configurações</h1>
      <p className="mt-2 text-gray-600">Gerencie usuários e empresas.</p>
      <div className="mt-4 space-y-2">
        <Link href="/configuracoes/usuarios" className="inline-block px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Usuários</Link>
        <Link href="/configuracoes/empresas" className="inline-block ml-3 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Empresas</Link>
      </div>
    </main>
  );
}