# Maintaining tweetly

Operational notes for repository maintainers. Contributor-facing setup lives in
[CONTRIBUTING.md](./CONTRIBUTING.md); this file documents the maintainer side of
the workflow — review cadence, fork-PR handling, branch protection, and the
dependabot pipeline.

## Branch protection

`main` is protected with the following rules (kept in sync via `gh api
repos/beydemirfurkan/tweetly/branches/main/protection`):

- Required status checks (strict — branch must be up to date with `main` before
  merge):
  - `Backend (build + unit + integration)`
  - `Frontend (build + lint + typecheck)`
- 1 required approving review (stale reviews dismissed on push)
- Conversation resolution required
- Linear history and force push allowed: no
- Admin enforcement: no (intentional — single-maintainer emergency override)

If you ever rename a CI job in `.github/workflows/ci.yml`, you **must** update
the required check contexts in branch protection or every PR will be permanently
`BLOCKED` regardless of CI outcome.

## Reviewing fork PRs (the "no checks reported" trap)

GitHub does not auto-run workflows for PRs opened from a fork by a first-time
contributor or an outside collaborator. The PR page shows "No checks reported"
and `gh pr view` returns an empty `statusCheckRollup`. Required status checks
therefore never go green and the PR becomes unmergeable through normal review.

**Workflow:**

1. Open the PR on GitHub.
2. Scroll to the bottom — banner reads
   _"First-time contributor — approve and run workflows"_.
3. Click **Approve and run workflows**. (Or via CLI:
   `gh api -X POST repos/beydemirfurkan/tweetly/actions/runs/<run_id>/approve`.)
4. Wait for CI. **Every new commit from the contributor requires re-approval**
   until you mark them as a trusted contributor in repo settings.
5. Once green, review and merge normally — no admin bypass needed.

The alternative — relaxing _Settings → Actions → Fork pull request workflows_
to "Require approval for all outside collaborators" or lower — opens the door
to CI-minute abuse via drive-by PRs that ship malicious workflow changes. The
manual approval step is the safer default; this doc exists so future
maintainers do not reach for `--admin` as a shortcut.

## Dependabot

Configuration: [`.github/dependabot.yml`](./.github/dependabot.yml). Weekly
Monday runs across `/backend`, `/frontend`, `/`, GitHub Actions, and the two
Dockerfiles. Production and development deps are grouped separately so security
patches are not blocked behind dev-tooling churn. Major bumps are ignored
globally; framework majors (Next.js, React) are ignored explicitly.

### Auto-merge (patch + minor)

[`.github/workflows/dependabot-auto-merge.yml`](./.github/workflows/dependabot-auto-merge.yml)
enables auto-merge on dependabot PRs whose semver bump is `patch` or `minor`.
Auto-merge waits for required status checks and the required approval, then
squash-merges. The workflow also posts the approval, so dependabot PRs do not
need a human approval.

For this to work the repo must have `allow_auto_merge: true`. Verify with:

```bash
gh api repos/beydemirfurkan/tweetly --jq '.allow_auto_merge'
```

If it returns `false`, re-enable it:

```bash
gh api -X PATCH repos/beydemirfurkan/tweetly -F allow_auto_merge=true
```

### Major bumps

Dependabot does not open major-bump PRs by default (see `ignore` block in
`dependabot.yml`). When you _do_ want to evaluate a major (e.g. NestJS 12,
Next.js 17), the safe path is:

1. Create a tracking issue describing the migration cost.
2. Bump the dependency manually in a feature branch.
3. Run the full integration suite plus a manual smoke against the executor
   surface (Patchright, MCP, OAuth flows).

### When a dependabot PR fails CI

- **Flaky test** (single integration test, unrelated to the diff): comment
  `@dependabot rebase` to re-run. If it flakes twice in a row, the test itself
  is the bug — open a separate issue and add the test to the flaky-test list
  before unblocking the bump.
- **Ecosystem incompatibility** (e.g. ESLint 10 breaks `eslint-plugin-react`):
  close the PR with `@dependabot ignore <package> major version` (or the minor
  variant). Add a brief comment explaining what is blocking so the next person
  doesn't reopen the same dead-end.
- **Real regression** (the bump broke something legitimate): close the PR with
  context, file an upstream issue if appropriate, and pin the previous version.

## Releasing

There is no published release artifact yet — the project is consumed via clone
and `npm install`. When that changes, document the cut process here.
