import { BenchHandlerError, computeBenchScore } from '@/lib/bench-handler';

export const runtime = 'nodejs';
// 5 minutes — matches PRICE_ORACLE_PUBLIC TTL philosophy (Public-tier
// data is the cheapest to recompute and the most aggressively cached).
export const revalidate = 300;

const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=60';

interface RouteContext {
  readonly params: Promise<{ readonly name: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  const { name } = await ctx.params;

  try {
    const result = await computeBenchScore(name);
    return Response.json(
      { score: result.score, agentRollup: result.agentRollup },
      {
        status: 200,
        headers: { 'Cache-Control': CACHE_HEADER },
      },
    );
  } catch (err) {
    if (err instanceof BenchHandlerError) {
      return Response.json({ code: err.code, message: err.message }, { status: err.status });
    }
    return Response.json(
      {
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
