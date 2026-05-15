import { agentStatusDisplay } from '@/lib/bench-page';

export interface SourcesStatusItem {
  readonly agentId: string;
  readonly domain: string;
  readonly status: 'ok' | 'partial' | 'error' | 'absent';
}

interface SourcesStatusProps {
  readonly items: ReadonlyArray<SourcesStatusItem>;
}

const TONE_DOT: Record<string, string> = {
  ok: 'bg-emerald-600',
  partial: 'bg-amber-500',
  error: 'bg-rose-600',
  absent: 'bg-slate-veral/30',
};

export function SourcesStatus({ items }: SourcesStatusProps) {
  return (
    <section className="border border-slate-veral/10 mt-8">
      <header className="border-b border-slate-veral/10 px-6 py-4">
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
          Sources
        </div>
      </header>
      <ul className="divide-y divide-slate-veral/10">
        {items.length === 0 && (
          <li className="px-6 py-4 text-sm text-slate-veral/60">
            No sources registered for this tier.
          </li>
        )}
        {items.map((item) => {
          const display = agentStatusDisplay(item.status);
          return (
            <li key={item.agentId} className="px-6 py-3 flex items-center gap-4">
              <span
                className={`inline-block w-2 h-2 rounded-full ${TONE_DOT[display.tone] ?? TONE_DOT.absent}`}
              />
              <div className="flex-1">
                <div className="font-display text-base">{item.domain}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-veral/50">
                  {item.agentId}
                </div>
              </div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/70">
                {display.label}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
