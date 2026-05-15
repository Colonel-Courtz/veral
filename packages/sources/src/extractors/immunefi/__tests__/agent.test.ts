import type { AgentInput } from '@veral/shared';
import { describe, expect, it, vi } from 'vitest';
import { createImmunefiAgent, findSubjectProgramMatches } from '../agent.js';
import {
  type ImmunefiHttpClient,
  parseActiveProgramsFromHtml,
  parseProgramDetailFromHtml,
  programDetailUrl,
} from '../client.js';
import { IMMUNEFI_CACHE_TTL_SECONDS, IMMUNEFI_TRUST_FACTOR } from '../schema.js';

const listHtml = flightHtml(
  '6:["$","$L",null,{"bounties":[{"contentfulId":"1","slug":"layerzero","url":"/bug-bounty/layerzero/information/","launchDate":"2023-05-17T17:00:00.000Z","updatedDate":"2025-11-11T09:44:54.638Z","kyc":true,"maxBounty":15000000,"logo":"https://example.test/layerzero.png","project":"LayerZero","technologies":[],"immunefiStandard":true,"premiumTriaging":true,"isSafeHarborActive":false,"tags":{"language":["Solidity"],"ecosystem":["ETH"],"general":["KYC Required"]},"proofOfConceptType":"required","inviteOnly":false,"features":["Managed Triage"],"isPremiumProgram":false,"performanceMetrics":{"totalPaidMetricEnabled":true,"totalPaidAmount":2781457.85,"responseTimeMetricEnabled":true,"medianResponseTimeInMinutes":3122},"vaultBalance":null}]}]',
);

const detailHtml = flightHtml(
  '6:["$","$L",null,{"bounty":{"contentfulId":"1","slug":"layerzero","project":"LayerZero","url":"/bug-bounty/layerzero/information/","maxBounty":15000000,"launchDate":"2023-05-17T17:00:00.000Z","updatedDate":"2025-11-11T09:44:54.638Z","kyc":true,"inviteOnly":false,"immunefiStandard":true,"premiumTriaging":true,"isSafeHarborActive":false,"tags":{"language":["Solidity"]},"performanceMetrics":{"totalPaidMetricEnabled":true,"totalPaidAmount":2781457.85,"responseTimeMetricEnabled":true,"medianResponseTimeInMinutes":3122},"rewardsToken":"USDC, USDT and BUSD","rewardsTokenNetwork":null,"programImpacts":[{"id":1,"severity":"critical","assetType":"smart_contract","description":"Funds at risk","isPredefined":false}],"programRewards":[{"id":10,"severity":"critical","assetType":"smart_contract","maxReward":15000000,"minReward":250000,"rewardModel":"up_to","rewardCalculationPercentage":10},{"id":11,"severity":"high","assetType":"smart_contract","maxReward":250000,"rewardModel":"up_to"}]}}]',
);

describe('parseActiveProgramsFromHtml', () => {
  it('extracts active programs with payout history', () => {
    const programs = parseActiveProgramsFromHtml(listHtml);
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({
      slug: 'layerzero',
      project: 'LayerZero',
      maxBountyUsd: 15000000,
      kycRequired: true,
      url: 'https://immunefi.com/bug-bounty/layerzero/information/',
      payoutHistory: {
        totalPaidMetricEnabled: true,
        totalPaidUsd: 2781457.85,
        responseTimeMetricEnabled: true,
        medianResponseTimeMinutes: 3122,
      },
    });
  });
});

describe('parseProgramDetailFromHtml', () => {
  it('extracts severity tiers from program rewards', () => {
    const detail = parseProgramDetailFromHtml(detailHtml);
    expect(detail.severityTiers).toEqual([
      {
        assetType: 'smart_contract',
        severity: 'critical',
        maxRewardUsd: 15000000,
        minRewardUsd: 250000,
        rewardModel: 'up_to',
        rewardCalculationPercentage: 10,
      },
      {
        assetType: 'smart_contract',
        severity: 'high',
        maxRewardUsd: 250000,
        minRewardUsd: null,
        rewardModel: 'up_to',
        rewardCalculationPercentage: null,
      },
    ]);
    expect(detail.impactCount).toBe(1);
  });
});

describe('findSubjectProgramMatches', () => {
  it('matches ENS and GitHub-derived subject names to Immunefi programs', () => {
    const programs = parseActiveProgramsFromHtml(listHtml);
    const matches = findSubjectProgramMatches(subject('layerzero.eth'), programs);
    expect(matches.map((program) => program.slug)).toEqual(['layerzero']);
  });
});

describe('immunefiAgent', () => {
  it('returns active programs, matched severity tiers, trust factor, and cache TTL', async () => {
    const client: ImmunefiHttpClient = {
      fetchText: vi.fn(async (url: string) => {
        if (url === programDetailUrl('layerzero')) return detailHtml;
        return listHtml;
      }),
    };
    const agent = createImmunefiAgent({ client });
    const result = await agent.run({ subject: subject('layerzero.eth'), runUuid: 'run-1' });

    expect(result.status).toBe('ok');
    expect(result.findings).toMatchObject({
      trustFactor: IMMUNEFI_TRUST_FACTOR,
      cacheTtlSeconds: IMMUNEFI_CACHE_TTL_SECONDS,
      activeProgramCount: 1,
    });
    expect(result.findings?.matchedPrograms[0]?.severityTiers[0]).toMatchObject({
      severity: 'critical',
      maxRewardUsd: 15000000,
    });
    expect(result.provenance.backend).toEqual({
      kind: 'rest-api',
      baseUrl: 'https://immunefi.com',
      version: 'next-flight-public-pages',
    });
  });
});

function flightHtml(text: string): string {
  return `<html><body><script>self.__next_f.push(${JSON.stringify([1, text])})</script></body></html>`;
}

function subject(ensName: string): AgentInput['subject'] {
  return {
    ensName,
    namehash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    primaryAddress: null,
    kind: 'project',
    declaredSources: {
      sourcify: [],
      github: { owner: 'LayerZero-Labs', verified: false },
      onchain: null,
      ensInternal: { rootName: ensName },
    },
  };
}
