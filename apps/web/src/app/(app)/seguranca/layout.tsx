export default function SegurancaLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="p-4">
      <h1 className="text-2xl font-semibold">Segurança cibernética</h1>
      <p className="mt-2 text-sm font-medium text-gray-600">Módulo de avaliação de maturidade em segurança.</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}