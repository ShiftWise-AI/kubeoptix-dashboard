# CI/CD Audit and Operations

## Findings (2026-10-09)

The existing workflow already triggered on `push` to `main`; the latest main
run succeeded. The observed gaps were no test/security gates, mutable Action
tags, publishing independent of GitFlow validation, and cancellable main runs.
All 21 protected GitFlow branches across the seven repositories required only
`check-flow`, with zero approvals and no up-to-date branch requirement.
Repository secrets were empty; organization secret visibility returned 403.

## Pipeline and Security

PRs to `develop`, `stage`, and `main`, pushes to those branches, and merge queues
run GitFlow, npm lint/tests/build, workflow syntax validation, dependency/secret
scans, container build, non-root inspection, and final-image configuration,
vulnerability, and secret scans. `ci-required` rejects failure, cancellation,
or skipped dependencies. Trivy v0.69.3 blocks HIGH/CRITICAL, including unfixed
findings. Action SHAs are fixed, actionlint v1.7.7 is checksum-verified, token
permissions are `contents: read`, and checkout credentials are not persisted.

Only main pushes and valid `vMAJOR.MINOR.PATCH` tags publish, after all scans.
The scanned image is pushed without rebuilding to
`quay.io/parraes/kubeoptix-dashboard`: main keeps `latest` and `sha-<commit>`;
releases keep version and SHA tags. Tags must belong to main history. PRs,
stage, develop, and merge queues do not log in or access Quay secrets. Main
runs are not actively cancelled; GitHub can coalesce pending concurrent runs.

## GitHub and Quay Setup

Protections were applied and verified remotely for all three branches: require
`check-flow` and `ci-required` from GitHub Actions, an up-to-date branch, at
least one approval, stale-review dismissal, last-push approval, enforcement
for admins, no force pushes, and no branch deletion. Existing checks remain.
GitHub allows an APPROVE review even with failing checks, but blocks integration.

Publish these changes on the existing feature branch and open a PR to develop.
Require the new green check and an independent review, then promote
`develop -> stage -> main`. Existing PRs without `ci-required` are blocked until
the updated workflow runs. Keep pinned Actions permitted by organization policy.
Protect `v*` tags with a ruleset limiting creation to release maintainers and
disallowing update/deletion. A `GITHUB_TOKEN`-created push does not trigger a
second workflow; use an approved GitHub App for automated release tags.

Create a Quay robot with Write access only to the destination repository.
Set Actions secrets `QUAY_USERNAME` (full `namespace+robot`) and `QUAY_PASSWORD`
(robot token), at repository or restricted organization scope. Organization
secrets must include this repository. Never print tokens, enable shell tracing,
or store credentials in files/command arguments. Enable Quay scan notifications.

## Validation and Acceptance

All 14 workflows passed actionlint, aggregate gate failure cases and 63 GitFlow
cases passed, and all 21 protections were re-read. Dashboard: lint passed with
existing warnings, 11 tests passed, and TypeScript/Vite build passed. Source
scans reported no HIGH/CRITICAL findings or secrets. A clean `npm ci` and final
image build/scan still need CI execution. No changed workflows were committed,
pushed, or executed remotely, and no image was published during this audit.
Acceptance requires a failing PR to remain unmergeable, a reviewed green
promotion to main, and Quay receiving the exact scanned main image.