
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 shadow-lg">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">STEMBuilder</h1>
            <span className="text-sm text-zinc-400">MVP • feedback welcome</span>
          </div>

          <p className="mt-4 text-zinc-300 leading-relaxed">
            Design. Test. Iterate. This is the first public iteration of STEMBuilder.
            For now, it includes the home page and the Bridge Builder only — no logins, no accounts.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/tools/bridge"
              className="inline-flex items-center justify-center rounded-xl bg-white text-zinc-950 px-5 py-3 font-medium hover:bg-zinc-200 transition"
            >
              Open Bridge Builder
            </Link>

            <a
              href="mailto:feedback@stembuilder.io?subject=STEMBuilder%20Feedback"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-700 px-5 py-3 font-medium text-zinc-100 hover:bg-zinc-900 transition"
            >
              Send Feedback
            </a>
          </div>

          <div className="mt-8 text-sm text-zinc-400">
            Tip: If the Bridge Builder link doesn’t work yet, we’ll update the path in one second.
          </div>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          © {new Date().getFullYear()} STEMBuilder
        </div>
      </div>
    </main>
  );
}
