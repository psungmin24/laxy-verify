# Regression QA Fixtures

These fixtures exist to prove that `laxy-verify` catches broken projects instead of passing them by mistake.

- `free-buildfail-app`
  - Intentional build failure via missing import.
- `free-error-screen-app`
  - App renders an error-like screen even though the build succeeds.
- `pro-coverage-gap-app`
  - No meaningful primary action, form, or navigation for paid-flow coverage.
- `pro-bad-nav-app`
  - Internal link points to a missing route.
- `proplus-performance-app`
  - Main-thread blocking and heavy rendering to trigger performance and viewport failures.
- `proplus-coverage-gap-app`
  - Pro+ fixture for shallow-flow coverage gap regression.
- `proplus-bad-nav-app`
  - Pro+ fixture for broken internal navigation regression.
- `proplus-visual-app`
  - Visual regression fixture for baseline/diff testing.

Generated outputs such as `.next`, `.laxy-result.json`, `.laxy-verify/`, and `laxy-verify-report.md` are intentionally ignored.
