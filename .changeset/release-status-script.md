---
"@cuewise/browser-extension": patch
---

Add a `release:status` script that reports the Chrome Web Store published vs.
last-uploaded version (compared to package.json), so you can tell whether the
latest release is live or still in review. Dependency-free, same credentials as
`publish:chrome`.
