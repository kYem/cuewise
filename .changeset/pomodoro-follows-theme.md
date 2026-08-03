---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
---

The Pomodoro page now follows your colour theme. It was showing a scenic photo on every theme — including Purple, Forest and Rose, where the rest of Cuewise uses your theme's own colours — so picking a plain theme gave you a clean home page and then a full photo the moment you opened the timer. The photo belongs to the Glass theme. On the other themes the timer, the agenda beside it, the music player and the page header now use your theme's colours instead of the white-on-dark styling they needed over a photo — so they stay readable in light mode. Focus mode still shows the photo whichever theme you use, since that's the point of it.

Three things in the music player start working along the way: the pulsing dot that marks something as playing, the tint behind the ambient sound icon, and the play button's filled state while something is playing. All three were written against a colour Cuewise doesn't define, so they had quietly never rendered at all.

Elsewhere in the same corners: the page header's navigation tabs and Back button get their hover colour back, the "now" marker in the agenda becomes visible again, and the timer's progress ring and session dots keep enough contrast to read on a light page.
