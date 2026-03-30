#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh [patch|minor|major] ["Release notes here"]
# Default: patch
# If no release notes provided, generates them from git log

BUMP_TYPE="${1:-patch}"
RELEASE_NOTES="${2:-}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major] [\"release notes\"]"
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

# Get current and previous version
OLD_VERSION=$(node -p "require('./package.json').version")
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
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

# Auto-generate release notes from git log if not provided
if [[ -z "$RELEASE_NOTES" ]]; then
  echo ""
  echo "Generating release notes from git log..."
  if [[ -n "$PREV_TAG" ]]; then
    RELEASE_NOTES=$(git log "$PREV_TAG"..HEAD --pretty=format:"- %s" --no-merges | grep -v "^- release:" || true)
  else
    RELEASE_NOTES="Initial release"
  fi
fi

echo ""
echo "Release notes:"
echo "$RELEASE_NOTES"
echo ""

# Commit, tag (with release notes as tag message), push
git add package.json package-lock.json src/index.ts
git commit -m "release: v$NEW_VERSION"

git tag -a "v$NEW_VERSION" -m "$(cat <<EOF
v$NEW_VERSION

$RELEASE_NOTES
EOF
)"

git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions will: build → test → npm publish → GitHub Packages → GitHub Release"
echo ""
echo "Track: https://github.com/dutchakdev/bimp-mcp/actions"
