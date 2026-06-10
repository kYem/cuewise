# Cuewise Public Website — Design Spec

**Spec ID:** 004
**Date:** 2026-06-10
**Status:** Approved direction; pending final user review
**Linear:** [ENG-6 — Build out cuewise.app](https://linear.app/kyem/issue/ENG-6/build-out-cuewiseapp-screenshots-install-cta-cuewise-vs-momentum)
**Replaces:** Replit-hosted site at https://cuewise.app/

## 1. Summary

Recreate the Cuewise public website inside the monorepo as a new `apps/website` workspace and host it on Cloudflare, replacing the current Replit deployment. The visual design follows the **Claude Design handoff bundle** (Cuewise design system + `marketing/index.html` prototype): the signature **Glass aesthetic** — frosted translucent cards over an aurora mesh backdrop, violet brand, Poppins/Inter type — replacing the live site's dark/lime look.

## 2. Decisions (agreed with Kes)

| Topic | Decision |
|---|---|
| Hosting | **Cloudflare Pages** (DNS already on Cloudflare; free tier) |
| Newsletter | **Keep**, reimplemented as a Cloudflare Pages Function calling Resend |
| Stack | **Astro 5, static output** — SEO was the deciding factor (current SPA renders an empty div without JS) |
| Design | **Design-bundle marketing prototype** is the landing-page blueprint; moderate redesign approved |
| Content | **Updated for v1.9** feature set; bundle's refined copy supersedes live-site copy |
| Social proof | **Honest trust signals only** (trust pills, open source, privacy-first) — no fabricated testimonials/ratings |

## 3. Site structure

Four routes — the live site's three plus the comparison page from ENG-6:

### `/` — Landing page (from `marketing/index.html` prototype)

1. **Nav** — sticky frosted pill: Cue Dot logo + wordmark; links Features / Product / How it works; violet "Add to Chrome" CTA.
2. **Hero** — eyebrow pill ("Your daily dose of productivity"), H1 "Turn every new tab into a **meaningful moment**" (violet→pink gradient accent), sub-copy, primary CTA "Add to Chrome — Free" + ghost "See it in action", 3 trust pills (Free forever / Privacy-first — all local / 2-minute setup), browser-framed `newtab.png` shot with perspective tilt + glow.
3. **Features** — 6 frosted cards with gradient icon chips (category colors): Daily Wisdom, Today's Focus, Pomodoro Timer, Insights, Reminders, Four Themes.
4. **Showcase** — 3 alternating browser-framed rows: Pomodoro (focus mode), Insights, Quotes library. v1.9 additions folded into the bullet lists (ambient soundscapes/YouTube under Pomodoro; collections under Quotes).
5. **How it works** — 3 numbered steps (Add to Chrome / Make it yours / Open a new tab).
6. **Final CTA** — glass panel: headline, store CTA, **newsletter subscribe form** (added; not in prototype — styled as glass input + violet button, posting to `/api/newsletter/subscribe`), footnote "Works on Chrome and Chromium browsers · No tracking · All data stays on your device".
7. **Footer** — brand, section links, **plus Support & FAQ, Privacy Policy, GitHub** (in prototype-consistent style; required links the prototype omitted).

All Chrome Web Store links point to the real listing:
`https://chromewebstore.google.com/detail/cuewise/abjkbnhoepcnmbabflkedbapbldnpkbf`

### `/support` — Support & FAQ (restyled from live site)

Same content structure as today, restyled with glass tokens: hero ("Cuewise Support"), FAQ (6 questions — native `<details>` accordions; answers updated for v1.9 feature list), Troubleshooting (2 cards), Get in Touch (Email `support@cuewise.app`, GitHub Issues, GitHub Discussions), back-to-home CTA, footer.

### `/cuewise-vs-momentum` — Comparison page (new, from ENG-6)

The highest-converting SEO play at this stage: targets "momentum alternative" / "free momentum alternative" searches. Content sourced from `docs/momentum-competitive-analysis.md`, kept **honest** (consistent with our no-fake-testimonials stance — credible comparison pages convert better):

1. Hero — H1 "Cuewise vs Momentum" + sub positioning Cuewise as the free, open-source alternative; install CTA.
2. At-a-glance verdict — 3 glass cards: "Free forever vs $40/yr Plus", "Deeper productivity tools", "Privacy-first & open source".
3. Full comparison table (glass-styled): price, goals, quotes, Pomodoro, analytics, themes, soundscapes, backgrounds, integrations, sync, open source, privacy. Updates vs the doc: Open Source = **Cuewise (MIT)** not a tie; 4 themes; soundscapes/YouTube now exist.
4. "Where Momentum is stronger" — honest section (photography as the core experience, brand, third-party integrations). Builds trust, defuses bounce.
5. "Why people switch" — paywall creep, feature lock-in (paraphrased neutrally, no quotes of users).
6. FAQ (3–4 questions, `<details>`) + `FAQPage` JSON-LD.
7. Final CTA panel (shared component).

Linked from the landing footer ("Cuewise vs Momentum"); included in sitemap.

### `/privacy` — Privacy Policy (content ported as-is)

Existing policy text unchanged (Last Updated: November 15, 2025), restyled with glass tokens. Contact links: `privacy@cuewise.app`, GitHub issues, support page.

## 4. Visual design source

From the design bundle (`cuewise/project/`):

- **Tokens** — `tokens/{fonts,colors,typography,spacing,glass,base}.css` copied into `src/styles/`. Glass theme activated via `data-theme="glass"` on `<html>`. Brand: `--brand-primary: #8B5CF6`, `--brand-accent: #7c3aed`; category colors for feature icon chips.
- **Type** — Poppins (600/700/800 display) + Inter (300–700 body) via Google Fonts.
- **Page chrome** — fixed aurora backdrop (`marketing/assets/bg.png`) + violet radial scrim + two blurred orbs; `#0b0a16` base.
- **Primitives** — `.glass` card (frosted, hairline border), pill nav, violet gradient buttons, browser frame with traffic-light dots, reveal-on-scroll (IntersectionObserver, `prefers-reduced-motion` respected, safety-net reveal).
- **Assets** — Cue Dot logo (`logo-mark-white.svg`, `logo-horizontal.svg`), favicons (`icon-16/48/128.png`, `icon.svg`), product shots (`marketing/shots/{newtab,pomodoro,insights,quotes}.png`).
- **Voice** — warm calm coach, second person, Title Case headings, sentence-case helper text.

The prototype's CSS is ported essentially verbatim (it is the design), split into Astro component scoped styles + a small global layer.

## 5. Architecture

```
apps/website/                    # @cuewise/website (private)
├── astro.config.mjs             # static output, site: https://cuewise.app, sitemap integration
├── package.json                 # dev/build/preview/type-check wired into Turbo
├── tsconfig.json
├── functions/
│   └── api/newsletter/subscribe.ts   # Cloudflare Pages Function
├── public/
│   ├── favicon assets, robots.txt, og-image
│   └── (images: backdrop, shots, logos)
└── src/
    ├── styles/                  # design-system tokens + global marketing styles
    ├── layouts/Base.astro       # head/meta/fonts/backdrop/nav/footer
    ├── components/              # Nav, Hero, Features, Showcase, HowItWorks,
    │                            # FinalCta, NewsletterForm, BrowserFrame, Faq, Footer
    └── pages/                   # index.astro, support.astro, privacy.astro
```

- **No Tailwind** (deviation from the earlier sketch): the design system ships as plain CSS custom properties and the prototype is pure CSS — a verbatim port is pixel-faithful and dependency-free. Tailwind would mean re-expressing every rule with drift risk and no reuse benefit (the website shares no components with the extension).
- **No UI framework shipped**: FAQ uses native `<details>`; newsletter form and reveal animation are small inline scripts. Zero JS frameworks → fastest possible page.
- TypeScript via `astro check`; Biome formatting/linting like the rest of the repo.

## 6. Newsletter function

`POST /api/newsletter/subscribe`, body `{ "email": string }` (same contract as the Replit backend, so the form code is host-agnostic).

- Validate email shape; reject empty/invalid with 400 JSON `{ error }`.
- Honeypot field (`website`) in the form; silently accept-and-drop when filled.
- Add contact to Resend audience via REST (`POST https://api.resend.com/audiences/{id}/contacts`).
- Secrets: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` (Cloudflare Pages env vars — **Kes provides from the Replit deployment**).
- Responses: 200 `{ success: true }`, 400 invalid, 502 upstream failure (logged, no details leaked); 500 when Resend env vars are missing.
- Unit-tested with Vitest (validation paths; Resend call mocked).

## 7. SEO

- Pre-rendered HTML for all routes (the headline win over the SPA).
- Per-page `<title>`/description/canonical; OG + Twitter card meta with a real OG image.
- `@astrojs/sitemap` → sitemap.xml; robots.txt allowing all + sitemap pointer.
- JSON-LD `SoftwareApplication` (name, OS/browser, free, store URL) on the landing page; `FAQPage` on the comparison page.
- Landing title: "Cuewise — Turn every new tab into a meaningful moment" (bundle copy).
- ENG-6 keywords woven into titles/descriptions: "new tab productivity", "momentum alternative" (comparison page title: "Cuewise vs Momentum — the free, open-source alternative").

## 8. Deployment & cutover (zero downtime)

1. Cloudflare Pages project `cuewise-website` connected to `kYem/cuewise` (Kes, dashboard): root `apps/website`, build `pnpm build` (monorepo-aware), output `dist`.
2. Set Resend secrets; verify newsletter on the `*.pages.dev` preview.
3. Visual/content verification on preview while Replit stays live.
4. Add custom domain `cuewise.app` (+ `www`) to the Pages project; Cloudflare flips DNS in-zone.
5. Decommission the Replit deployment after confirming production.

Rollback at any point = point DNS back at Replit.

## 9. Testing

- **Unit**: subscribe function (Vitest) — valid/invalid/honeypot/Resend-failure paths.
- **Build**: `astro check` + `astro build` in Turbo pipeline (CI).
- **Manual/visual**: Playwright pass over local preview — all three routes, mobile + desktop widths, FAQ accordions, form states; cross-check against the prototype and bundle screenshots.

## 10. Out of scope / follow-ups

- Replacing bundle product shots with real-app captures (bundle shots are pixel-faithful mockups; fine for launch).
- Installing the design bundle as a project skill (`.claude/skills/cuewise-design/`) for future on-brand work.
- Real Chrome Web Store review quotes once they exist (replaces the dropped testimonials).
- Firefox/Safari store links when available.
- Updating the extension's `manifest.config.ts` CSP/host permissions is **not needed** (domain unchanged).

## 11. Open items

- [x] Linear issue reference — **ENG-6** (branch `kes/eng-6-public-website` for auto-linking).
- [ ] `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` values from Kes at deploy time.
- [ ] Confirm `www.cuewise.app` should redirect to apex (assumed yes).
