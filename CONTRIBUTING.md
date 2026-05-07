# Contributing to tweetly

Thanks for considering a contribution. This project is a community-maintained MCP/REST automation layer for X (Twitter); see the disclaimer in `README.md` before deploying.

## Development setup

```bash
git clone https://github.com/beydemirfurkan/tweetly.git
cd tweetly

npm install
npm --prefix backend install --legacy-peer-deps
npm --prefix frontend install
npx patchright install chromium

cp .env.example .env
# Generate a 32-byte master key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Paste it as ENCRYPTION_KEY in .env

docker compose up -d postgres
npm run db:migrate

# Two terminals:
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:3000
```

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm test
```

All three must pass. The CI in `.github/workflows/ci.yml` runs the same set plus integration tests.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add X` — new feature
- `fix: resolve Y` — bug fix
- `chore: update Z` — non-functional changes
- `docs: ...` — documentation only
- `refactor: ...` — code restructure without behavior change
- `test: ...` — test-only changes

Breaking changes: append `BREAKING CHANGE:` footer or use `feat!: ...`.

## Pull request checklist

- [ ] Branch is up-to-date with `main`
- [ ] `npm run lint`, `npm run typecheck`, `npm test` all pass
- [ ] New behavior has tests (unit at minimum; integration where it crosses module boundaries)
- [ ] If you touched the action engine, MCP tools, or auth: smoke-test with `npm run smoke:mcp` / `smoke:rest`
- [ ] README / CHANGELOG updated when user-visible behavior changes
- [ ] No personal data, real API keys, or production URLs in the diff

## Reporting issues

Use [GitHub Issues](https://github.com/beydemirfurkan/tweetly/issues). For security-sensitive reports, see `SECURITY.md` instead — please don't open a public issue for vulnerabilities.

## Licensing

All contributions are licensed under the MIT License (see `LICENSE`). By submitting a PR you confirm you have the right to license your contribution under those terms.
