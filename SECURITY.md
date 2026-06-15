# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub's
[Report a vulnerability](https://github.com/kYem/cuewise/security/advisories/new)
form (repository **Security → Advisories**). Don't open a public issue for security
problems.

We aim to acknowledge a report within 3 business days and to share a remediation
timeline once it's triaged.

## Scope

In scope:

- The Cuewise browser extension (`apps/browser-extension`) and its release pipeline.
- Issues affecting user data, the extension's permissions, or the integrity of
  published builds.

Out of scope:

- Findings that require an already-compromised machine or browser.
- Social engineering, and issues in third-party services we don't control.

## Supported versions

Only the latest version published on the Chrome Web Store is supported.

## Verifying a release

Published builds carry a signed provenance attestation. You can verify a release
artifact came from this repository's workflow:

```sh
gh attestation verify cuewise-extension-<version>.zip --repo kYem/cuewise
```
