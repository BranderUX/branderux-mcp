# Custom element authoring contract

You (the agent) write the element's TSX yourself. `create_element` validates and publishes
it. Elements render inside a SANDBOXED IFRAME on every surface — these rules exist because
of that.

## Structure (exact)

```tsx
import { useState, useEffect } from "react";
import { Box, Typography, Button } from "@mui/material";

export interface Props {
  items: { id: string; name: string; price: number; imageUrl: string }[];
  title?: string;
  onSelectItem?: (item: { id: string; name: string }) => void;   // optional callbacks
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

export default function Component({ items, title, onSelectItem, onItemContextMenu }: Props) {
  // ...
}
```

- `export interface Props` + `export default function Component` — exactly these names.
- **No default values on props** (demo data goes in defaultProps, not the code).
- Allowed imports ONLY: react, @mui/material, @mui/system, @emotion/react,
  @emotion/styled, lucide-react, recharts, framer-motion, date-fns.
- Skeleton file: `export default function SkeletonComponent()` using Box/Skeleton/Stack.

## Interactivity rules

- Call every callback with optional chaining: `onSelectItem?.(item)`. ONE callback per
  gesture; distinct actions get distinct action-named callbacks (`onAddToCart`, not a
  generic `onChange` + `onSelect` pair).
- **Right-click**: add `onItemContextMenu` and wire it per item —
  `onContextMenu={(e) => { e.preventDefault(); onItemContextMenu?.(e, item); }}` on the
  same node as the item's onClick. Only the component knows which item a gesture hit.
- EXTERNAL ACTION (agent query) = declared action-named callback. INTERNAL STATE
  (selection, tabs, steps) = useState — resync with useEffect when the prop changes.
- Wiring is DERIVED from the code, identically on every surface (runtime, `list_elements`,
  the publish pre-flight): the primary action is the first well-known callback name
  (onSelect, onRowClick, …), else the first select/click/open/view/press-flavored one,
  else the ONLY callback when exactly one is declared. `interactionPropName` is ADVISORY
  and does NOT override derivation — pass the derived name or null. With 2+ callbacks and
  no select/click/open/view/press-flavored name there is NO primary: a `$primary` /
  plain-string template is then orphaned (the runtime never sends it, while the panel
  preview appears to), so key EVERY template by its callback name in the JSON map form
  (`{"onStartOrder": "...", "onAskCare": "..."}`) — or rename a callback to a flavored
  name. `create_element` / `publish_element_version` REJECT the mismatch in pre-flight.
- **Forms**: every form element must expose an initial-value prop for EACH field
  (per-field defaults, e.g. `initialName`, `initialDate`, or an `initialValues` object)
  so the agent can prefill values it already knows from the conversation — a visitor
  should never retype their own name or a date they just said. Date and time fields use
  real pickers (`<input type="date">` / `type="time"` or equivalent), never free text.

## Sandbox constraints (violations look broken in production)

- **Popovers must not move focus** — Select/Menu/Dialog need
  `autoFocus: false, disableAutoFocusItem/AutoFocus/EnforceFocus/RestoreFocus/ScrollLock: true`
  (focus moves scroll the HOST page).
- **Motion needs room** — hover lift/scale/shadows clip at the iframe edge; pad the root
  container, or keep motion inside overflow-hidden cards.
- **View swaps keep the same height** — in-place view changes (order → confirm) must keep
  one fixed height or the content-sized iframe resizes and the host page jumps.
- **Breakpoints resolve against the ELEMENT IFRAME width**, not the page — use `sm` keys
  for anything that must respond inside half-width slots.
- Images must be absolute https URLs.
- **Links open in a new tab** — `<a href="…" target="_blank" rel="noopener">` (MUI `Link`
  with the same props). The element frame allows popups but never top-level navigation: a
  link WITHOUT `target="_blank"` loads its destination inside the element's own frame, and
  `window.location` never navigates the visitor's page. `create_element` WARNs `LINK_TARGET`.
- **Palette tokens**: the sandbox theme maps the brand to `primary` / `secondary` / `info`
  — the brand ACCENT is `info.main`. Text on a primary fill uses `primary.contrastText`;
  body text uses `text.primary` / `text.secondary`. NEVER use `background.default` or
  `accent.main` as a COLOR: `background.default` is the page surface (on a primary fill it
  has resolved to invisible text), and `accent` is not a palette key (the declaration is
  dropped and the text inherits).

## Accessible by construction (WCAG 2.0 AA / IS 5568)

Elements ship into real customer sites that carry a legal accessibility duty, so the FIRST
version is accessible — never a later pass:

- **Every activatable thing is a real control.** Anything with `onClick` must be a `<Button>`,
  `<IconButton>`, `<CardActionArea>`, `<ListItemButton>`, a `<Tab>`, or a node with
  `component="button"`. A `Box`/`Card`/`Paper`/`Stack`/`Grid`/`TableRow`/`div` whose only
  interaction is `onClick` is mouse-only: no tab stop, Enter and Space do nothing, and a screen
  reader never announces it. When the markup forbids a control (a `TableRow`), give the SAME node
  all four — `role="button"`, `tabIndex={0}`, an `aria-label` naming the item, and an Enter/Space
  `onKeyDown` that calls exactly what the click calls:

```tsx
<TableRow
  key={row.id}
  hover
  role="button"
  tabIndex={0}
  aria-label={`Open ${row.name}`}
  sx={{ cursor: "pointer" }}
  onClick={() => onSelectItem?.(row)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectItem?.(row);
    }
  }}
  onContextMenu={(e) => { e.preventDefault(); onItemContextMenu?.(e, row); }}
>
```

- That focusable node is also what makes **right-click reachable without a mouse** — the context
  menu opens with Shift+F10 / the Menu key on the FOCUSED element, so an unfocusable host has no
  right-click at all for keyboard users.
- **Images carry `alt`** describing what the image SHOWS (`alt={item.name}`) — never a file name,
  a URL fragment, or "image". Only a purely decorative image takes `alt=""`.
- **Icon-only buttons carry `aria-label`**: `<IconButton aria-label="Remove from cart">` — an icon
  alone announces as "button" and nothing else.
- **The element's own title is a real heading**: `<Typography variant="h6" component="h3">` — the
  variant is the SIZE, `component` is the MEANING. Never `component="div"`/`"span"` on a title.
  Screen-reader users navigate a screen by its headings (IS 5568 raises WCAG's Section Headings to
  a level-AA requirement); the host screen owns h1/h2, so start at h3.
- **Tables are tables** (`TableHead` + `TableCell` header cells, never a `Box` grid imitating one),
  **form fields are labelled** (a `label`, or `aria-label` when there is no visible one, plus
  `error` + `helperText` when a field can be invalid — a placeholder is never a label).
- **Never remove the focus ring.** If you set `outline: "none"`, replace it in the same `sx`:
  `"&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 }`.
- **Colour is never the only signal** — a red "Out of stock" chip must SAY "Out of stock".

## Layout is direction-neutral (LTR and RTL sites)

Published sites and embeds can run right-to-left (Hebrew, Arabic…); the host document sets
`dir`, and the element must render correctly either way WITHOUT knowing which:

- Space siblings with flex/grid `gap` (`gap`, `rowGap`, `columnGap`) — never with left/right
  margins or paddings.
- Never write a physical side: no `ml`/`mr`/`pl`/`pr`, `marginLeft/Right`, `paddingLeft/Right`,
  `left`/`right`, `textAlign: "left"|"right"`, `float`, or per-corner radii.
- When one side truly must differ, use the logical form: `marginInlineStart/End`,
  `paddingInlineStart/End`, `insetInlineStart/End`, `textAlign: "start"|"end"`,
  `borderStartStartRadius`.
- Never set `dir` yourself. Icons that point somewhere (arrows, chevrons, send) mirror under RTL:
  `sx={{ '[dir="rtl"] &': { transform: "scaleX(-1)" } }}`.

`<Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>` is right; `sx={{ ml: 2 }}` on
the second child is wrong.

## Seeing what you built

After `create_element` / `publish_element_version` (or via `preview_element` at any
time), clients that support MCP Apps render the element live in the panel with its
`defaultProps` — every callback is shimmed to display the exact query the click would
send, so you and the user can verify wiring before it ships to a screen.

The version number the publish tool RETURNS (`create_element` → 1,
`publish_element_version` → `publishedVersion`) is authoritative: pin screen placements
to it, never to a remembered or narrated number. Where your client exposes it (Claude Code
and other MCP clients), `list_element_versions` lists every version with its `createdAt`
when you need to check what actually landed; without it, `get_element`'s `currentVersion`
is the check.

## Query templates

`clickQueryTemplate` turns clicks into agent queries. Plain string = primary action
template; JSON map = per-action:
`{"$primary": "Show details for {name} (ID: {id})", "onAddToCart": "Add {name} to my cart"}`.
`{tokens}` resolve against the callback's payload object.

**Write/submit templates carry the FULL payload.** A submit/order/enquiry callback's
template is the ONLY channel to the runtime agent — the submission arrives as a query
built from it, and payload fields you don't name as `{tokens}` are DISCARDED before the
agent sees them. A gift-message field the element collects but the template omits never
leaves the iframe. Name every field the downstream write tool (`create_<entity>`) needs:
`"Submit order: {name}, {phone}, deliver to {deliveryAddress}, card message: {cardMessage}, total {total}"`.
See read_doc hosted-agent-contract → MAKING A WRITE ACTUALLY WORK.

## Porting existing components

Customers with their OWN gen-UI components: read_doc port-existing-components —
the 7-step porting contract (UI becomes a BranderUX element; fetches/mutations
become named action callbacks wired back via the SDK actionHandlers).
