#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

BUMP_TYPE="${1:-patch}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree not clean. Commit or stash changes first."
  exit 1
fi

# Ensure on main
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main branch (currently on $BRANCH)"
  exit 1
fi

# Get current version
OLD_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $OLD_VERSION"

# Bump version in package.json (no git tag from npm)
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
NEW_VERSION="${NEW_VERSION#v}"
echo "New version: $NEW_VERSION"

# Sync version in src/index.ts
sed -i '' "s/version: \"[0-9]*\.[0-9]*\.[0-9]*\"/version: \"$NEW_VERSION\"/" src/index.ts

# Build to verify
echo "Building..."
npm run build

# Run tests
echo "Running tests..."
npx vitest run --project unit

# Commit, tag, push
git add package.json package-lock.json src/index.ts
git commit -m "release: v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions will now: build → test → publish to npm → create GitHub Release"
