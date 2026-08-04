---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
---

Hover and placeholder colours around the app start working. Buttons, tabs and links that were meant to brighten as your pointer passes over them had been sitting still, and text you haven't typed yet — search boxes, the quote editor, the goal field — was showing in the browser's own grey rather than your theme's. Both were written correctly; the styling behind them had never been generated.

The sound panel gets its colour back too: the selected soundscape, the active tab and the "Add" button were all painted in a highlight colour Cuewise never actually defined, so a picked soundscape looked the same as an unpicked one. Each theme's highlight is now the deeper shade of its own colour — violet for Purple, green for Forest, rose for Rose, and a brighter white for Glass.
