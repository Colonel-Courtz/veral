import type { BenchHandlerErrorCode } from '@/lib/bench-handler';
import { errorPanelContent } from '@/lib/bench-page';

interface ErrorPanelProps {
  readonly code: BenchHandlerErrorCode;
  readonly subjectName: string;
  readonly detail?: string;
}

export function ErrorPanel({ code, subjectName, detail }: ErrorPanelProps) {
  const content = errorPanelContent(code);
  return (
    <section className="border border-slate-veral/20 bg-parchment/40 px-8 py-10">
      <div className="font-mono text-[11px] uppercase tracking-wider text-slate-veral/60">
        Subject · {subjectName}
      </div>
      <h1 className="mt-3 font-display text-3xl md:text-4xl">{content.title}</h1>
      <p className="mt-4 text-base text-slate-veral/80 max-w-2xl">{content.body}</p>
      {content.hint && <p className="mt-3 text-sm text-slate-veral/60 max-w-2xl">{content.hint}</p>}
      {detail && (
        <pre className="mt-6 font-mono text-[11px] text-slate-veral/50 whitespace-pre-wrap break-all">
          {detail}
        </pre>
      )}
    </section>
  );
}
