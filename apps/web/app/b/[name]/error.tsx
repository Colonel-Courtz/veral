'use client';

import { useEffect } from 'react';

interface ErrorProps {
  readonly error: Error;
  readonly reset: () => void;
}

export default function BenchError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Surface the error to whatever observability the runtime is wired to.
    // Console.error is the lowest common denominator and Vercel forwards it.
    console.error('[bench-page] uncaught:', error);
  }, [error]);

  return (
    <main className="min-h-screen px-6 md:px-12 py-16 max-w-4xl">
      <section className="border border-slate-veral/20 bg-parchment/40 px-8 py-10">
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
          Bench Mode
        </div>
        <h1 className="mt-3 font-display text-3xl md:text-4xl">Unexpected error</h1>
        <p className="mt-4 text-base text-slate-veral/80 max-w-2xl">
          Veral hit an unexpected condition while rendering this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-block border border-slate-veral/40 px-4 py-2 font-display text-base text-slate-veral hover:bg-slate-veral hover:text-bone transition-colors"
        >
          Retry
        </button>
      </section>
    </main>
  );
}
