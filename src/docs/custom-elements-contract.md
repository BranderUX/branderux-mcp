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
- Wiring is DERIVED from the code: the primary action is the first well-known callback
  name (onSelect, onRowClick, …), else the first select/click/open/view/press-flavored
  one. Set it explicitly via `interactionPropName`.

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

## Seeing what you built

After `create_element` / `publish_element_version` (or via `preview_element` at any
time), clients that support MCP Apps render the element live in the panel with its
`defaultProps` — every callback is shimmed to display the exact query the click would
send, so you and the user can verify wiring before it ships to a screen.

## Query templates

`clickQueryTemplate` turns clicks into agent queries. Plain string = primary action
template; JSON map = per-action:
`{"$primary": "Show details for {name} (ID: {id})", "onAddToCart": "Add {name} to my cart"}`.
`{tokens}` resolve against the callback's payload object.
