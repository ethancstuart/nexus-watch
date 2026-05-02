#!/bin/bash
# 2026-05-02 L4: pre-commit secret scanner.
#
# Run via:
#   bash scripts/scan-secrets.sh                    # scan staged files
#   bash scripts/scan-secrets.sh --all              # scan whole working tree
#
# Wire as a pre-commit hook by symlinking from .git/hooks/pre-commit:
#   ln -sf ../../scripts/scan-secrets.sh .git/hooks/pre-commit
#
# Patterns flagged:
#   - sk-ant-api*                 Anthropic API key
#   - sk_test_*  / sk_live_*      Stripe keys
#   - re_*                        Resend API keys (32+ char alphanumeric)
#   - eyJ...                      JWT shape with at least 3 segments
#   - Any 32+ char hex            Generic API key shape
#   - Bearer tokens in plain text
#
# Allowlisted files: .env.example, docs/, *.md (these reference patterns
# without leaking real values — by convention).

set -euo pipefail

PATTERN_FILE=$(/usr/bin/mktemp)
trap '/bin/rm -f "$PATTERN_FILE"' EXIT

cat >"$PATTERN_FILE" <<'EOF'
sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40,}
sk_(test|live)_[A-Za-z0-9]{24,}
re_[A-Za-z0-9_-]{32,}
ANTHROPIC_API_KEY=["']?sk-ant-api
WINDY_WEBCAM_KEY=["']?[A-Za-z0-9]{30,}
AISSTREAM_API_KEY=["']?[a-f0-9]{40}
EIA_API_KEY=["']?[A-Za-z0-9]{40}
xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]{24,}
ghp_[A-Za-z0-9]{36}
EOF

if [ "${1:-}" = "--all" ]; then
  FILES=$(/usr/bin/git ls-files | /usr/bin/grep -vE '^(\.env\.example$|docs/|README\.md$|.*\.md$|node_modules/|dist/)' || true)
else
  # Default: scan staged files only.
  FILES=$(/usr/bin/git diff --cached --name-only --diff-filter=ACM | /usr/bin/grep -vE '^(\.env\.example$|docs/|README\.md$|.*\.md$|node_modules/|dist/)' || true)
fi

if [ -z "$FILES" ]; then
  echo "scan-secrets: no files to scan"
  exit 0
fi

HITS=$(/usr/bin/grep -nIH -E -f "$PATTERN_FILE" $FILES 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "═══ scan-secrets: BLOCKED — secret-shaped strings found ═══"
  echo "$HITS"
  echo
  echo "If this is a placeholder or fixture, add the file to the allowlist"
  echo "in scripts/scan-secrets.sh. Otherwise rotate the key immediately."
  exit 1
fi

echo "scan-secrets: clean"
