#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { execSync } from 'node:child_process';

const FORBIDDEN_TAG = /\b(US|GATE|EPIC|TICKET|STORY|TASK)-\d+/;
const FILE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|dist|\.next|\.turbo|coverage|migrations)\//;

function listTracked() {
  const out = execSync('git ls-files', { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((p) => FILE_EXT.test(p) && !SKIP.test(p));
}

function findOffenders(source, filePath) {
  const offenders = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(/(\/\/|^\s*\*|\/\*)(.*)$/);
    if (!m) continue;
    const commentText = m[2];
    if (commentText && FORBIDDEN_TAG.test(commentText)) {
      offenders.push({ file: filePath, line: i + 1, text: line.trim() });
    }
  }
  return offenders;
}

async function main() {
  const files = listTracked();
  const allOffenders = [];
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    const offenders = findOffenders(src, f);
    allOffenders.push(...offenders);
  }
  if (allOffenders.length === 0) {
    console.log('lint-comments: ok (no reference-tag comments)');
    return;
  }
  console.error('lint-comments: forbidden reference-tag comments found (CLAUDE.md rule 2):');
  for (const o of allOffenders) {
    console.error(`  ${relative(process.cwd(), o.file)}:${o.line}: ${o.text}`);
  }
  console.error('');
  console.error('Move ticket references to PR descriptions / commit messages / GitHub Issues.');
  process.exit(1);
}

main().catch((err) => {
  console.error('lint-comments: crashed:', err);
  process.exit(2);
});
