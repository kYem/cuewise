---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
---

Stop the Cloud Sync panel misreading a sign-in state it doesn't recognise — one written by a newer or older version of the app. It used to leave a blank line beside the Reconnect button; it now works out whether sync is on and shows that, instead of claiming Cloud Sync failed to turn on over an install that is working fine.
