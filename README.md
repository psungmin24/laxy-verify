# laxy-verify

Frontend quality gate for AI-generated code. Build + Lighthouse verification with grade output (Gold/Silver/Bronze/Unverified).

```bash
npx laxy-verify --init    # Auto-detect framework, generate config
npx laxy-verify .         # Run verification
npx laxy-verify --badge   # Show shields.io badge
```

## Quick Start

### 1. Initialize

```bash
cd your-project
npx laxy-verify --init
```

This generates `.laxy.yml` and `.github/workflows/laxy-verify.yml` automatically by detecting your framework and package manager.

### 2. Run Locally

```bash
npx laxy-verify .
```

### 3. Add to CI

Push the generated workflow file. Every PR gets a quality gate with grade comment and status check.

## Grades

| Grade | Requirement |
|-------|------------|
| **Silver** | Build passes + Lighthouse exceeds all thresholds |
| **Bronze** | Build passes (Lighthouse not run or below threshold) |
| **Unverified** | Build failed |

`fail_on` controls the minimum acceptable grade. Default: `bronze`.

## Configuration

All fields optional in `.laxy.yml`:

```yaml
framework: "auto"           # auto | nextjs | vite | cra | sveltekit
build_command: ""           # default: auto-detected from package.json
dev_command: ""             # default: auto-detected
package_manager: "auto"     # auto | npm | pnpm | yarn | bun
port: 3000                  # dev server port
build_timeout: 300          # seconds (default 5m)
dev_timeout: 60             # seconds for dev server start (90 in CI mode)
lighthouse_runs: 1          # @lhci/cli runs (CI mode auto-sets to 3)

thresholds:
  performance: 70           # CI mode applies -10 offset (effective: 60)
  accessibility: 85
  seo: 80
  best_practices: 80

fail_on: "bronze"           # unverified | bronze | silver | gold
                            # unverified = never fail (informational only)
```

**fail_on vs build failure:** Build failure always produces grade `Unverified` and exit code 1, regardless of `fail_on`. `fail_on: unverified` means informational only (always exit 0).

**--ci flag:** Lowers Performance threshold by 10, sets `lighthouse_runs=3` (when not explicitly set), and increases `dev_timeout` to 90s. Auto-set when `CI=true` env var exists.

## CLI Options

```
npx laxy-verify [project-dir]   Default: current directory

Options:
  --format   console | json       Output format (default: console)
  --ci                            CI mode: -10 Performance, runs=3
  --config   <path>               Path to .laxy.yml
  --fail-on  unverified|bronze|silver|gold  Override fail_on
  --skip-lighthouse               Build-only verification (max Bronze)
  --badge                         Show shields.io badge (reads .laxy-result.json)
  --init                          Generate .laxy.yml + GitHub workflow
```

## exit codes

| Code | Meaning |
|------|--------|
| 0 | Grade meets or exceeds `fail_on` threshold |
| 1 | Grade worse than `fail_on`, or build failed |
| 2 | Configuration error (no package.json, invalid YAML, etc.) |

## GitHub Action

```yaml
- uses: psungmin24/laxy-verify@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on: silver    # optional, default: bronze
    config: .laxy.yml  # optional
```

Posts a PR comment with grade and Lighthouse scores, and sets a commit status check.

## Limitations (v1)

- **Monorepos:** Not supported. Run `npx laxy-verify apps/web` for the app subdirectory.
- **Lighthouse accuracy:** Scores are measured in dev mode (`npm run dev`). Production scores are typically higher.
- **Fork PRs:** Comments and status checks are not posted on PRs from forks (GitHub security restriction).
- **Yarn Berry:** May require manual `package_manager` configuration if using Corepack.

## Expected CI Timing

- Build: 15-30s
- Dev server start: 5-20s
- Lighthouse (1 run): ~15s
- Lighthouse (3 runs CI): ~45s
- **Total: 35-95s per PR**

## .laxy-result.json

Written after every run:

```json
{
  "grade": "Silver",
  "timestamp": "2026-04-07T10:30:00Z",
  "build": { "success": true, "durationMs": 12300, "errors": [] },
  "lighthouse": { "performance": 87, "accessibility": 92, "seo": 88, "bestPractices": 90, "runs": 1 },
  "thresholds": { "performance": 70, "accessibility": 85, "seo": 80, "bestPractices": 80 },
  "ciMode": false,
  "framework": "nextjs",
  "exitCode": 0,
  "config_fail_on": "bronze"
}
```

Use `npx laxy-verify --badge` to output a shields.io badge markdown from this file.

## Badge

```bash
npx laxy-verify --badge
```

Output: `![Laxy Verify: Silver](https://img.shields.io/badge/laxy_verify-silver-brightgreen)`

## License

MIT
