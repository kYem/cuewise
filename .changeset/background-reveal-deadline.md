---
'@cuewise/browser-extension': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Fix a new tab that could stay stuck on "Brewing your view…" indefinitely when the background image host was slow or blocked. The page now appears promptly and the photo fades in when it arrives.
