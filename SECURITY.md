# Security

## Reporting

Report vulnerabilities to **sylusabel1@gmail.com** (encrypted mail welcome;
the key is available on request). Please include reproduction steps and
impact. We acknowledge within 48 hours and aim to ship a fix or mitigation
within 7 days for anything exploitable; we credit reporters (unless you
prefer otherwise) in the fix note.

Please do not open public issues for unfixed vulnerabilities.

## Scope and stance

- **Self-custody by design.** Stringz is tooling only: we never hold user
  keys, funds, or signatures, and nothing in the codebase should ever ask
  for a private key or seed phrase. If you find code, copy, or a generated
  workflow that does, treat it as a critical report.
- **Hosted service.** The deployment behind `flowkit-api-...run.app` is
  operated by us; findings about the live service are in scope.
- **Self-hosted installs.** Operators who run this repo themselves are
  responsible for their own deployment hardening (env secrets, database
  exposure, admin credentials). Reports about a third party's self-hosted
  instance should go to that operator.
- **Payment rail.** The internal payment service (stringz-pay) is a separate
  private repository; reports about it are in scope and welcome.

## Housekeeping

- Full git history is scanned with gitleaks before releases and in CI
  (`.gitleaks.toml`); findings rotate the secret first and clean history
  only when exposure is confirmed.
- Dependencies: keep `bun.lock` current; security advisories are handled as
  they surface.
