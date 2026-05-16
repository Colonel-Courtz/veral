import type { ScoreResult } from '@veral/shared';

import { formatScore, tierBadge } from '@/lib/bench-page';

interface ScoreCardProps {
  readonly score: number;
  readonly tier: ScoreResult['tier'];
  readonly subjectName: string;
}

const TONE_CLASS: Record<string, string> = {
  public: 'border-slate-veral/20 text-slate-veral',
  anchored: 'border-gold-veral/60 text-gold-veral',
  sealed: 'border-slate-veral text-slate-veral',
};

export function ScoreCard({ score, tier, subjectName }: ScoreCardProps) {
  const badge = tierBadge(tier);
  return (
    <section className="border border-slate-veral/10 bg-parchment/40 px-8 py-10 md:py-14">
      <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
        Subject
      </div>
      <div className="mt-2 font-display text-3xl md:text-4xl leading-tight break-all">
        {subjectName}
      </div>
      <div className="mt-10 flex flex-col md:flex-row md:items-end md:gap-12">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
            Score
          </div>
          <div className="mt-2 font-display text-7xl md:text-8xl leading-none tabular-nums">
            {formatScore(score)}
            <span className="text-3xl md:text-4xl text-slate-veral/40"> / 100</span>
          </div>
        </div>
        <div className="mt-6 md:mt-0">
          <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
            Tier
          </div>
          <div
            className={`mt-2 inline-block border px-4 py-2 font-display text-xl ${TONE_CLASS[badge.tone] ?? TONE_CLASS.public}`}
          >
            {badge.label}
          </div>
        </div>
      </div>
    </section>
  );
}
