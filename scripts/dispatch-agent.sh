#!/usr/bin/env bash
# Dispatch a fresh Claude Code agent on a single Veral issue.
#
# Usage:
#   scripts/dispatch-agent.sh <issue-number>
#   scripts/dispatch-agent.sh           # interactive: shows ready frontier
#
# What it does:
#   1. Validates the issue exists, is open, and is not gated (requires:daniel,
#      requires:human-review, agent-claimed) or blocked (Depends on != none).
#   2. Builds the canonical 12-line prompt with the issue number substituted.
#   3. Copies the prompt to the macOS clipboard via pbcopy.
#   4. Prints next-step instructions for opening Claude Code.
#
# Why not auto-launch:
#   Opening a new Terminal tab + sending keystrokes to it is macOS-fragile.
#   Copy-to-clipboard keeps the workflow simple and editor-agnostic — paste it
#   into Claude Code, Cursor, or any other agent surface.

set -e

REPO="B2JK-Industry/veral"

color() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
red()    { color "31" "$1"; }
green()  { color "32" "$1"; }
yellow() { color "33" "$1"; }
blue()   { color "34" "$1"; }

frontier() {
  blue "Ready-to-pick P0 issues (no deps, not gated):"
  gh issue list --repo "$REPO" --state open --label "tier:P0" --limit 100 \
    --json number,title,body,labels \
    --jq '.[]
          | select(.labels | map(.name) | (contains(["requires:daniel"]) or contains(["requires:human-review"]) or contains(["agent-claimed"])) | not)
          | select(.body | test("Depends on:\\*\\* _none_"))
          | "  #\(.number): \(.title)"'
}

if [ -z "$1" ]; then
  frontier
  echo ""
  echo "Pick a number, then run: scripts/dispatch-agent.sh <num>"
  exit 0
fi

NUM="$1"

if ! [[ "$NUM" =~ ^[0-9]+$ ]]; then
  red "Error: issue number must be an integer (got: $NUM)"
  exit 1
fi

# Fetch issue state
ISSUE_JSON=$(gh issue view "$NUM" --repo "$REPO" --json number,title,state,labels,body 2>/dev/null || true)
if [ -z "$ISSUE_JSON" ]; then
  red "Error: issue #$NUM not found in $REPO"
  exit 1
fi

STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
if [ "$STATE" != "OPEN" ]; then
  red "Error: issue #$NUM is $STATE, not OPEN"
  exit 1
fi

# Check labels
LABELS=$(echo "$ISSUE_JSON" | jq -r '.labels[].name')
for blocker in "requires:daniel" "requires:human-review" "agent-claimed"; do
  if echo "$LABELS" | grep -q "^$blocker$"; then
    red "Error: issue #$NUM has label '$blocker' — not for autonomous agents"
    exit 1
  fi
done

# Check dependencies
BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
if ! echo "$BODY" | grep -q "Depends on:\*\* _none_"; then
  DEPS_LINE=$(echo "$BODY" | grep "Depends on:" || true)
  yellow "Warning: issue #$NUM has dependencies:"
  yellow "  $DEPS_LINE"
  echo ""
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')

# Build prompt
PROMPT="You are picking up issue B2JK-Industry/veral#${NUM} on Veral.

Read in order (every file, fully):
1. .github/AGENT_BOOTSTRAP.md
2. CLAUDE.md
3. CONTRIBUTING.md
4. The AGENTS.md of the package this issue targets
5. The issue body: gh issue view ${NUM} --repo B2JK-Industry/veral

After reading, follow the flow in AGENT_BOOTSTRAP.md section 5 exactly.
Do not deviate. Do not refactor adjacent code. Open one PR that closes
issue #${NUM}. Stop when CI is green and the PR is awaiting review."

# Copy to clipboard (macOS)
if command -v pbcopy >/dev/null 2>&1; then
  printf "%s" "$PROMPT" | pbcopy
  CLIPBOARD_NOTE="(copied to clipboard)"
else
  CLIPBOARD_NOTE="(pbcopy not found — copy the prompt above manually)"
fi

echo ""
green "Dispatching agent for #${NUM}: ${TITLE}"
echo ""
blue "Prompt $CLIPBOARD_NOTE:"
echo ""
echo "$PROMPT"
echo ""
yellow "Next steps:"
echo "  1. Open a new terminal tab (Cmd+T)"
echo "  2. cd ~/Desktop/Veral"
echo "  3. claude --dangerously-skip-permissions"
echo "  4. Paste (Cmd+V) and Enter"
echo ""
yellow "Track progress:"
echo "  gh pr list --repo $REPO"
echo "  gh issue view $NUM --repo $REPO"
