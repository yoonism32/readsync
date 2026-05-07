#!/usr/bin/env bash
# Clean up merged and stale local branches.
# Usage: ./scripts/git-clean-branches.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "main")

echo "Default branch: $DEFAULT_BRANCH"
echo ""

# Fetch and prune remote-tracking branches that no longer exist on the remote
echo "Pruning remote-tracking branches..."
git fetch --prune origin

# Find merged branches (excluding current and default)
MERGED=$(git branch --merged "$DEFAULT_BRANCH" | grep -v "^\*" | grep -v "^\s*$DEFAULT_BRANCH$" || true)

if [[ -z "$MERGED" ]]; then
  echo "No merged branches to clean up."
else
  echo "Merged branches to delete:"
  echo "$MERGED"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] Would delete the above branches."
  else
    echo "$MERGED" | xargs git branch -d
    echo "Done."
  fi
fi

# Show branches with no upstream
echo ""
echo "Branches with no upstream (manual review):"
git branch -vv | grep ': gone]' | awk '{print $1}' || echo "  (none)"
