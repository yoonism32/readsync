---
name: ReadSync
description: A personal reading tracker for web novels — abyssal black, refined crimson, and an editorial serif/sans pairing.
colors:
  bg: "#07090c"
  bg-raised: "#0d1116"
  accent-dim: "#6e2b31"
  accent: "#cd5b62"
  accent-bright: "#e0707a"
  on-accent: "#080c12"
  teal: "#34d0ba"
  teal-bright: "#5fe3cf"
  on-teal: "#07110f"
  gold: "#d2a241"
  gold-bright: "#dab66c"
  text: "#e4e8e6"
  text-muted: "#8e9a96"
  text-faint: "#717e7a"
  success: "#34d0ba"
  warning: "#fbbf24"
  danger: "#f87171"
  info: "#60a5fa"
typography:
  display:
    fontFamily: "Newsreader Variable, Newsreader, Georgia, serif"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.0625rem"
    lineHeight: 1.6
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-bright}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost-hover:
    textColor: "{colors.text}"
---

# Design System: ReadSync

## Overview

**Creative North Star: "The Night Shelf"**

ReadSync tracks reading progress across web novels the way a private study tracks a reader's own shelf after dark: near-black, quiet, and built for long unhurried sessions rather than a glance. The ground is abyssal black (`#07090c`), not a neutral grey-black — it reads as a specific room, not a default. Against it, one refined crimson accent (`#cd5b62`, hand-tuned so no foreground color clears WCAG 4.5:1 at its original hex — see the Named Rule below) carries almost every action and highlight, with a legacy teal held in reserve for secondary state and a hand-desaturated antique gold reserved exclusively for ratings. Newsreader — a serif built for long-form reading — pairs with IBM Plex Sans for a system that reads as editorial, not as a generic dashboard.

This system was extracted from the shipped implementation, not designed fresh: it inherited a genuinely non-default choice (crimson + teal + antique gold instead of a single Tailwind-default accent) and a documented accessibility pass already baked into the token comments. Explicitly rejected: pure-white text and pure-black ground (both would look unconsidered next to the crimson), flat Tailwind `amber-400` for ratings (rejected in favor of hand-tuned gold, see Colors), and generic drop-shadow elevation (the system is flat by design).

**Key Characteristics:**
- Abyssal black ground, never pure `#000`
- One saturated accent (crimson) does almost all the work; teal and gold are reserved, not interchangeable alternates
- Editorial serif display + humanist sans body — not a single system-font stack
- Flat surfaces; depth comes from border + blur + z-index raise on hover, not shadows
- Every token exists because a real WCAG contrast failure was measured and fixed — not decorative choices

## Colors

The palette reads as one deliberately restrained color plus two reserved accents, not a rainbow of equally-weighted options.

### Primary
- **Refined Crimson** (`#cd5b62`): the one accent used for primary actions (`.btn-accent`), active nav state, and anything that should read as "the thing to do here." Deliberately 3% lighter than its first-drafted value — the original (`#c94f57`) measured 4.42:1 against the near-black ground and 4.43:1 against white text, clearing neither WCAG threshold; no foreground choice could fix it, so the accent itself moved.
- **On-Accent** (`#080c12`): the foreground used *on* a crimson fill. Near-black, not white — measured as the stronger contrast pairing against both crimson and teal fills.

### Secondary
- **Legacy Teal** (`#34d0ba`): the original refresh-button color, now reserved for secondary/success semantics (the "behind chapters" delta badge, success states). Doubles as `colors.success` — this project doesn't distinguish "teal the brand color" from "teal the success color."

### Tertiary
- **Antique Gold** (`#d2a241`): rating stars only. Deliberately *not* the same token as `--color-warning` (flat Tailwind `amber-400` at 96% saturation) — that would read as an off-the-shelf default sitting next to a hand-tuned palette. Gold sits at 62% saturation, matching the tuning of crimson (53%) and teal (62%), while keeping the universal "stars = gold" affordance. 8.53:1 against the ground (AAA).

### Neutral
- **Text** (`#e4e8e6`): primary reading color. Off-white, not pure white.
- **Text Muted** (`#8e9a96`): secondary text, labels, metadata.
- **Text Faint** (`#717e7a`): the lowest-emphasis text tier. Was `#4e5754` until it measured 2.67:1 against the ground and failed WCAG 1.4.3 (4.5:1 minimum) — lightened along the same hue to 4.72:1, not just brightened arbitrarily.
- **Border** (`rgba(255,255,255,0.08)`): the one hairline-border color used everywhere; never a second border color.

### Named Rules
**The Measured-Not-Guessed Rule.** Every neutral and accent shift in this system exists because a real contrast ratio was measured and failed — not because a color "felt a little dark." When adjusting any text or accent color, measure against `--color-bg` before shipping; do not eyeball it.

**The Near-Black Foreground Rule.** Text placed on a saturated fill (crimson, teal) uses `on-accent`/`on-teal`, both near-black — never white. Both accents contrast better with a dark foreground than a light one at their current lightness.

## Typography

**Display Font:** Newsreader Variable (with Newsreader, Georgia, serif fallback)
**Body Font:** IBM Plex Sans Variable (with IBM Plex Sans, system-ui, sans-serif fallback)
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Consolas (system stack — deliberately no mono webfont loaded, so the fallback is named honestly rather than requesting a face that never arrives)

**Character:** A reading-app serif paired with a technical, humanist sans — Newsreader carries the editorial, long-form-reading identity in headings; IBM Plex Sans keeps body copy and UI chrome legible and slightly technical, appropriate for a tool that's equal parts library and dashboard.

### Hierarchy
- **Display** (600 weight, 2.75rem / `--text-4xl`, 1.2 line-height): page-level hero numbers and headline stats.
- **Headline** (600 weight, 2.1875rem / `--text-3xl`): section-level headings.
- **Title** (600 weight, 1.4375–1.8125rem / `--text-xl`–`--text-2xl`): card and panel titles.
- **Body** (400 weight, 1.0625rem / `--text-base`, 1.6 line-height): default reading and UI text.
- **Label** (600 weight, 0.875rem / `--text-xs`, uppercase, 0.07em letter-spacing): table headers, section eyebrows.

Six of the eight scale steps (`--text-xs` through `--text-4xl`) exist because the old design ran a 1.1 zoom on `<html>` — the scale now absorbs that ratio directly instead of relying on browser zoom.

### Named Rules
**The Headings-Are-Display Rule.** Every `h1`–`h6` uses `--font-display` at 600 weight with `text-wrap: balance` globally — there is no "sans heading" variant.

## Layout

No formal spacing scale exists yet — padding and gaps are set ad hoc per component (commonly 6–8px for tight control groups, 12–16px for card internals, 24px for panel padding, 32px between major sections). This is the one area of the system genuinely worth tightening into real `--space-*` tokens in a future pass; until then, match the nearest existing value rather than inventing a new one. Tables and dense list rows (`MyListTable`, `Explorer` list view) use `padding: 10px 12px` per cell as their fixed rhythm.

Responsive behavior is deliberately minimal: the nav degrades from icon+label to icon-only under 600px width, and the login shell is the one place with an explicit breakpoint (860px, switching from a 1.15fr/380px asymmetric grid to a single left-aligned column).

## Elevation & Depth

Flat by design, not by omission. Surfaces use two tiers — `.panel` (static, `--color-bg-card` fill + hairline border, no compositing cost) and `.glass` (the same fill and border plus `backdrop-filter: blur(12px) saturate(160%)`, reserved for things that visually float: popovers, the command palette, the sticky header). Depth between a hovering card and its neighbors is conveyed by raising `z-index` on hover/focus, not by a shadow — a scaling cover-art hover (`.cover-lift`) that used `transform` would be visually clipped by sibling cards painted after it, so the hovered card is lifted in the stack instead.

A small number of component-local glows exist (the rating-star hover glow, the cover-lift hover shadow) but do not constitute a general elevation vocabulary — they're one-off accents on specific interactive moments, not a reusable shadow scale.

### Named Rules
**The Panel-vs-Glass Rule.** `glass` signals "this floats above content" — reserve it for overlays. Everything else, including cards that visually sit in the normal document flow, uses `panel`. Do not reach for `glass` on a static card just because it "should pop" — that's what the accent color and hover-lift are for.

## Shapes

Radius scales from `4px` (`sm`, tight controls like badges) through `8px` (`md`, the default for buttons, inputs, and most interactive chrome) up to `20px` (`2xl`, large panel containers) and `9999px` (`full`, pills — status badges, the behind-count delta, rating-style chips). No component uses a hand-written radius value outside this scale. Borders are uniformly the single hairline `--color-border` token; there is no second border weight or color in the system.

## Components

### Buttons
- **Shape:** `8px` radius (`--radius-md`) on both variants.
- **Primary** (`.btn-accent`): crimson fill, near-black text, `7px 14px` padding, 600-weight `--text-sm` label. Active state scales to `0.97` rather than darkening — a tactile press, not a color change.
- **Ghost** (`.btn-ghost`): transparent fill, muted text, hairline border, `6px 12px` padding. Hover brightens text to full and shifts the border to the accent-tinted variant — never adds a fill.
- **Disabled:** both variants drop to `0.45` opacity and `cursor: default` — no separate disabled color token.

### Cards / Containers
- **Corner Style:** `12px`–`20px` (`--radius-lg`/`--radius-xl`/`--radius-2xl`) depending on container size — larger containers get more radius.
- **Background:** `--color-bg-card` (`rgba(255,255,255,0.04)`), identical for `.panel` and `.glass`.
- **Shadow Strategy:** none at rest; see Elevation & Depth.
- **Border:** the single hairline `--color-border` token, always.

### Inputs / Fields
- **Style:** transparent background against the panel it sits in, hairline border, `--radius-md` corners.
- **Focus:** border color shifts to the accent on `:focus` (not `:focus-visible` — deliberate, so a field with an active caret looks focused regardless of how focus was reached, unlike every other interactive element in the system which uses `:focus-visible`).

### Navigation
- Icon + label pairs at `--text-base`, active route gets a subtle `rgba(255,255,255,0.08)` background fill and full-brightness text; inactive items sit at `--color-text-muted`. Labels hide under 600px, leaving icon-only nav with a fade-masked scrollable row so overflow is always visually signaled.

### Cover-Lift (signature component)
The recurring pattern for any novel cover thumbnail: the artwork scales to `1.06` on hover/focus while the title and chapter count beneath it stay fixed in place — only the image moves, using CSS `scale` (never `transform`, which would conflict with the card's own fade-in animation fill-mode). Hover-in has a 200ms delay so a pointer passing through a grid doesn't trigger a wave of covers; hover-out is instant.

## Do's and Don'ts

### Do:
- **Do** reference every color and radius through its `--color-*`/`--radius-*` custom property — this codebase has zero raw hex outside `index.css` and should stay that way.
- **Do** measure any new or adjusted text/accent color against `--color-bg` for WCAG 4.5:1 (AA) before shipping it — this system's entire neutral and accent history is a record of doing exactly that.
- **Do** use `on-accent`/`on-teal` (near-black) as the foreground on any saturated fill, never white.
- **Do** keep gold exclusive to ratings; it is not a general "highlight" color.

### Don't:
- **Don't** add a drop-shadow elevation system. This project is flat by design — use border + blur (`.glass`) or z-index raise instead.
- **Don't** introduce a second border color or weight. One hairline token, everywhere.
- **Don't** reach for `--color-warning` (flat Tailwind amber) for ratings or anything wanting the hand-tuned gold's character — they are visually distinct on purpose.
- **Don't** use emoji as interactive labels or icons. The project ships a hand-built SVG icon set (`components/Icon.tsx`) specifically to avoid this.
