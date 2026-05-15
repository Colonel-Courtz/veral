import type { Metadata } from 'next';

import { ErrorPanel } from '@/components/error-panel';
import { ProvenanceBar } from '@/components/provenance-bar';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { ScoreCard } from '@/components/score-card';
import { SourcesStatus } from '@/components/sources-status';
import { BenchHandlerError, computeBenchScore } from '@/lib/bench-handler';

export const runtime = 'nodejs';
// 5 minutes — matches the /api/bench/[name] cache philosophy.
export const revalidate = 300;

interface PageProps {
  readonly params: Promise<{ readonly name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `${name} · Bench Mode · Veral`,
    description: `Deterministic 0–100 reputation score for ${name}, computed from public evidence sources.`,
    robots: { index: true, follow: true },
  };
}

export default async function BenchPage({ params }: PageProps) {
  const { name } = await params;

  let result: Awaited<ReturnType<typeof computeBenchScore>>;
  try {
    result = await computeBenchScore(name);
  } catch (err) {
    if (err instanceof BenchHandlerError) {
      return (
        <main className="min-h-screen px-6 md:px-12 py-16 max-w-4xl">
          <ErrorPanel code={err.code} subjectName={name} detail={err.message} />
        </main>
      );
    }
    return (
      <main className="min-h-screen px-6 md:px-12 py-16 max-w-4xl">
        <ErrorPanel
          code="INTERNAL"
          subjectName={name}
          detail={err instanceof Error ? err.message : String(err)}
        />
      </main>
    );
  }

  // v1 free endpoint only registers the Sourcify extractor; the
  // orchestrator's per-agent rollup is not surfaced through ScoreResult,
  // so we render a single static entry. The component is structured to
  // accept N items so additional agents light up automatically.
  const sourcesItems = [{ agentId: 'sourcify-extract', domain: 'sourcify', status: 'ok' as const }];

  return (
    <main className="min-h-screen px-6 md:px-12 py-12 max-w-5xl">
      <ScoreCard score={result.score} tier={result.tier} subjectName={name} />
      <ScoreBreakdown components={result.components} />
      <SourcesStatus items={sourcesItems} />
      <ProvenanceBar result={result} />
    </main>
  );
}
