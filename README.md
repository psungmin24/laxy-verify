# laxy-verify

Frontend quality gate for any project. Checks your build and runs a Lighthouse audit — outputs a Silver/Bronze/Unverified grade.

```bash
npx laxy-verify .
```

```
  Laxy Verify — ✅ Silver
  ========================================

  Build:          PASS (12.3s)

  Lighthouse Scores:
    Performance:     87  / 70  ✓
    Accessibility:   92  / 85  ✓
    SEO:             88  / 80  ✓
    Best Practices:  90  / 80  ✓

  Grade: Silver
```

> Want Gold? Gold requires E2E tests on top of build + Lighthouse. Run full verification at [laxy.dev](https://laxy.dev).

---

## Install

```bash
# Run once (no install needed)
npx laxy-verify .

# Or install globally
npm install -g laxy-verify
laxy-verify .
```

---

## Usage

```bash
laxy-verify [dir] [options]

Arguments:
  dir                   Project directory (default: current directory)

Options:
  --format <type>       Output format: console, json, md (default: console)
  --ci                  CI mode: relaxed thresholds, 3 Lighthouse runs
  --skip-lighthouse     Build check only, skip Lighthouse
  --runs <number>       Number of Lighthouse runs
  --port <number>       Dev server port (default: 3000)
```

### Examples

```bash
# Check current directory
npx laxy-verify .

# Build check only (fast)
npx laxy-verify . --skip-lighthouse

# CI mode with JSON output
npx laxy-verify . --ci --format json

# Markdown output (for PR comments)
npx laxy-verify . --format md
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Silver or Gold — all checks passed |
| `1` | Bronze — build passed, Lighthouse failed (soft fail) |
| `2` | Unverified — build failed |
| `3` | Config error — no package.json, no build script |

---

## Grades

| Grade | Condition |
|-------|-----------|
| ✅ Silver | Build passed + all Lighthouse thresholds met |
| 🔨 Bronze | Build passed, Lighthouse failed or skipped |
| ⚠️ Unverified | Build failed |

> 🏆 **Gold** requires E2E tests. Use [Laxy](https://laxy.dev) for full Gold verification.

---

## GitHub Action

Add this to `.github/workflows/verify.yml`:

```yaml
name: Laxy Verify

on:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: psungmin24/laxy-verify@v1
        with:
          format: md
```

On every PR, laxy-verify will:
1. Run `npm run build`
2. Start your dev server and run Lighthouse
3. Post a comment with the grade and scores

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `node-version` | `20` | Node.js version |
| `skip-lighthouse` | `false` | Build check only |
| `format` | `md` | Output format |

---

## Configuration

Create `.laxy.yml` in your project root to customize thresholds:

```yaml
thresholds:
  performance: 70
  accessibility: 85
  seo: 80
  bestPractices: 80

port: 3000
runs: 1
```

---

## Supported Frameworks

Automatically detects and runs the right build command:

- **Next.js** — `next build`
- **Vite** — `vite build`
- **Create React App** — `react-scripts build`
- **Custom** — reads `scripts.build` from `package.json`

---

## License

MIT
