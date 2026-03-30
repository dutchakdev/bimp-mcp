#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/release.sh patch                     # auto-generates release notes
#   ./scripts/release.sh minor "Summary of release" # with custom summary
#   ./scripts/release.sh major                      # major bump

BUMP_TYPE="${1:-patch}"
SUMMARY="${2:-}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major] [\"summary\"]"
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

# Get versions
OLD_VERSION=$(node -p "require('./package.json').version")
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
echo "Current version: v$OLD_VERSION"

# Bump version
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
NEW_VERSION="${NEW_VERSION#v}"
echo "New version:     v$NEW_VERSION"

# Sync version in src/index.ts
sed -i '' "s/version: \"[0-9]*\.[0-9]*\.[0-9]*\"/version: \"$NEW_VERSION\"/" src/index.ts

# Build + test
echo ""
echo "Building..."
npm run build
echo "Testing..."
npx vitest run --project unit

# Generate changelog from commits
CHANGELOG=""
if [[ -n "$PREV_TAG" ]]; then
  # Group commits by type
  FEATS=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -E "^feat:" | sed 's/^feat: /- /' || true)
  FIXES=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -E "^fix:" | sed 's/^fix: /- /' || true)
  DOCS=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -E "^docs:" | sed 's/^docs: /- /' || true)
  CI=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -E "^ci:" | sed 's/^ci: /- /' || true)
  TESTS=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -E "^test:" | sed 's/^test: /- /' || true)
  OTHER=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" --no-merges | grep -vE "^(feat|fix|docs|ci|test|chore|release):" | sed 's/^/- /' || true)

  [[ -n "$FEATS" ]] && CHANGELOG+=$'\n'"### Features"$'\n'"$FEATS"$'\n'
  [[ -n "$FIXES" ]] && CHANGELOG+=$'\n'"### Fixes"$'\n'"$FIXES"$'\n'
  [[ -n "$DOCS" ]] && CHANGELOG+=$'\n'"### Documentation"$'\n'"$DOCS"$'\n'
  [[ -n "$CI" ]] && CHANGELOG+=$'\n'"### CI/CD"$'\n'"$CI"$'\n'
  [[ -n "$TESTS" ]] && CHANGELOG+=$'\n'"### Tests"$'\n'"$TESTS"$'\n'
  [[ -n "$OTHER" ]] && CHANGELOG+=$'\n'"### Other"$'\n'"$OTHER"$'\n'
fi

# Build release notes
if [[ -z "$SUMMARY" ]]; then
  # Auto-generate summary from the most impactful commit
  if [[ -n "$FEATS" ]]; then
    SUMMARY=$(echo "$FEATS" | head -1 | sed 's/^- //')
  elif [[ -n "$FIXES" ]]; then
    SUMMARY=$(echo "$FIXES" | head -1 | sed 's/^- //')
  else
    SUMMARY="Maintenance release"
  fi
fi

RELEASE_NOTES="$SUMMARY"
if [[ -n "$CHANGELOG" ]]; then
  RELEASE_NOTES+=$'\n'"$CHANGELOG"
fi

RELEASE_NOTES+=$'\n'"---"$'\n'
RELEASE_NOTES+="**Install:** \`claude mcp add bimp -s user -t stdio -e BIMP_EMAIL=... -e BIMP_PASSWORD=... -e BIMP_COMPANY_CODE=... -- npx -y bimp-mcp\`"$'\n'
RELEASE_NOTES+="**npm:** \`npx -y bimp-mcp@$NEW_VERSION\`"$'\n'
RELEASE_NOTES+="**Skills:** \`npx skills add dutchakdev/bimp-mcp\`"

echo ""
echo "════════════════════════════════════"
echo "  Release Notes for v$NEW_VERSION"
echo "════════════════════════════════════"
echo "$RELEASE_NOTES"
echo "════════════════════════════════════"
echo ""

# Commit + tag + push
git add package.json package-lock.json src/index.ts
git commit -m "release: v$NEW_VERSION"

git tag -a "v$NEW_VERSION" -m "$(printf "v%s\n\n%s" "$NEW_VERSION" "$RELEASE_NOTES")"

git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions: build → test → npm → GitHub Packages → GitHub Release"
echo "Track: https://github.com/dutchakdev/bimp-mcp/actions"
