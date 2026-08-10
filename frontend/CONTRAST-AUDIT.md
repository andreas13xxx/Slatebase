# WCAG-AA Contrast Ratio Audit — Slatebase Design Tokens

**Date:** 2026-08-08
**Method:** Automated calculation using WCAG 2.1 relative luminance formula
**Source:** `frontend/src/index.css` (Light `:root` + Dark `:root[data-theme="dark"]`)
**Thresholds:** 4.5:1 for normal text (14px), 3.0:1 for large text (18px+/14px bold) and UI components

---

## Full Results

| # | Usage | Text Token | BG Token | Threshold | Light Ratio | Light | Dark Ratio | Dark |
|---|-------|-----------|----------|-----------|-------------|-------|------------|------|
| 1 | Primary text on page background | `--text-primary` | `--bg-base` | 4.5:1 | 17.06:1 | PASS | 17.27:1 | PASS |
| 2 | Primary text on surface | `--text-primary` | `--bg-surface` | 4.5:1 | 16.30:1 | PASS | 16.13:1 | PASS |
| 3 | Primary text on elevated (cards, modals) | `--text-primary` | `--bg-elevated` | 4.5:1 | 17.85:1 | PASS | 14.70:1 | PASS |
| 4 | Secondary text on page background | `--text-secondary` | `--bg-base` | 4.5:1 | 7.24:1 | PASS | 7.38:1 | PASS |
| 5 | Secondary text on surface | `--text-secondary` | `--bg-surface` | 4.5:1 | 6.92:1 | PASS | 6.89:1 | PASS |
| 6 | Secondary text on elevated | `--text-secondary` | `--bg-elevated` | 4.5:1 | 7.58:1 | PASS | 6.28:1 | PASS |
| 7 | Muted text on page background | `--text-muted` | `--bg-base` | 4.5:1 | 2.45:1 | **FAIL** | 3.98:1 | **FAIL** |
| 8 | Muted text on surface | `--text-muted` | `--bg-surface` | 4.5:1 | 2.34:1 | **FAIL** | 3.71:1 | **FAIL** |
| 9 | Muted text on elevated | `--text-muted` | `--bg-elevated` | 4.5:1 | 2.56:1 | **FAIL** | 3.38:1 | **FAIL** |
| 10 | Inverse text on accent buttons | `--text-inverse` | `--accent` | 4.5:1 | 3.74:1 | **FAIL** | 9.59:1 | PASS |
| 11 | Accent/link text on page background | `--accent-text` | `--bg-base` | 4.5:1 | 3.58:1 | **FAIL** | 10.17:1 | PASS |
| 12 | Accent/link text on surface | `--accent-text` | `--bg-surface` | 4.5:1 | 3.42:1 | **FAIL** | 9.49:1 | PASS |
| 13 | Accent/link text on elevated | `--accent-text` | `--bg-elevated` | 4.5:1 | 3.74:1 | **FAIL** | 8.65:1 | PASS |
| 14 | Accent text on accent-light background | `--accent-text` | `--accent-light` | 4.5:1 | 3.59:1 | **FAIL** | 8.05:1 | PASS |
| 15 | Danger text on danger background | `--danger-text` | `--danger-bg` | 4.5:1 | 4.41:1 | **FAIL** | 6.92:1 | PASS |
| 16 | Danger color on page bg (icons, large) | `--danger` | `--bg-base` | 3.0:1 | 4.62:1 | PASS | 6.84:1 | PASS |
| 17 | Info text on info background | `--info-text` | `--info-bg` | 4.5:1 | 5.25:1 | PASS | 10.13:1 | PASS |
| 18 | Success color on success background | `--success` | `--success-bg` | 3.0:1 | 3.15:1 | PASS | 8.55:1 | PASS |
| 19 | Warning color on warning background | `--warning` | `--warning-bg` | 3.0:1 | 3.07:1 | PASS | 10.94:1 | PASS |
| 20 | Sidebar text on sidebar bg | `--sidebar-text` | `--sidebar-bg` | 4.5:1 | 6.92:1 | PASS | 3.96:1 | **FAIL** |
| 21 | Active sidebar item on sidebar bg | `--sidebar-text-active` | `--sidebar-bg` | 4.5:1 | 16.30:1 | PASS | 17.19:1 | PASS |
| 22 | Right panel text on panel bg | `--right-panel-text` | `--right-panel-bg` | 4.5:1 | 16.30:1 | PASS | 17.19:1 | PASS |
| 23 | Right panel muted text on panel bg | `--right-panel-text-muted` | `--right-panel-bg` | 4.5:1 | 4.34:1 | **FAIL** | 3.96:1 | **FAIL** |
| 24 | Tag text on tag background | `--tag-text` | `--tag-bg` | 4.5:1 | 6.92:1 | PASS | 5.71:1 | PASS |
| 25 | Search match text on match highlight | `--search-match-text` | `--search-match-bg` | 4.5:1 | 15.03:1 | PASS | 6.15:1 | PASS |
| 26 | Graph label on graph background | `--graph-label-color` | `--graph-bg` | 4.5:1 | 9.90:1 | PASS | 14.48:1 | PASS |
| 27 | Status bar text on status bar bg | `--status-bar-text` | `--status-bar-bg` | 4.5:1 | 6.92:1 | PASS | 6.89:1 | PASS |
| 28 | Broken link on page background | `--broken-link-color` | `--bg-base` | 4.5:1 | 2.45:1 | **FAIL** | 3.98:1 | **FAIL** |
| 29 | Broken link on surface | `--broken-link-color` | `--bg-surface` | 4.5:1 | 2.34:1 | **FAIL** | 3.71:1 | **FAIL** |
| 30 | Default border on page bg (UI component) | `--border-default` | `--bg-base` | 3.0:1 | 1.42:1 | **FAIL** | 1.83:1 | **FAIL** |
| 31 | Default border on elevated (UI component) | `--border-default` | `--bg-elevated` | 3.0:1 | 1.48:1 | **FAIL** | 1.56:1 | **FAIL** |
| 32 | Subtle border on page bg (UI component) | `--border-subtle` | `--bg-base` | 3.0:1 | 1.18:1 | **FAIL** | 1.29:1 | **FAIL** |
| 33 | Subtle border on elevated (UI component) | `--border-subtle` | `--bg-elevated` | 3.0:1 | 1.23:1 | **FAIL** | 1.10:1 | **FAIL** |
| 34 | Note callout icon on note bg | `--callout-note-icon` | `--callout-note-bg` | 3.0:1 | 3.38:1 | PASS | 5.75:1 | PASS |
| 35 | Tip callout icon on tip bg | `--callout-tip-icon` | `--callout-tip-bg` | 3.0:1 | 2.18:1 | **FAIL** | 8.55:1 | PASS |
| 36 | Warning callout icon on warning bg | `--callout-warning-icon` | `--callout-warning-bg` | 3.0:1 | 2.07:1 | **FAIL** | 10.94:1 | PASS |
| 37 | Danger callout icon on danger bg | `--callout-danger-icon` | `--callout-danger-bg` | 3.0:1 | 3.44:1 | PASS | 6.92:1 | PASS |
| 38 | Example callout icon on example bg | `--callout-example-icon` | `--callout-example-bg` | 3.0:1 | 3.69:1 | PASS | 7.05:1 | PASS |
| 39 | Quote callout icon on quote bg | `--callout-quote-icon` | `--callout-quote-bg` | 3.0:1 | 4.55:1 | PASS | 5.71:1 | PASS |

---

## Summary

- **Total pairs checked:** 39
- **Passing (both themes):** 20
- **Violations:** 19 (across 13 unique token issues)

---

## Violations by Severity

### Critical (Normal Text < 4.5:1) — Must Fix

| # | Token Pair | Theme | Ratio | Gap |
|---|-----------|-------|-------|-----|
| 1 | `--text-muted` on `--bg-base` | Light | 2.45:1 | needs +83% improvement |
| 2 | `--text-muted` on `--bg-surface` | Light | 2.34:1 | needs +92% improvement |
| 3 | `--text-muted` on `--bg-elevated` | Light | 2.56:1 | needs +76% improvement |
| 4 | `--text-muted` on `--bg-base` | Dark | 3.98:1 | needs +13% improvement |
| 5 | `--text-muted` on `--bg-surface` | Dark | 3.71:1 | needs +21% improvement |
| 6 | `--text-muted` on `--bg-elevated` | Dark | 3.38:1 | needs +33% improvement |
| 7 | `--accent-text` on `--bg-base` | Light | 3.58:1 | needs +26% improvement |
| 8 | `--accent-text` on `--bg-surface` | Light | 3.42:1 | needs +32% improvement |
| 9 | `--accent-text` on `--bg-elevated` | Light | 3.74:1 | needs +20% improvement |
| 10 | `--accent-text` on `--accent-light` | Light | 3.59:1 | needs +25% improvement |
| 11 | `--text-inverse` on `--accent` | Light | 3.74:1 | needs +20% improvement |
| 12 | `--danger-text` on `--danger-bg` | Light | 4.41:1 | needs +2% improvement |
| 13 | `--sidebar-text` on `--sidebar-bg` | Dark | 3.96:1 | needs +14% improvement |
| 14 | `--right-panel-text-muted` on `--right-panel-bg` | Light | 4.34:1 | needs +4% improvement |
| 15 | `--right-panel-text-muted` on `--right-panel-bg` | Dark | 3.96:1 | needs +14% improvement |
| 16 | `--broken-link-color` on `--bg-base` | Light | 2.45:1 | needs +83% improvement |
| 17 | `--broken-link-color` on `--bg-surface` | Light | 2.34:1 | needs +92% improvement |
| 18 | `--broken-link-color` on `--bg-base` | Dark | 3.98:1 | needs +13% improvement |
| 19 | `--broken-link-color` on `--bg-surface` | Dark | 3.71:1 | needs +21% improvement |

### High (UI Component Border < 3:1) — Should Fix

| # | Token Pair | Theme | Ratio |
|---|-----------|-------|-------|
| 1 | `--border-default` on `--bg-base` | Light | 1.42:1 |
| 2 | `--border-default` on `--bg-base` | Dark | 1.83:1 |
| 3 | `--border-default` on `--bg-elevated` | Light | 1.48:1 |
| 4 | `--border-default` on `--bg-elevated` | Dark | 1.56:1 |
| 5 | `--border-subtle` on `--bg-base` | Light | 1.18:1 |
| 6 | `--border-subtle` on `--bg-base` | Dark | 1.29:1 |
| 7 | `--border-subtle` on `--bg-elevated` | Light | 1.23:1 |
| 8 | `--border-subtle` on `--bg-elevated` | Dark | 1.10:1 |

### Medium (Callout Icon < 3:1, Light Only) — Nice to Fix

| # | Token Pair | Theme | Ratio |
|---|-----------|-------|-------|
| 1 | `--callout-tip-icon` on `--callout-tip-bg` | Light | 2.18:1 |
| 2 | `--callout-warning-icon` on `--callout-warning-bg` | Light | 2.07:1 |

---

## Root Cause Analysis & Recommended Fixes

### 1. `--text-muted` (Light: `#94a3b8`, Dark: `#64748b`)

**Problem:** The muted text color is too close to the background in both themes. This is the most widespread violation — same token is also used as `--broken-link-color`.

**Recommended fix:**
- Light: Darken from `#94a3b8` to `#64748b` (current dark value — gives ~4.63:1 on `#f8fafc`)
- Dark: Lighten from `#64748b` to `#7a8592` (gives ~4.55:1 on `#0d1117`)

**Note:** `--broken-link-color` uses the same values as `--text-muted` — fixing `--text-muted` is intentionally NOT propagated to `--broken-link-color` since broken links are designed to look faded. However, since they carry meaning (indicating an unresolved link), they need at least 3:1 as a non-text UI indicator. Recommend `#64748b` (Light) / `#7a8592` (Dark).

### 2. `--accent-text` / `--accent` (Light: `#0d9488`)

**Problem:** The teal accent color is too light against white/near-white backgrounds in light theme. 3.58:1 < 4.5:1.

**Recommended fix:**
- Light: Darken from `#0d9488` to `#0f766e` (the current `--accent-hover` value — gives ~4.82:1 on `#f8fafc`)
- Both `--accent` and `--accent-text` need the same adjustment in light theme

### 3. `--text-inverse` on `--accent` (Light)

**Problem:** White text on `#0d9488` teal button is 3.74:1 < 4.5:1.

**Recommended fix:** Darkening `--accent` to `#0f766e` in light theme (per fix #2 above) gives white-on-teal = 5.06:1 — resolves this simultaneously.

### 4. `--danger-text` on `--danger-bg` (Light: 4.41:1)

**Problem:** Just barely below 4.5:1. `#dc2626` on `#fef2f2`.

**Recommended fix:** Darken `--danger-text` from `#dc2626` to `#c92020` — gives ~4.87:1 on `#fef2f2`. Minimal visual change.

### 5. `--sidebar-text` (Dark: `#64748b` on `#0b1120`)

**Problem:** Dark sidebar text is below threshold (3.96:1 < 4.5:1).

**Recommended fix:** Lighten from `#64748b` to `#7a8592` — gives ~4.83:1 on `#0b1120`.

### 6. `--right-panel-text-muted` (Light: `#64748b`, Dark: `#64748b`)

**Problem:** `#64748b` on `#f1f5f9` (Light) = 4.34:1 and on `#0b1120` (Dark) = 3.96:1.

**Recommended fix:**
- Light: Darken from `#64748b` to `#586373` — gives ~4.97:1 on `#f1f5f9`
- Dark: Lighten from `#64748b` to `#7a8592` — gives ~4.83:1 on `#0b1120`

### 7. Border tokens (All fail 3:1)

**Problem:** All border tokens fail the 3:1 UI component threshold. This is a known trade-off in modern "soft" design — borders are intentionally subtle.

**Context:** WCAG 1.4.11 (Non-text Contrast) requires 3:1 for "visual information required to identify UI components." Decorative borders that are not the ONLY way to perceive the component boundary (if the component also has background color difference, shadow, etc.) may not need to meet this threshold. Many major design systems (Tailwind, Radix, shadcn) use similar low-contrast borders.

**Recommended approach:**
- `--border-default`: Assess per-component — where a border is the SOLE boundary indicator (e.g., input fields), darken it. Where it's decorative alongside shadows/bg-change, keep current.
- `--border-subtle`: Purely decorative separator — mark as accepted deviation in report.

### 8. Callout icons (Light only)

**Problem:** Green (tip) and amber (warning) icons on their respective light backgrounds fall below 3:1.

**Recommended fix:**
- `--callout-tip-icon`: Darken from `#22c55e` to `#16a34a` (the `--success` value — gives ~3.15:1 on `#f0fdf4`)
- `--callout-warning-icon`: Darken from `#f59e0b` to `#d97706` (the `--warning` value — gives ~3.07:1 on `#fffbeb`)

---

## Accepted Deviations (Not Fixing)

| Token Pair | Reason |
|-----------|--------|
| `--border-subtle` everywhere | Purely decorative; components have additional visual cues (shadows, background differences) |
| `--border-default` on backgrounds where additional cues exist | Supplementary indicator alongside shadow/background |

---

## Tokens That MUST Be Fixed (Task 18 Input)

1. **`--text-muted`** — Light: `#94a3b8` → `#64748b` | Dark: `#64748b` → `#7a8592`
2. **`--accent` / `--accent-text`** — Light: `#0d9488` → `#0f766e`
3. **`--danger-text`** — Light: `#dc2626` → `#c92020`
4. **`--sidebar-text`** — Dark: `#64748b` → `#7a8592`
5. **`--right-panel-text-muted`** — Light: `#64748b` → `#586373` | Dark: `#64748b` → `#7a8592`
6. **`--broken-link-color`** — Light: `#94a3b8` → `#64748b` | Dark: `#64748b` → `#7a8592`
7. **`--callout-tip-icon`** — Light: `#22c55e` → `#16a34a`
8. **`--callout-warning-icon`** — Light: `#f59e0b` → `#d97706`
9. **`--border-default`** — Needs per-component assessment (input fields specifically)
