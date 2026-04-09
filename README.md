# laxy-verify

CLI verification for frontend apps.

`laxy-verify` runs production build checks, Lighthouse, tiered verify E2E, and plan-gated verification features for Free, Pro, and Pro+ accounts.

```bash
npx laxy-verify --init --run
npx laxy-verify .
npx laxy-verify login
npx laxy-verify whoami
npx laxy-verify --help
```

## Quick Start

### 1. Initialize

```bash
cd your-project
npx laxy-verify --init
```

This generates `.laxy.yml` and a GitHub Actions workflow.

### 2. Run locally

```bash
npx laxy-verify .
```

### 3. Add to CI

Commit the generated workflow. Each PR gets a verification run, grade output, and optional GitHub reporting.

## Verification Tiers

| Plan | Question it answers |
|------|---------------------|
| Free | Is this likely to break right now? |
| Pro | Is this strong enough to send to a client? |
| Pro+ | Can I call this release-ready with confidence? |

## Grades

| Grade | Meaning |
|-------|---------|
| Gold | Build passed + E2E passed + Lighthouse passed + Pro+ viewport evidence passed |
| Silver | Build passed + E2E passed |
| Bronze | Build passed |
| Unverified | Build failed |

## Paid Features

Log in with your Laxy account to unlock paid plan features.

```bash
npx laxy-verify login
npx laxy-verify whoami
npx laxy-verify logout
```

| Feature | Free | Pro | Pro+ |
|---------|------|-----|------|
| Build verification | Yes | Yes | Yes |
| Lighthouse | 1 run | 3 runs | 3 runs |
| Verify E2E | Smoke | Deeper client-send checks | Deeper client-send checks |
| Detailed report view | No | Yes | Yes |
| Report export | No | Yes | Yes |
| Multi-viewport verification | No | No | Yes |
| Visual diff | No | No | Yes |
| Failure analysis signals | No | No | Yes |

For CI, set `LAXY_TOKEN` instead of using interactive login.

```yaml
env:
  LAXY_TOKEN: ${{ secrets.LAXY_TOKEN }}
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

## CLI Options

```text
npx laxy-verify [project-dir]

Options:
  --format console|json
  --ci
  --config <path>
  --fail-on unverified|bronze|silver|gold
  --skip-lighthouse
  --badge
  --init
  --multi-viewport
  --help

Subcommands:
  login [email]
  logout
  whoami
```

## Result File

Each run writes `.laxy-result.json`.

```json
{
  "grade": "Silver",
  "timestamp": "2026-04-09T09:00:00Z",
  "build": { "success": true, "durationMs": 12000, "errors": [] },
  "e2e": { "passed": 4, "failed": 0, "total": 4, "results": [] },
  "lighthouse": { "performance": 82, "accessibility": 94, "seo": 90, "bestPractices": 92, "runs": 3 },
  "exitCode": 0,
  "_plan": "pro"
}
```

## Limitations

- Monorepos require targeting the app subdirectory explicitly.
- Dev-server-based Lighthouse can differ from production hosting.
- Pro+ visual diff and viewport checks increase runtime.

## License

MIT
