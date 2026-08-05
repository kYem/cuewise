---
'@cuewise/macos': patch
---

The Mac app can now be built with a web inspector, for diagnosing sign-in and Cloud Sync. Until now only the development build had one, and the development build can't receive the deep links those features depend on — so the parts most worth inspecting were the parts you couldn't reach. The inspector is off unless a build asks for it, so a released app never carries one.
