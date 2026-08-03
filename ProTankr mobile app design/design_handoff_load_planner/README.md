# Handoff: proTankr Mobile — Load Planner Screen

## Overview
Redesign of proTankr's main driver-facing screen: the bulk-transport load planner. A driver picks a compartment configuration (preset), fine-tunes product/volume/center-of-gravity, confirms location/terminal and predicted product temperature, then commits the load. Secondary tabs (Cards, Vault) were added as placeholders for a terminal-access card wallet and a credentials vault.

## About the Design Files
The file in this bundle (`ProTankr Load Plan.dc.html`) is a **design reference built in HTML/React-like pseudocode** — a working prototype demonstrating layout, interaction, and visual states, not production code to copy directly. It runs on a small proprietary templating runtime (`support.js`, not included/relevant) — **do not port that runtime**. The task is to **recreate this design in proTankr's real codebase** (Next.js / React, per the existing `app/calculator/*` structure referenced during this design process) using its existing components, data models, and API routes wherever they already exist (e.g. `PlanSection.tsx`, `EquipmentBar.tsx`, `ExpirationAlertBar.tsx`, `TopTiles.tsx`, `QuickPanel.tsx`, `styles.ts`).

`ios-frame.jsx` is only a device-bezel wrapper used for previewing in a browser — ignore it entirely for implementation.

## Fidelity
**High-fidelity.** Colors, spacing, type sizes, and interaction behavior below should be treated as close to final — flag anything that conflicts with real data constraints.

## Screens / Views

### Load Planner (main / "Planner" tab)
**Purpose:** Driver selects a saved configuration (or builds one on the fly), sets per-compartment volumes and product, balances load via center-of-gravity, confirms terminal/temp, and taps Load.

**Layout (top → bottom, single scrolling column inside a phone-width shell, e.g. 393px design width):**
1. **Header** — full-bleed, no side padding, top padding ~60px (clears device status bar), no bottom padding (tab bar sits flush at its base). Background: `linear-gradient(180deg, #ffffff 0%, #f2f2f2 100%)` (light gradient — NOT green, no alert cluster).
   - Row: hamburger icon (left, 3 stacked 18×2px bars, `rgba(0,0,0,0.85)`, no button background/border) — bell icon (outline SVG, stroke `rgba(0,0,0,0.85)`, opens Expirations sheet, red count badge offset to the upper-right of the icon so the bell glyph stays visible behind it) — gear icon (outline SVG, opens Equipment sheet). Icons have 26px gap, no border/background/fill.
   - No scattered alert cluster in the header anymore — tapping the bell is the only way to see expirations (opens the same Expirations bottom sheet as before).
2. **Tab bar** — lives inside the header (white background, not black), ~18px top margin below the icon row. A horizontally snap-scrolling **carousel**, not a static row: each tab (Planner / Cards / Vault) occupies a fixed-width slot (~120px + 8px gap), container padding `calc(50% - 60px)` each side so the active tab centers and the other two peek at the frame edges. Swiping (or tapping any tab) recenters and selects it — see Interactions. Active tab: `#111` (near-black), weight 500, 16px. Inactive: `rgba(0,0,0,0.35)`, weight 400, 14px.
   - Below the tab row: one full-width divider line split into exact thirds — outer thirds `rgba(0,0,0,0.15)` at 1px height, center third `#111` at 2px height (visually indicates the always-centered active tab). The dark content area (`#0b0b0b`) begins immediately below this divider.
3. **Tab content** (scrollable, 16px padding, hidden scrollbar):

   **Planner tab:**
   - **Preset dial**: same carousel pattern as the main tabs — 5 letter slots (A–E), ~60px each, swipe or tap to select. Active preset: white, weight 600, 15px, with a small 4px white dot below it. Configured-but-inactive: `rgba(255,255,255,0.55)`, weight 500, 12px. Unset preset: `rgba(255,255,255,0.25)`.
   - **Action row** (appears conditionally, 12px top margin): left side "Save changes to {letter}" text button (only if current config diverges from the loaded preset); right side "Edit Comp {n} product" text button (only if a compartment is selected). Both plain text, no border/background, `rgba(255,255,255,0.75)`, 12px.
   - **Compartment strip**: up to 5 bars, rendered **right-to-left** (Compartment 1 rightmost, 5 leftmost — passenger-side-of-truck orientation). Each bar's **width is proportional to its share of total trailer capacity** (not equal columns) — e.g. `widthPct = compartmentMax / totalMax * 100 * 0.94`. Bar height 150px, background `rgba(255,255,255,0.06)`, rounded top corners (10px), squared-ish bottom (6px).
     - **Cap line**: a static 1px `rgba(255,255,255,0.22)` horizontal line at the compartment's configured ceiling (set in a separate Settings area — NOT adjustable here). This is informational only.
     - **Fill**: colored bar from the bottom, height = current gallons ÷ compartment max capacity, inset 10% each side, rounded top. Color = the loaded product's real hex (see Design Tokens).
     - **Fill drag handle**: a thin white pill (36×5px, rounded) sitting exactly at the top of the fill, draggable vertically to manually set that compartment's gallons (bounded by the cap line, not by the fluid auto-balance). While dragging, a small tooltip pill above the handle shows the live gallon value. A manually-set compartment gets a soft white glow on its fill and is excluded from CG auto-redistribution until a new preset is loaded.
     - Below each bar: compartment number (small, muted, above bar), product code (colored to match product, e.g. "D2"), and current gallons (muted gray, 12px).
     - Tapping the bar body (not the drag handle) selects that compartment and reveals the "Edit Comp N product" button (see Action Row) — it does **not** open the picker directly, avoiding conflict with the drag gesture.
   - **Center-of-gravity control**: minimal horizontal slider — thin 4px track (`rgba(255,255,255,0.10)`), a plain light-gray (`#d9d9d9`) circular puck (22px), no numeric readout, no "Center of Gravity" label. "Rear" / "Front" captions below, 10px, `rgba(255,255,255,0.3)`. Dragging shifts gallons live between the front pair (comp 1–2) and rear pair (comp 4–5), respecting each compartment's cap and the overall weight limit.
   - **Info cards** (each: 16px radius, `rgba(255,255,255,0.10)` border, `rgba(255,255,255,0.03)` fill, 14px padding, stacked with 10px gap):
     - **Equipment**: two-up layout — "Truck · {unit#}" / make sublabel, and "Trailer · {unit#}" / make sublabel (e.g. Kenworth / MAC), chevron right. Opens Equipment sheet.
     - **Location/Terminal**: "Terminal {n}" as the primary label (terminal first, not city first), sublabel "{City, State} · Card # {n} · PIN {n}" — the card number and gate PIN are shown here as at-a-glance reference info for the driver at the gate, not hidden in a modal.
     - **Temp confidence**: primary label "{temp}°F predicted product temp" (not "at delivery" — the prediction is for the terminal/loading point). Sublabel is the confidence tier only ("High confidence" / "Medium confidence" / "Low confidence" — no extra qualifier text). Sublabel color: green (high), amber (medium), red (low). Primary-label color: muted gray when high confidence (nothing to worry about, de-emphasized), full white when medium or low (draws the eye). Border stays neutral (`rgba(255,255,255,0.08)`) always — no colored borders. Background very subtly brightens as confidence drops (`rgba(255,255,255,0.02)` → `0.045` → `0.07`). Tapping opens the Temp sheet.
   - **Load button**: full-width, white background, black "LOAD" text, centered, same corner radius/padding as the info cards above (16px radius, 14px padding) so it reads as part of the same button group.
   - **Load summary**: unbordered panel (16px radius, `rgba(255,255,255,0.03)` fill only) below Load: gallons total as the primary line ("{n} gal"), then a small muted row "Target {lbs} · Actual {lbs} · Diff {±lbs, green if under, red if over}".
   - Footnote line (10px, `rgba(255,255,255,0.32)`): "Product API & temp confirm automatically after this load — sharpens the number for the next driver at this terminal."

   **Cards tab:** City selector — same centered-dial carousel pattern as the main tabs (smaller: active 13px/weight 500, inactive 11px/weight 400), swipe or tap a city to center/select it. Below: a vertical stack of terminal-card panels for the selected city (gradient card background, terminal name + status badge, masked card number, PIN + expiration).

   **Vault tab:** Simple list of stored credentials (label + masked username), each with a "Show/Hide" toggle button revealing/masking the value. Placeholder — needs real secure-storage backing.

### Modals (all: dark overlay `rgba(0,0,0,0.55)`, bottom sheet sliding up, `#141414` background, 20px top corner radius, 16px padding)
- **Equipment sheet**: list of equipment, current selection highlighted.
- **Expirations sheet**: list of expiring/expired credentials, red for expired, amber for expiring soon.
- **Temp sheet**: big temp readout, same minimal drag-slider pattern as CG (60–110°F range), "Use network prediction" (resets manual override) / "Set manually" actions.
- **Product picker sheet** (opened via "Edit Comp N product"): one row per product — colored dot (real product hex) + code + full name, a red "DYED" tag for dyed diesel (color stays yellow — dye color — only the badge is red for visibility), UN number as subtext where applicable (e.g. Jet A), current selection highlighted green with a checkmark, plus an "Empty" option.
- **Nav menu** (opened via hamburger): small dropdown, signed-in-as email, Profile / Learn / Sign Out.

## Interactions & Behavior
- **Centered-dial carousels** (main tabs, preset letters, city selector): CSS scroll-snap (`scroll-snap-type: x mandatory`, each item `scroll-snap-align: center`), container side-padding calculated as `calc(50% - halfItemWidth)` so the item at scroll-position 0 is centered and neighbors peek at the frame edges. A debounced (`~80ms`) scroll listener finds whichever item's center is closest to the container's center and treats it as selected. Tapping any item (even a peeking one) also works — compute the item's target `scrollLeft` to center it and `scrollTo({ left, behavior: 'smooth' })`, applying the same state change immediately (don't wait for the scroll-driven listener). Native scrollbars are hidden (`scrollbar-width:none`, `::-webkit-scrollbar{display:none}`).
- **Header revision (latest)**: the green gradient header, scattered alert cluster, and giant preset-letter watermark were all removed in a later iteration and should NOT be built — see the updated Header/Tab bar description above. The bell icon alone (opening the Expirations sheet) is now the only entry point to expiration info from this screen.
- **Compartment fill drag**: pointer-down on the handle captures the pointer, pointer-move maps vertical position within the bar to a gallon value bounded by `[0, cap]`, pointer-up releases. Marks the compartment "manual" (excluded from CG auto-balance and preset auto-fill) until a new preset is loaded.
- **CG drag**: pointer position mapped to 0–1 across the track width; redistributes gallons between front (1–2) and rear (4–5) groups proportionally to their remaining capacity, respecting each compartment's cap and the overall max legal weight.
- **Load calculation**: for each compartment, effective max = `physical_max × cap_fraction`. Auto-fill fraction = `min(1, allowed_lbs / sum(effective_max × lbs_per_gal))` across all non-manually-set compartments, after subtracting weight already committed to manually-set compartments. CG shifts move gallons between front/rear groups without violating any compartment's effective max.
- **Preset load**: replaces products/caps/CG from the saved preset, clears any manual overrides, marks the config "unmodified". Editing anything while a preset is active flags it "modified" and surfaces "Save changes to {letter}", which writes the current products/caps/CG back into that preset slot.

## State Management
Key state: `products[5]` (product id or null per compartment), `caps[5]` (0–1 fraction of physical max, set in Settings — not exposed here), `cg` (0–1), `activePreset` (A–E or null), `modified` (bool), `manualFill[5]` (fraction or null — per-compartment manual override), `selectedIndex`/`openIndex` (which compartment is selected / has its picker open), `manualTemp` (override °F or null), `tempConfidence` (network-computed: good/check/bad), `activeTab`, `activeCity`, various modal-open booleans.

Real data needed from backend: product catalog (`products` table — button_code, hex_code, display_name, lbs_per_gal/API gravity, is_dyed), per-compartment physical max + configured cap, saved presets per truck/trailer combo, terminal card number + PIN + expiration per city/terminal, live network-sourced temp prediction + confidence, credential expirations, equipment list.

## Design Tokens
- **Colors**: background `#0b0b0b` (near-black); header gradient `#8fc9a8 → #6ba889 → #4a8f74` (sage green); primary text `#fff`; muted text `rgba(255,255,255,0.35–0.55)`; borders `rgba(255,255,255,0.08–0.14)`; card fill `rgba(255,255,255,0.03–0.06)`; success/green `#4ade80`; warning/amber `#eab308`; danger/red `#ef4444`.
- **Real product hex** (from `products` table): ULSD Diesel #2 `#FFD400`, Off-road Dyed Diesel `#FFD400` (dyed tag rendered in red `#ef4444` for visibility, not the fill color), Regular E10 87 `#FFFFFF`, Flex Fuel E85 `#0A84FF`, Jet A `#FFD400`.
- **Typography**: font family **Outfit** (Google Fonts, weights 400–900), replacing the app's previous Inter/Arial usage. Body copy generally weight 400–500; emphasis 600; avoid 700+ except large display numbers — Outfit reads heavier than Inter at equivalent weights.
- **Radius**: 16px for cards/buttons/sheets tops (20px), 12px for smaller chips, 8px for tiny buttons.
- **Spacing**: 16px screen padding, 8–14px gaps between stacked elements, 10px gaps in card stacks.

## Assets
No image/icon assets — all icons are inline stroke-only SVGs (bell, gear) at `stroke-width: 2`, `rgba(0,0,0,0.85)` on the green header. No emoji, no icon fonts.

## Files
- `ProTankr Load Plan.dc.html` — the full design reference (single file, inline styles, template + logic class as described above). Search for the `PRODUCTS`, `COMPS`, and `TERMINAL_CARDS` constants near the top of the `<script>` block for the current mock data shape.
- `ios-frame.jsx` — device bezel used only for the in-browser preview; not needed for implementation.
