# laxy-verify

A frontend verification CLI that catches build breaks, regressions, and client-visible issues before you ship.

`laxy-verify` runs production build checks, Lighthouse, tiered verify E2E, and plan-gated verification for Free, Pro, and Pro+ accounts.
It is built around three simple questions:

- Free: "Any critical issues right now?"
- Pro: "Ready to show a client?"
- Pro+: "Ready for production?"

```bash
npx laxy-verify --init --run
npx laxy-verify .
npx laxy-verify . --plan-override pro
npx laxy-verify login
npx laxy-verify whoami
npx laxy-verify --help
```

What you get from one run:

- a verification grade: `Gold`, `Silver`, `Bronze`, or `Unverified`
- a decision-oriented verdict such as `client-ready`, `release-ready`, `hold`, or `investigate`
- `.laxy-result.json` for automation
- `laxy-verify-report.md` on paid plans for human review and AI handoff

## Quick Start

### 1. Run it on a frontend app

```bash
cd your-project
npx laxy-verify .
```

This runs the default verification flow in the current app directory.

### 2. Generate config and CI workflow

```bash
npx laxy-verify --init
```

This creates:

- `.laxy.yml`
- `.github/workflows/laxy-verify.yml`

### 3. Commit the workflow

Once committed, each PR gets a verification run, grade output, and optional GitHub reporting.

### 4. Unlock paid plan features

```bash
npx laxy-verify login
npx laxy-verify whoami
```

For CI, set `LAXY_TOKEN` instead of using interactive login.

```yaml
env:
  LAXY_TOKEN: ${{ secrets.LAXY_TOKEN }}
```

## What It Checks

- production build success
- Lighthouse thresholds
- verify E2E scenarios for real user flows
- Pro+ viewport and visual regression evidence
- plan-aware verdicts for local runs and CI

## Verification Tiers

| Plan | Question it answers |
|------|---------------------|
| Free | Any critical issues right now? |
| Pro | Ready to show a client? |
| Pro+ | Ready for production? |

## Grades

| Grade | Meaning |
|-------|---------|
| Gold | Build passed + E2E passed + Lighthouse passed + Pro+ viewport evidence passed |
| Silver | Build passed + E2E passed |
| Bronze | Build passed |
| Unverified | Build failed |

## Plan Differences

| Feature | Free | Pro | Pro+ |
|---------|------|-----|------|
| Build verification | Yes | Yes | Yes |
| Lighthouse | 1 run | 3 runs | 3 runs |
| Verify E2E | Smoke checks | Client-facing flow checks | Client-facing flow checks + release evidence |
| Detailed report view | No | Yes | Yes |
| `laxy-verify-report.md` export | No | Yes | Yes |
| Multi-viewport verification | No | No | Yes |
| Visual diff | No | No | Yes |
| Failure analysis signals | No | No | Yes |

Free tells you whether the app is basically standing.
Pro tells you whether the app is strong enough to call client-ready.
Pro+ adds the extra evidence needed for a real release-ready call.

## Sample Output

```text
Plan: Pro+
Grade: Gold
Verdict: release-ready

Passed:
- production build
- Lighthouse thresholds
- core E2E flows
- desktop, tablet, and mobile viewport checks

Artifacts:
- .laxy-result.json
- laxy-verify-report.md
```

## Configuration

All fields are optional in `.laxy.yml`.

```yaml
framework: "auto"
build_command: ""
dev_command: ""
package_manager: "auto"
port: 3000
build_timeout: 300
dev_timeout: 60
lighthouse_runs: 1

thresholds:
  performance: 70
  accessibility: 85
  seo: 80
  best_practices: 80

fail_on: "bronze"
```

Typical cases:

- raise `fail_on` to `silver` or `gold` in CI when you want stricter gates
- set `framework`, `build_command`, or `dev_command` if auto-detection is not enough
- increase `lighthouse_runs` when you want more stable performance evidence

## CLI Options

```text
npx laxy-verify [project-dir]

Options:
  --format console|json
  --ci
  --config <path>
  --fail-on unverified|bronze|silver|gold
  --skip-lighthouse
  --plan-override free|pro|pro_plus
  --badge
  --init
  --multi-viewport
  --help

Subcommands:
  login [email]
  logout
  whoami
```

`--plan-override` is for downgrade testing only.
Example: if your account is Pro+, you can run `--plan-override pro` or `--plan-override free` to verify the lower-tier behavior without changing your subscription.
It will reject upgrades above your real entitlement.

## Result Files

Each run writes `.laxy-result.json`.

Paid plans also write a readable markdown summary to `laxy-verify-report.md`.

- `Pro`: client-ready delivery report
- `Pro+`: release-readiness report with viewport and visual evidence

Exit behavior follows the verification verdict, not just the legacy grade.

- `build-failed` -> exit 1
- `hold` -> exit 1
- `Pro+ investigate` -> exit 1
- plain lower-tier pass states can still exit 0

```json
{
  "grade": "Gold",
  "timestamp": "2026-04-09T09:00:00Z",
  "build": { "success": true, "durationMs": 12000, "errors": [] },
  "e2e": { "passed": 5, "failed": 0, "total": 5, "results": [] },
  "lighthouse": { "performance": 82, "accessibility": 94, "seo": 90, "bestPractices": 92, "runs": 3 },
  "multiViewport": {
    "allPassed": true,
    "summary": "Desktop, tablet, and mobile checks passed."
  },
  "visualDiff": {
    "verdict": "pass",
    "differencePercentage": 0
  },
  "verification": {
    "tier": "pro_plus",
    "report": { "verdict": "release-ready" }
  },
  "exitCode": 0,
  "_plan": "pro_plus"
}
```

### `laxy-verify-report.md`

For Pro and Pro+ runs, the markdown report is designed to be easy to read and easy to paste into an AI coding tool.

It includes:

- the main decision in plain English
- what passed
- blockers and warnings
- exact verification evidence
- failed E2E scenarios
- a `Copy For AI` section you can paste directly into Codex, Cursor, Claude, or ChatGPT

## Environment Notes

- Best on current LTS Node releases. `Node 20.18+` is recommended.
- Monorepos should point `laxy-verify` at the actual app directory.
- `playwright` is optional. The CLI can run without it.
- Pro+ viewport and visual checks increase runtime.

## Regression Fixtures

The repo also includes dedicated regression fixtures under `.qa-regression-fixtures/`.
They intentionally break build, navigation, coverage, performance, viewport behavior, and visual stability so the verifier can be tested against known failure modes.

## Limitations

- Monorepos require targeting the app subdirectory explicitly.
- Dev-server-based Lighthouse can differ from production hosting.
- Pro+ visual diff and viewport checks increase runtime.
- Local verification is most stable on current LTS Node releases.

## Links

- GitHub: https://github.com/SUNgm24/Laxy/tree/main/laxy-verify
- Issues: https://github.com/SUNgm24/Laxy/issues

## License

MIT
