#!/usr/bin/env node
// PreToolUse hook for Veral. Runs before every Claude Code tool call.
// Designed for --dangerously-skip-permissions mode: hard-blocks every category
// of damage an unsupervised agent can do without prompting.
//
// Exit codes:
//   0 = allow
//   2 = block (stderr message shown to agent + user)
//
// To bypass for legit Daniel work: rename this file. Do not modify it from
// inside a Claude Code session — the hook protects itself.

import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const REPO_ROOT = '/Users/danielbabjak/Desktop/Veral';
const PRIOR_HACKATHON = '/Users/danielbabjak/Desktop/ETHPrague2026';

// ─── Path classes ──────────────────────────────────────────────────────────

// Files agent may never write or edit. CLAUDE.md, the hook itself, deploy
// workflow, contracts, ADRs, lint config — these define the rules and must
// not be modified by the entity bound by them.
const DANIEL_ONLY_WRITE = [
  /^CLAUDE\.md$/,
  /^LICENSE$/,
  /^README\.md$/,
  /^CONTRIBUTING\.md$/,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/AGENT_BOOTSTRAP\.md$/,
  /^\.github\/LAUNCH_PLAYBOOK\.md$/,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^\.github\/workflows\//,
  /^\.github\/dependabot\.yml$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^contracts\//,
  /^docs\/architecture\//,
  /^biome\.json$/,
  /^lefthook\.yml$/,
  /^commitlint\.config\.cjs$/,
  /^pnpm-workspace\.yaml$/,
  /^pnpm-lock\.yaml$/,
  /^\.gitignore$/,
  /^\.claude\//,
  /^scripts\/seed-issues\.sh$/,
  /^scripts\/lint-comments\.mjs$/,
  /^tsconfig\.base\.json$/,
  /^package\.json$/,
];

// Path patterns agent may never read (regardless of where they live).
const FORBIDDEN_READ = [
  /(^|\/)\.env(\.[a-z][a-z0-9_-]*)?$/, // .env, .env.local, .env.production — but NOT .env.example
];
const ALLOWED_READ_EXCEPTIONS = [
  /(^|\/)\.env\.example$/,
];

// ─── Bash patterns ─────────────────────────────────────────────────────────

const FORBIDDEN_BASH = [
  // System escalation
  { pattern: /(^|[\s|;&])sudo\b/, reason: 'sudo never allowed' },
  { pattern: /(^|[\s|;&])(su|doas)\s/, reason: 'privilege escalation blocked' },

  // Destructive filesystem
  { pattern: /(^|[\s|;&])rm\s+(-[a-zA-Z]*[rRf]|-r[a-zA-Z]*|-f[a-zA-Z]*)/, reason: 'recursive/forced rm blocked' },
  { pattern: /\bfind\s+\S.*-delete\b/, reason: 'find -delete blocked' },
  { pattern: /\bgit\s+clean\s+-[a-z]*[fxd]/, reason: 'git clean -f/-x/-d blocked' },
  { pattern: /(^|[\s|;&])(shred|wipe)\s/, reason: 'shred/wipe blocked' },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'block device write blocked' },

  // Git destructive
  { pattern: /\bgit\s+push.*(?:--force-with-lease|--force|-f)\b/, reason: 'force push blocked (use PR workflow)' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'git reset --hard blocked' },
  { pattern: /\bgit\s+branch\s+-D\b/, reason: 'forced branch delete blocked' },
  { pattern: /\bgit\s+(filter-branch|filter-repo)\b/, reason: 'history rewrite blocked' },
  { pattern: /\bgit\s+config\s+(?!--get|--list|--show)/, reason: 'git config modify blocked' },
  { pattern: /\bgit\s+rebase\s+-i\b/, reason: 'interactive rebase blocked (hangs in non-tty)' },
  { pattern: /\bgit\s+push\s+\S+\s+main\b/, reason: 'direct push to main blocked — open a PR' },
  { pattern: /\bgit\s+push\s+\S+\s+HEAD:main\b/, reason: 'direct push to main blocked — open a PR' },
  { pattern: /\bgit\s+add\s+.*\.env\b/, reason: 'staging .env blocked' },
  { pattern: /\bgit\s+commit\s+(--allow-empty\b|-S)/, reason: 'suspicious commit flags blocked' },
  { pattern: /\bgit\s+worktree\s+add\s+(\.\/|\/|\$HOME)/, reason: 'worktree must be outside repo root — use ../veral-<num>' },

  // Vercel / deploy
  { pattern: /\bvercel\s+(deploy|env|login|link|switch|alias|domains|certs|secrets)\b/, reason: 'vercel operation blocked (Daniel-only)' },
  { pattern: /\bvercel\b/, reason: 'vercel CLI is Daniel-only' },

  // Publishing
  { pattern: /\b(pnpm|npm|yarn|bun)\s+publish\b/, reason: 'publish blocked' },

  // Solidity destructive
  { pattern: /\bforge\s+(create|verify-contract)\b/, reason: 'forge broadcast blocked' },
  { pattern: /\bforge\s+script\b[^|;]*--broadcast/, reason: 'forge --broadcast blocked' },
  { pattern: /\bcast\s+(send|wallet\s+sign|wallet\s+import|rpc\s+--rpc-url)/, reason: 'cast write op blocked' },

  // Dep install with explicit packages — only frozen-lockfile installs allowed
  { pattern: /\b(pnpm|npm|yarn)\s+add\b/, reason: 'adding deps blocked — add via PR + ADR' },
  { pattern: /\b(pnpm|npm|yarn)\s+install\s+(?!--frozen-lockfile|--offline)\S/, reason: 'install with args blocked — only `pnpm install --frozen-lockfile` allowed' },
  { pattern: /\bnpm\s+i\s+\S/, reason: 'npm i with args blocked' },
  { pattern: /\b(pip|pip3|cargo)\s+install\b/, reason: 'system-wide package install blocked' },
  { pattern: /\bbrew\s+(install|update|upgrade|tap)\b/, reason: 'brew commands blocked' },

  // RCE
  { pattern: /\bcurl\s+[^|;&]*\|\s*(bash|sh|zsh|python|python3|node|ruby)/, reason: 'curl | shell pipe blocked (RCE pattern)' },
  { pattern: /\bwget\s+[^|;&]*\|\s*(bash|sh|zsh|python|python3|node|ruby)/, reason: 'wget | shell pipe blocked' },
  { pattern: /\beval\s+["'`]/, reason: 'eval with quoted string blocked' },

  // Disable own guardrails
  { pattern: /\blefthook\s+(uninstall|disable)\b/, reason: 'lefthook disable blocked' },
  { pattern: /\bchmod\s.*\.claude/, reason: 'chmod on .claude blocked' },
  { pattern: /\bchmod\s.*lefthook/, reason: 'chmod on lefthook blocked' },
  { pattern: />\s*\.claude\//, reason: 'redirect into .claude blocked' },
  { pattern: />\s*\.github\/workflows/, reason: 'redirect into .github/workflows blocked' },

  // System control
  { pattern: /\b(kill|pkill|killall)\b/, reason: 'kill commands blocked' },
  { pattern: /\b(reboot|shutdown|halt|poweroff)\b/, reason: 'system control blocked' },
  { pattern: /\b(launchctl|systemctl|service)\s+(load|unload|start|stop|disable)/, reason: 'service control blocked' },

  // SSH / network exfil
  { pattern: /\b(scp|rsync|ssh)\s+/, reason: 'remote copy/exec blocked (use git PR instead)' },
  { pattern: /\b(nc|ncat|netcat)\b/, reason: 'netcat blocked' },

  // Crypto wallet ops
  { pattern: /\b(geth|reth)\s+(account|wallet)/, reason: 'wallet ops blocked' },
];

// ─── .env reference detection (special — needs token-level check) ──────────

const SENSITIVE_BASH_VERBS = /(^|[\s|;&])(cat|less|more|head|tail|grep|awk|sed|cp|mv|tee|curl|wget|xxd|od|hexdump|base64|strings|sort|uniq|jq|node|python|python3|ruby|perl)\b/i;
const ENV_REF = /\.env(\.[a-z][a-z0-9_-]*)?(?=\s|$|[|;&'"`)\]])/g;

function checkBashEnvRef(cmd) {
  if (!SENSITIVE_BASH_VERBS.test(cmd)) return null;
  const refs = cmd.match(ENV_REF) || [];
  for (const ref of refs) {
    if (ref === '.env.example') continue;
    return `bash command references ${ref}`;
  }
  return null;
}

// ─── Network allowlist for curl/wget ────────────────────────────────────────

const ALLOWED_HOSTS = [
  // GitHub
  'api.github.com', 'github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
  'codeload.github.com',
  // Sourcify
  'sourcify.dev', 'repo.sourcify.dev',
  // Etherscan family
  'api.etherscan.io', 'api-sepolia.etherscan.io',
  // Alchemy
  'eth-mainnet.g.alchemy.com', 'eth-sepolia.g.alchemy.com',
  // CoinGecko
  'api.coingecko.com', 'pro-api.coingecko.com',
  // NPM
  'registry.npmjs.org',
  // ENS / The Graph
  'api.thegraph.com', 'gateway.thegraph.com',
  // EAS
  'easscan.org', 'sepolia.easscan.org',
  // Linux/dev mirrors
  'ghcr.io', 'nodejs.org', 'pnpm.io',
];

function isHostAllowed(host) {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

function checkBashNetwork(cmd) {
  const re = /\b(?:curl|wget|fetch|http|httpie)\b[^|;&]*?\bhttps?:\/\/([^\/\s'"<>]+)/gi;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const host = m[1].replace(/:\d+$/, '');
    if (!isHostAllowed(host)) {
      return `network host not on allowlist: ${host}`;
    }
  }
  return null;
}

// ─── Path classification ────────────────────────────────────────────────────

function relToRepo(p) {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  if (abs.startsWith(REPO_ROOT + '/') || abs === REPO_ROOT) {
    return abs.slice(REPO_ROOT.length + 1) || '.';
  }
  return null; // outside repo
}

function isOutsideRepo(p) {
  if (!p) return false;
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  return !(abs.startsWith(REPO_ROOT + '/') || abs === REPO_ROOT);
}

function isAllowedExternalRead(p) {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  // Prior hackathon codebase — read-only reference for porting
  if (abs.startsWith(PRIOR_HACKATHON + '/') || abs === PRIOR_HACKATHON) return true;
  // Common safe globals
  if (abs.startsWith('/tmp/')) return true;
  if (abs === '/etc/hosts') return true;
  return false;
}

function isForbiddenRead(p) {
  if (!p) return false;
  // .env*.example is fine
  if (ALLOWED_READ_EXCEPTIONS.some((re) => re.test(p))) return false;
  return FORBIDDEN_READ.some((re) => re.test(p));
}

function isDanielOnlyWrite(rel) {
  return DANIEL_ONLY_WRITE.some((re) => re.test(rel));
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

function exit(allow, message) {
  if (allow) process.exit(0);
  process.stderr.write(`agent-guard: blocked — ${message}\n`);
  process.exit(2);
}

let raw;
try { raw = readFileSync(0, 'utf8'); } catch { exit(true); }

let payload;
try { payload = JSON.parse(raw); } catch { exit(true); }

const tool = payload.tool_name || payload.toolName || '';
const input = payload.tool_input || payload.toolInput || {};

// ─── Read tool ──────────────────────────────────────────────────────────────
if (tool === 'Read') {
  const p = input.file_path || input.filePath || '';
  if (isForbiddenRead(p)) exit(false, `path matches .env pattern: ${p}`);
  if (isOutsideRepo(p) && !isAllowedExternalRead(p)) {
    exit(false, `read outside repo blocked: ${p}`);
  }
  exit(true);
}

// ─── Edit / Write tools ─────────────────────────────────────────────────────
if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
  const p = input.file_path || input.filePath || '';
  if (isOutsideRepo(p)) {
    // /tmp is OK for ephemeral scripts
    if (isAbsolute(p) && p.startsWith('/tmp/')) exit(true);
    exit(false, `write outside repo blocked: ${p}`);
  }
  const rel = relToRepo(p);
  if (rel && isDanielOnlyWrite(rel)) {
    exit(false, `Daniel-only path: ${rel}. Open an issue proposing the change instead.`);
  }
  if (isForbiddenRead(p)) exit(false, `cannot write to .env: ${p}`);
  exit(true);
}

// ─── Bash tool ──────────────────────────────────────────────────────────────
if (tool === 'Bash') {
  const cmd = input.command || '';
  for (const rule of FORBIDDEN_BASH) {
    if (rule.pattern.test(cmd)) {
      exit(false, `${rule.reason} — command: ${cmd.slice(0, 120)}`);
    }
  }
  const envErr = checkBashEnvRef(cmd);
  if (envErr) exit(false, `${envErr} — command: ${cmd.slice(0, 120)}`);
  const netErr = checkBashNetwork(cmd);
  if (netErr) exit(false, `${netErr} — command: ${cmd.slice(0, 120)}`);
  exit(true);
}

// All other tools — allow
exit(true);
