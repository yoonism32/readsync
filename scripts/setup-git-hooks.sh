#!/usr/bin/env bash
# Install local git hooks.
# Run once after cloning: ./scripts/setup-git-hooks.sh

set -euo pipefail

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/usr/bin/env bash
# Run tests and TypeScript type check before push.
set -euo pipefail
echo "Running regression tests..."
npm test
echo "Running TypeScript check..."
npx tsc --noEmit
echo "All checks passed"
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo "Installed pre-push hook (TypeScript check)"
