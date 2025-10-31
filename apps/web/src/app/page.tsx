export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <section className="text-center p-8 rounded-xl bg-white shadow">
        <h1 className="text-3xl font-bold">Tech Hub</h1>
        <p className="mt-2 text-gray-600">Seu hub técnico multi-empresa.</p>
        <a
          href="/login"
          className="inline-block mt-6 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Ir para Login
        </a>
      </section>
    </main>
  );
}