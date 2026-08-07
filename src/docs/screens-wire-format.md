# Custom screens — wire format (put_screen)

Screens teach the runtime AI your layout patterns (flexible mode composes from them) and
power the Screen Builder. `put_screen` takes ONE screen in this exact shape:

```json
{
  "id": "custom-home",
  "name": "Home",
  "description": "Personalized home: hero plus product picks.",
  "config": {
    "selectionConfig": {
      "whenToUse": "The user opens the app or asks for the home page.",
      "exampleQueries": ["Show home page"],
      "clickedElements": ["product card → product order panel"]
    },
    "layout": { "type": "flex", "flexDirection": "column", "gap": { "xs": 2, "md": 3 }, "padding": { "xs": 2, "md": 3 } }
  },
  "elements": [
    {
      "id": "home-hero",
      "elementType": null,
      "customElementId": "nova-hero",
      "version": 3,
      "position": { "row": 0, "column": 0, "subRow": 0 },
      "size": { "width": { "md": "50.00%", "xs": "100%" }, "height": "auto",
                "flex": { "md": "1 1 50.00%", "xs": "1 1 100%" },
                "minWidth": null, "maxWidth": null, "alignSelf": null },
      "description": "Welcome hero with campaign"
    },
    {
      "id": "home-title",
      "elementType": "header",
      "position": { "row": 1, "column": 0, "subRow": 0 },
      "size": { "width": { "md": "100.00%", "xs": "100%" }, "height": "auto",
                "flex": { "md": "1 1 100.00%", "xs": "1 1 100%" },
                "minWidth": null, "maxWidth": null, "alignSelf": null },
      "description": "Section title"
    }
  ]
}
```

Rules (each learned the hard way):
- **The AI-selection fields are NESTED**: `config.selectionConfig.{whenToUse, exampleQueries,
  clickedElements}` — never flat on config (flat inputs are lifted, but write the nested form).
- **Positions are 0-BASED** — `{row: 0, column: 0, subRow: 0}` is the first slot.
- **Custom elements**: `elementType: null` + `customElementId: "<element-key>"` +
  `version: <current published version>` (get it from list_elements). Fixed elements use
  the KEBAB-CASE type value: header, stats-grid, data-table, line-chart, pie-chart,
  bar-chart, item-grid, item-card, image, details-data, chat-bubble, form, button, alert,
  video — NEVER the uppercase enum name (ITEM_GRID is silently nulled server-side).
- Sizes are percent strings with two decimals and a matching flex string; `xs` is always
  "100%" (mobile stacks). Centered single-element screens: `maxWidth` +
  `alignSelf: "center"`.
- `config.elements` must mirror `elements` — put_screen keeps them in lockstep for you.
- Keep 5–10 example screens per project; each teaches a pattern (home, listing, detail,
  answer+action, confirmation…). More is dilution, not coverage.
