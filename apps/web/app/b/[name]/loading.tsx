export default function Loading() {
  return (
    <main className="min-h-screen px-6 md:px-12 py-12 max-w-5xl">
      <section className="border border-slate-veral/10 bg-parchment/40 px-8 py-10 md:py-14">
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/40">
          Subject
        </div>
        <div className="mt-3 h-8 w-64 bg-slate-veral/10" aria-hidden />
        <div className="mt-10 flex flex-col md:flex-row md:items-end md:gap-12">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/40">
              Score
            </div>
            <div className="mt-3 h-20 w-40 bg-slate-veral/10" aria-hidden />
          </div>
          <div className="mt-6 md:mt-0">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/40">
              Tier
            </div>
            <div className="mt-3 h-10 w-28 bg-slate-veral/10" aria-hidden />
          </div>
        </div>
      </section>
      <div className="sr-only">Computing score…</div>
    </main>
  );
}
