import type { ScoreResult } from '@veral/shared';

import { formatComputedAt } from '@/lib/bench-page';

interface ProvenanceBarProps {
  readonly result: ScoreResult;
}

export function ProvenanceBar({ result }: ProvenanceBarProps) {
  return (
    <section className="mt-8 border-t border-slate-veral/10 px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[11px] tabular-nums">
      <div>
        <div className="uppercase tracking-wider text-slate-veral/50 text-[10px]">Formula</div>
        <div className="mt-1 text-slate-veral">{result.formulaVersion}</div>
      </div>
      <div>
        <div className="uppercase tracking-wider text-slate-veral/50 text-[10px]">Computed</div>
        <div className="mt-1 text-slate-veral">{formatComputedAt(result.computedAt)}</div>
      </div>
      <div className="col-span-2 md:col-span-2">
        <div className="uppercase tracking-wider text-slate-veral/50 text-[10px]">
          Subject namehash
        </div>
        <div className="mt-1 text-slate-veral break-all">{result.subjectNamehash}</div>
      </div>
    </section>
  );
}
