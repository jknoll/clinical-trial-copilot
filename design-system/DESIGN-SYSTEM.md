# Clinical Trial Navigator — Design System

This document captures the current look and feel of the frontend. Claude should
follow these specifications when creating or modifying UI components so the
application stays visually consistent.

---

## 1. Fonts & Typography

| Role | Family | Fallback | Notes |
|------|--------|----------|-------|
| **Sans (body)** | Geist (via `next/font/google`, CSS var `--font-geist-sans`) | Arial, Helvetica, sans-serif | Set on `<body>` |
| **Mono** | Geist Mono (CSS var `--font-geist-mono`) | monospace | Used in code/data contexts |

- `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` applied globally.
- Tailwind `antialiased` class on `<body>`.
- Headings use `font-semibold` (600) at `text-lg` for the page title.
- Body text is default weight (400); bold spans use `font-medium` (500) or `font-semibold` (600).
- Small labels and metadata use `text-xs` (0.75 rem / 12 px).

---

## 2. Color Palette

### 2.1 Core (CSS custom properties in `globals.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#f8fafc` (slate-50) | Page background |
| `--foreground` | `#0f172a` (slate-900) | Default text |

### 2.2 Primary — Blue

| Tailwind class | Hex | Usage |
|----------------|-----|-------|
| `blue-600` | `#2563eb` | Primary buttons, send button, header logo bg, active links, icon accents |
| `blue-700` | `#1d4ed8` | Button hover, stats gradient end |
| `blue-500` | `#3b82f6` | Focus rings, selected-card ring, chart fill |
| `blue-400` | `#60a5fa` | Loading icon, filter label text |
| `blue-200` | `#bfdbfe` | Stats panel muted text on dark bg |
| `blue-100` | `#dbeafe` | Loading pulse bg |
| `blue-50` | `#eff6ff` | Selected item bg, active filter chip bg, intervention tag bg |
| `blue-800/50` | `#1e3a5f80` | Stats progress bar track (semi-transparent) |

### 2.3 Slate — Neutrals

| Tailwind class | Hex | Usage |
|----------------|-----|-------|
| `slate-900` | `#0f172a` | Headings, primary text |
| `slate-800` | `#1e293b` | Widget question text, section titles |
| `slate-700` | `#334155` | Table body text, chart labels |
| `slate-600` | `#475569` | Phase badge text, axis labels, button text, section headings |
| `slate-500` | `#64748b` | Subtitle text, metadata, status messages, axis tick fill |
| `slate-400` | `#94a3b8` | Muted identifiers (NCT IDs), typing dots, rank numbers |
| `slate-300` | `#cbd5e1` | Checkbox borders, vertical dividers |
| `slate-200` | `#e2e8f0` | Card/panel borders, table dividers, header border-bottom, section card border |
| `slate-100` | `#f1f5f9` | Phase badge bg, table row hover bg, row dividers |
| `slate-50` | `#f8fafc` | Stats panel bg, toolbar bg, table header bg |

### 2.4 Semantic — Fit Scores & Status

| Context | Text | Background | Tailwind |
|---------|------|------------|----------|
| **High fit (>= 70)** | `#059669` (emerald-600) | `#ecfdf5` (emerald-50) | `.fit-score-high` |
| **Medium fit (40-69)** | `#d97706` (amber-600) | `#fffbeb` (amber-50) | `.fit-score-medium` |
| **Low fit (< 40)** | `#dc2626` (red-600) | `#fef2f2` (red-50) | `.fit-score-low` |

Fit score bar colors (TrialSelector):

| Range | Bar fill | Bar track |
|-------|----------|-----------|
| >= 70 | `bg-emerald-500` | `bg-emerald-100` |
| 40-69 | `bg-amber-500` | `bg-amber-100` |
| < 40 | `bg-red-500` | `bg-red-100` |

### 2.5 Status Badge Colors (ComparisonTable)

| Status | Badge classes |
|--------|-------------|
| Recruiting | `bg-emerald-100 text-emerald-700` |
| Active | `bg-blue-100 text-blue-700` |
| Completed / other | `bg-slate-100 text-slate-600` |

### 2.6 Chart Colors

**Phase donut & funnel (sequential blue ramp):**
`#1e40af`, `#2563eb`, `#3b82f6`, `#60a5fa`, `#93c5fd`, `#bfdbfe`, `#1e3a5f`, `#0ea5e9`, `#7dd3fc`

**Phase pipeline bar (blue scale):**
Phase 1 `#93c5fd`, Phase 2 `#60a5fa`, Phase 3 `#3b82f6`, Phase 4 `#1d4ed8`

**Status bar (multi-hue):**

| Status key | Color |
|------------|-------|
| COMPLETED | `#22c55e` (green-500) |
| RECRUITING | `#3b82f6` (blue-500) |
| ACTIVE_NOT_RECRUITING | `#f59e0b` (amber-500) |
| NOT_YET_RECRUITING | `#8b5cf6` (violet-500) |
| TERMINATED | `#ef4444` (red-500) |
| WITHDRAWN | `#f87171` (red-400) |
| UNKNOWN | `#94a3b8` (slate-400) |
| SUSPENDED | `#fb923c` (orange-400) |
| ENROLLING_BY_INVITATION | `#06b6d4` (cyan-500) |

### 2.7 Disclaimer Banner

- Background: `bg-amber-50`
- Border: `border-amber-200`
- Text: `text-amber-800`
- Icon: `AlertTriangle` from lucide-react

---

## 3. Spacing & Layout

- **Overall layout**: Full-viewport flex column (`h-screen`).
  - Header (shrink-0) -> Disclaimer banner (shrink-0) -> Main (flex-1, horizontal split).
- **Stats panel**: Fixed width `w-[440px]`, left side, `bg-slate-50`, `border-r border-slate-200`.
- **Chat pane**: Fills remaining width (`flex-1`), vertical flex with scrollable messages and a pinned input bar.
- **Standard padding**: `px-4 py-3` for header/input bar; `p-4` for panel content; `p-6` for report content.
- **Message area**: `px-4 py-4 space-y-3`.
- **Chat input max-width**: `max-w-3xl mx-auto`.

---

## 4. Border Radii

| Context | Radius |
|---------|--------|
| Buttons (primary) | `rounded-xl` (0.75 rem) |
| Cards / panels / widgets | `rounded-xl` (0.75 rem) |
| Chat bubbles - user | `1rem 1rem 0.25rem 1rem` (custom CSS) |
| Chat bubbles - assistant | `1rem 1rem 1rem 0.25rem` (custom CSS) |
| Input field | `rounded-xl` |
| Badges / chips / tags | `rounded-full` |
| Logo icon | `rounded-lg` (0.5 rem) |
| Chart bar ends | `radius={[0, 4, 4, 0]}` (right side only) |
| Progress bar | `rounded-full` |
| Phase pipeline bar ends | `radius={[0, 6, 6, 0]}` |

---

## 5. Shadows & Borders

- **Cards (trial-card)**: `border: 1px solid #e2e8f0`, hover shadow `0 4px 6px -1px rgba(0,0,0,0.1)`.
- **Assistant bubbles**: `box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0`.
- **Section cards** (stats panel): `bg-white border border-slate-200 shadow-sm`.
- **General borders**: `border-slate-200` for structural dividers (header, input bar, panel edge).
- **Hover transitions**: `transition-colors` on buttons, `transition: box-shadow 0.2s` on cards.

---

## 6. Component Patterns

### 6.1 Chat Bubbles

- **User**: Right-aligned (`ml-auto`), blue bg (`#2563eb`), white text, max-width 80%.
- **Assistant**: Left-aligned, white bg, slate-900 text, 1px slate-200 border, subtle shadow, max-width 80%.
- **Status**: Inline with `Loader2` spinner icon, `text-sm text-slate-500`.

### 6.2 Trial Cards (`.trial-card`)

- White bg, `rounded-xl`, `border border-slate-200`, `p-4`.
- Hover: Elevated shadow.
- Selected state: `ring-2 ring-blue-500`.
- Fit score badge: `rounded-full`, colored per fit-score tier.
- Metadata row: `text-xs text-slate-500`, icons from lucide-react (`MapPin`, `FlaskConical`, `Building2`).

### 6.3 Intake Widgets

- Container: `rounded-xl border border-slate-200 bg-white p-4`.
- Options: Full-width buttons with `border-2`, `rounded-lg`, `px-4 py-3`.
  - Default: `border-slate-200`, hover `border-slate-300 bg-slate-50`.
  - Selected: `border-blue-500 bg-blue-50`.
- Submit / Continue: Full-width `bg-blue-600` button with `rounded-lg`.
- Submitted state: `opacity-75` on container, small "Submitted" label with check icon.

### 6.4 Stats Panel

- Header metric: `bg-gradient-to-br from-blue-600 to-blue-700`, white text, `rounded-xl`.
  - Large number: `text-3xl font-bold tabular-nums`.
  - Progress bar: `h-2 bg-blue-800/50 rounded-full` track, `bg-white/80` fill.
- Active filter chips: `bg-blue-50 text-blue-700 rounded-full text-xs`.
- Section containers: `bg-white rounded-lg border border-slate-200 shadow-sm p-2`.

### 6.5 Comparison Table

- Container: `rounded-xl border border-slate-200 bg-white`.
- Header row: `bg-slate-50 border-b border-slate-200`.
- Sortable headers: Clickable, `hover:text-slate-900`, arrow icons from lucide-react.
- Row hover: `hover:bg-slate-50`.
- Body dividers: `divide-y divide-slate-100`.

### 6.6 Buttons

| Variant | Classes |
|---------|---------|
| **Primary** | `bg-blue-600 text-white rounded-xl hover:bg-blue-700` (or `rounded-lg` in forms) |
| **Secondary / toolbar** | `bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50` |
| **Toggle (header)** | Active: `bg-blue-50 text-blue-700`, Inactive: `bg-slate-100 text-slate-600` |
| **Disabled** | `disabled:opacity-50 disabled:cursor-not-allowed` |
| **Transition** | `transition-colors` on all interactive elements |

### 6.7 Report Viewer

- Toolbar: `bg-slate-50 border-b border-slate-200`, icon + title left, action buttons right.
- Content area: `p-6 max-h-[600px] overflow-y-auto`.

---

## 7. Icons

All icons sourced from **lucide-react**. Common icons used:

- `Send` — chat input submit
- `BarChart3` — stats toggle
- `AlertTriangle` — disclaimer banner
- `Loader2` — status spinner (with `animate-spin`)
- `MapPin`, `FlaskConical`, `Building2` — trial card metadata
- `FileText` — report viewer
- `Download`, `Printer` — report actions
- `Check`, `CheckSquare` — selection confirmations
- `ArrowUp`, `ArrowDown`, `ArrowUpDown` — sortable table headers
- `Database` — stats panel loading/error state
- `Filter` — active filters label
- `TrendingDown` — search funnel label
- `X` — dismiss / remove (imported but available)

Standard icon sizes: `w-3 h-3` (inline metadata), `w-4 h-4` (buttons/status), `w-5 h-5` (toolbar headers), `w-8 h-8` (feature icons), `w-10 h-10` (empty states).

---

## 8. Animation

| Animation | Implementation | Usage |
|-----------|---------------|-------|
| Typing indicator | `@keyframes bounce` (scale 0 -> 1 -> 0), 1.4s infinite, staggered `-0.32s/-0.16s/0s` delays | Three dots while assistant is responding |
| Loading spinner | Tailwind `animate-spin` on `Loader2` icon | Status messages |
| Loading pulse | Tailwind `animate-pulse` | Stats panel skeleton state |
| Chart entrance | Recharts `animationDuration={600}` | All chart types |
| Card hover shadow | `transition: box-shadow 0.2s` | Trial cards |
| Button/row transitions | Tailwind `transition-colors` | All interactive elements |
| Progress bar fill | `transition-all duration-700 ease-out` | Stats header progress |

---

## 9. Charting (Recharts)

- Library: `recharts` v3.x
- All charts wrapped in `<ResponsiveContainer width="100%" height="100%">`.
- Donut: `innerRadius={45} outerRadius={75} paddingAngle={1}`, center text for total.
- Horizontal bar charts: `layout="vertical"`, right-side rounded corners, hidden X axis.
- Tooltip: `contentStyle={{ fontSize: 12 }}`.
- Axis tick text: `fontSize: 10-13, fill: "#64748b"` (slate-500).
- Grid lines (when used): `strokeDasharray="3 3" stroke="#e2e8f0"` (slate-200).

---

## 10. Maps (Leaflet)

- Library: `leaflet` + `react-leaflet` v5.
- Loaded dynamically (Next.js dynamic import, `ssr: false`).

---

## 11. Utility Libraries

| Library | Purpose |
|---------|---------|
| `clsx` | Conditional class name merging |
| `lucide-react` | Icon set |
| `recharts` | Charts and data visualization |
| `leaflet` / `react-leaflet` | Geographic maps |

---

## 12. Accessibility Notes

- WCAG AA compliance target for all components.
- Focus rings: `focus:ring-2 focus:ring-blue-500 focus:border-transparent` on inputs.
- `lang="en"` on `<html>`.
- Checkbox inputs alongside clickable rows for keyboard/screen-reader access.
- `disabled` states visually indicated with reduced opacity (50%).
- `line-clamp-*` used for text truncation (CSS-based, preserves full text for screen readers).
