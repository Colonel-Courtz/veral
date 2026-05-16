import type { ScoreResult } from '@veral/shared';

import { clusterByDomain, formatPercent, formatTrustDiscount } from '@/lib/bench-page';

interface ScoreBreakdownProps {
  readonly components: ScoreResult['components'];
}

export function ScoreBreakdown({ components }: ScoreBreakdownProps) {
  const clusters = clusterByDomain(components);
  return (
    <section className="border border-slate-veral/10 mt-8">
      <header className="border-b border-slate-veral/10 px-6 py-4 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
          Breakdown
        </div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/40">
          {components.length} components
        </div>
      </header>
      <div className="divide-y divide-slate-veral/10">
        {clusters.map((cluster) => (
          <div key={cluster.domain} className="px-6 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="font-display text-lg">{cluster.domain}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
                {cluster.trust} · trust{' '}
                {formatTrustDiscount(cluster.components[0]?.trustDiscount ?? 1)}
              </div>
            </div>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-slate-veral/50 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-1 font-normal">Weight</th>
                  <th className="py-1 font-normal">Raw</th>
                  <th className="py-1 font-normal">Discount</th>
                  <th className="py-1 font-normal text-right">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {cluster.components.map((c) => (
                  <tr
                    key={`${cluster.domain}-${c.weight}-${c.rawValue}-${c.contribution}`}
                    className="border-t border-slate-veral/5"
                  >
                    <td className="py-2">{c.weight.toFixed(2)}</td>
                    <td className="py-2">{formatPercent(c.rawValue)}</td>
                    <td className="py-2">{formatTrustDiscount(c.trustDiscount)}</td>
                    <td className="py-2 text-right">{c.contribution.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
