# Versioning

This project follows [Semantic Versioning](https://semver.org/) (SemVer): `MAJOR.MINOR.PATCH`.

## Version Increments

### MAJOR (breaking changes)

Increment when existing consumers would break:

- Renaming or removing existing tool names
- Changing tool input schemas in incompatible ways (removing fields, changing types)
- Changing the authentication flow or required environment variables
- Removing or renaming MCP prompts

### MINOR (new functionality)

Increment when adding capabilities without breaking existing ones:

- New auto-generated tools (new endpoints in `bimp-api.json`)
- New utility tools
- New MCP prompts
- New optional parameters on existing tools
- New environment variable options (with backward-compatible defaults)

### PATCH (fixes and internal changes)

Increment for changes invisible to consumers:

- Bug fixes
- Documentation updates
- Internal refactoring
- Test additions or improvements
- Dependency updates (non-breaking)

## API Spec Updates

Changes to `bimp-api.json` require careful classification:

| Change | Version Impact |
|--------|---------------|
| New endpoints added | MINOR -- new tools appear |
| Existing endpoint gets new optional fields | PATCH -- existing calls still work |
| Existing endpoint changes required fields | MAJOR -- existing calls may break |
| Existing endpoint removed | MAJOR -- tools disappear |
| Response schema changes | Evaluate per case -- if consumers depend on specific fields, it may be MAJOR |

## Current Version

The version is tracked in `package.json`. Update it as part of the PR that introduces the change.
