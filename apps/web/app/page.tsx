export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between border-b border-slate-veral/10">
        <div className="font-mono text-xs uppercase tracking-wider text-slate-veral/70">
          Veral · Verification Authority Layer
        </div>
        <div className="font-mono text-xs uppercase tracking-wider text-slate-veral/70">
          v0.0 · Pre-launch
        </div>
      </header>

      <section className="flex-1 px-8 py-24 flex flex-col justify-center max-w-4xl">
        <h1 className="font-display text-7xl md:text-8xl leading-[0.95] tracking-tight">
          Ver<span className="italic text-gold-veral">al</span>
        </h1>
        <p className="mt-8 font-display text-2xl md:text-3xl italic text-slate-veral/80">
          Verification Authority Layer for Ethereum.
        </p>
        <p className="mt-12 max-w-2xl text-lg leading-relaxed text-slate-veral/70">
          Veral reads twenty public sources of evidence behind any ENS-named
          subject — Sourcify, GitHub, on-chain activity, ENS records, EAS
          attestations, audit registries — and computes a deterministic 0–100
          reputation score, publishable as an EAS attestation bound to the
          subject&apos;s ENS namehash.
        </p>
        <p className="mt-8 max-w-2xl font-display italic text-xl text-slate-veral">
          We do not predict trust. We compute it.
        </p>
      </section>

      <section className="px-8 py-12 border-t border-slate-veral/10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
            Status
          </div>
          <div className="mt-2 font-display text-lg">Pre-launch</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
            Origin
          </div>
          <div className="mt-2 font-display text-lg">ETHPrague 2026</div>
          <div className="text-sm text-slate-veral/60">Dual-track winner</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
            Anchor
          </div>
          <div className="mt-2 font-mono text-sm">
            ENS · EIP-712 · EAS
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
            Submission
          </div>
          <div className="mt-2 font-display text-lg">ENS DAO SPP</div>
          <div className="text-sm text-slate-veral/60">Term 1 · Q3 2026</div>
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-slate-veral/10 flex items-center justify-between font-mono text-xs uppercase tracking-wider text-slate-veral/50">
        <div>veral.tech</div>
        <div>MIT licensed · Open source</div>
      </footer>
    </main>
  );
}
