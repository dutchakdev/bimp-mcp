# Contributing to bimp-mcp

Thank you for your interest in contributing. This guide covers the development setup, common workflows, and expectations for pull requests.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/dutchakdev/bimp-mcp.git
   cd bimp-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your BIMP credentials:
   ```bash
   cp .env.example .env
   ```

4. Start in development mode:
   ```bash
   npm run dev
   ```

## Adding New API Endpoints

The server generates tools dynamically from `bimp-api.json`. No code changes are needed for new endpoints.

1. Open `bimp-api.json`
2. Add the endpoint in OpenAPI 3.1 format, including: path, method, requestBody schema, response schema, tags, and security
3. Restart the server -- the new tool is auto-generated
4. Verify the tool appears with the correct name and schema
5. Add an integration test in `tests/integration/crud.test.ts`

Endpoint discovery tips: inspect network requests at `app.bimpsoft.com` to find undocumented endpoints. See `.claude/skills/bimp-api-discovery.md` for a detailed workflow.

## Adding Utility Tools

Utility tools live in `src/utilities.ts`. To add a new one:

1. Define the tool name, description, and input schema (using Zod)
2. Implement the handler function
3. Register it alongside the existing utility tools in the tool list
4. Add unit tests in `tests/unit/utilities.test.ts` (with mocked client)
5. Add functional tests in `tests/functional/`

## Adding Prompts

MCP prompts are defined in `src/prompts.ts`. To add a new prompt:

1. Define the prompt name, description, and message content
2. Register it in the prompts list
3. Follow the existing pattern: provide actionable context that helps an LLM work with BIMP data

## Testing Requirements

All contributions must include tests. The project uses three test tiers:

| Tier | Command | Description |
|------|---------|-------------|
| **Unit** | `npm test` | Mocked dependencies, fast, no API calls. Required for all logic changes. |
| **Integration** | `npm run test:integration` | Real API calls to the test company (nailsmade shop, code `000001398`). Required for new endpoints. |
| **Functional** | `npm run test:functional` | End-to-end scenarios. Required for utility tool changes. |

- Unit tests must pass for every PR
- Integration and functional tests run against a test company -- create test data, verify, then clean up
- Run `npm run test:all` before submitting

## Pull Request Process

1. Create a feature or fix branch from `main` (see [GIT_FLOW.md](docs/GIT_FLOW.md))
2. Make your changes with appropriate tests
3. Ensure all relevant tests pass
4. Submit a PR against `main`
5. Describe what changed and why in the PR description
6. Squash merge is preferred

## Code Standards

See [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md) for naming conventions, file organization, and style rules.

## Code of Conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct.
