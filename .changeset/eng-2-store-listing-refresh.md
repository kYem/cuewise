---
'@cuewise/browser-extension': patch
'@cuewise/shared': patch
---

Refresh Chrome Web Store listing metadata and default to the glass theme

- Store title is now "Cuewise: New Tab Quotes, Goals & Pomodoro Timer"
  (keyword-rich for store search, 47 chars per ASO guidance), with
  `short_name` "Cuewise" so browser UI surfaces keep the short name
- Store search summary rewritten around the queries people actually use
  (new tab, motivational quotes, to-do goals, Pomodoro timer, focus mode)
- Detailed store description (DESCRIPTION.md) rewritten for the v1.9 feature
  set — subtasks, due dates, reordering, collections, CSV import, focus mode,
  soundscapes — and the stale FAQ corrected (data export shipped, optional
  Chrome sync)
- New installs now default to the glass color theme; existing users keep
  their saved theme
