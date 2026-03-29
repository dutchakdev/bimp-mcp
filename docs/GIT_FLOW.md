# Git Workflow

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable, always deployable. Protected -- requires PR to merge. |
| `feature/*` | New features and capabilities |
| `fix/*` | Bug fixes |
| `chore/*` | Maintenance, dependency updates, CI changes |

### Branch Naming

Use lowercase with hyphens. Be descriptive:

```
feature/add-inventory-tools
feature/cursor-pagination-support
fix/auth-token-refresh
fix/fetch-all-empty-response
chore/update-sdk-dependency
chore/add-eslint-config
```

## Commit Messages

Format: `type: description`

| Type | Usage |
|------|-------|
| `feat` | New feature, new tool, new prompt |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Maintenance, deps, config |
| `refactor` | Code restructuring without behavior change |

Keep the description concise and in lowercase:

```
feat: add bimp_fetch_all utility tool
fix: handle 401 during token refresh
test: add integration tests for cursor pagination
docs: add contributing guide
chore: update @modelcontextprotocol/sdk to 1.13.0
refactor: extract pagination logic from utilities
```

## Pull Request Process

1. Create a branch from `main`
2. Make changes, commit with appropriate messages
3. Push the branch and open a PR against `main`
4. Ensure tests pass
5. Get review if applicable
6. Squash merge into `main`

## Merging

- **Squash merge** is preferred for feature and fix branches to keep `main` history clean.
- Delete the branch after merging.
- Do not force-push to `main`.
