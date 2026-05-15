#!/usr/bin/env node
// Pre-commit secret-leak scan. Refuses to let obvious credentials land in a commit.
// Runs against staged diff only, so existing repo content (incl. .env.example) doesn't trip it.

import { execSync } from 'node:child_process';

const PATTERNS = [
  // Generic high-entropy keys
  { re: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, name: 'Stripe key' },
  { re: /\bsk-[A-Za-z0-9_-]{20,}\b/, name: 'OpenAI / API key' },
  { re: /\bvcp_[A-Za-z0-9]{30,}\b/, name: 'Vercel token' },
  { re: /\bghp_[A-Za-z0-9]{36,}\b/, name: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, name: 'GitHub fine-grained PAT' },
  { re: /\bgho_[A-Za-z0-9]{36,}\b/, name: 'GitHub OAuth token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, name: 'AWS access key' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, name: 'Google API key' },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, name: 'JWT' },

  // Ethereum private keys (64-hex)
  { re: /\b0x[a-fA-F0-9]{64}\b/, name: 'Possible Ethereum private key (64-hex)' },

  // Generic assignment to env-style key with secret-looking value
  { re: /\b(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|PASSPHRASE)\s*=\s*["']?[A-Za-z0-9+/=_\-]{20,}["']?/, name: 'inline secret assignment' },

  // Slack / Discord
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, name: 'Slack token' },
  { re: /\bhttps:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/, name: 'Discord webhook' },

  // Database URLs with embedded credentials
  { re: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@/, name: 'DB URL with password' },
];

// Files we never scan (test fixtures may contain dummy patterns)
const SKIP_PATHS = [
  /^scripts\/secret-scan\.mjs$/,        // self
  /^\.github\/AGENT_BOOTSTRAP\.md$/,    // discusses patterns
  /^\.github\/LAUNCH_PLAYBOOK\.md$/,
  /^CONTRIBUTING\.md$/,
  /^\.claude\/hooks\/agent-guard\.mjs$/,
];

function stagedDiff() {
  try {
    return execSync('git diff --cached --unified=0 --no-color', { encoding: 'utf8' });
  } catch (e) {
    process.stderr.write('secret-scan: could not read staged diff\n');
    process.exit(0);
  }
}

function scan(diff) {
  const offenders = [];
  let currentFile = null;
  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (!currentFile) continue;
    if (SKIP_PATHS.some((re) => re.test(currentFile))) continue;
    const text = line.slice(1);
    for (const { re, name } of PATTERNS) {
      const m = text.match(re);
      if (m) {
        offenders.push({ file: currentFile, name, sample: m[0].slice(0, 32) });
      }
    }
  }
  return offenders;
}

const diff = stagedDiff();
if (!diff) process.exit(0);

const offenders = scan(diff);
if (offenders.length === 0) {
  console.log('secret-scan: ok');
  process.exit(0);
}

console.error('secret-scan: BLOCKED — potential secrets in staged diff:');
for (const o of offenders) {
  console.error(`  ${o.file}: ${o.name} — ${o.sample}...`);
}
console.error('');
console.error('If this is a false positive (test fixture, doc example), unstage the line');
console.error('or move it to one of the SKIP_PATHS in scripts/secret-scan.mjs (Daniel only).');
process.exit(1);
