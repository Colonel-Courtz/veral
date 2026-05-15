#!/usr/bin/env node
// PreToolUse hook: deny any tool call that would touch .env files.
// Belt + braces over permissions.deny — deny-lists have been documented to leak.

import { readFileSync } from 'node:fs';

// Match .env, .env.local, .env.production etc. but NOT .env.example (sample committed file).
const FORBIDDEN_PATHS = /(^|\/)\.env(\.[a-z]+(\.[a-z]+)?)?$/;
const ALLOWED_PATHS = /(^|\/)\.env\.example$/;
const SENSITIVE_BASH_VERBS = /(^|[\s|;&])(cat|less|more|head|tail|grep|awk|sed|cp|mv|tee|curl|xxd|od|hexdump|base64|strings|sort|uniq|jq|node|python3?|ruby|perl)\b/i;
const ENV_REF = /\.env(\.[a-z][a-z0-9_-]*)?(?=\s|$|[|;&'"])/g;

function exit(allow, message) {
  if (allow) {
    process.exit(0);
  }
  process.stderr.write(`env-guard: blocked — ${message}\n`);
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(0, 'utf8');
} catch {
  exit(true);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  exit(true);
}

const tool = payload.tool_name || payload.toolName || '';
const input = payload.tool_input || payload.toolInput || {};

if (tool === 'Read' || tool === 'Edit' || tool === 'Write') {
  const path = input.file_path || input.filePath || '';
  if (ALLOWED_PATHS.test(path)) {
    exit(true);
  }
  if (FORBIDDEN_PATHS.test(path)) {
    exit(false, `path matches .env pattern: ${path}`);
  }
}

if (tool === 'Bash') {
  const cmd = input.command || '';
  if (!SENSITIVE_BASH_VERBS.test(cmd)) {
    exit(true);
  }
  const refs = cmd.match(ENV_REF) || [];
  for (const ref of refs) {
    if (ref === '.env.example') continue;
    exit(false, `bash command references ${ref}: ${cmd.slice(0, 120)}`);
  }
}

exit(true);
