/**
 * A stored screen's placements and their own `defaultProps`.
 *
 * The web app renders every placement of a stored screen as
 * `{ ...placement.defaultProps, ...data[placement.id] }`, and a placement with
 * no data at all still renders from its defaultProps alone. A stored screen is
 * what the designed home, every fixed screen and every deterministic answer
 * replays, so whatever sits in a placement's defaultProps reaches visitors each
 * time that data leaves a key out. Sample rows, form prefills and a preset
 * topic there show to real people as if they were true.
 *
 * An ELEMENT's own defaultProps are a different thing: only previews read them
 * (the preview panel, the Element Library, the actions contract's exampleItem),
 * never a live answer. Samples belong there and nowhere else.
 */

export interface PlacementDefaults {
  placementId: string;
  keys: string[];
}

/** The placements of `elements` that carry a non-empty defaultProps object, with its keys. */
export function placementDefaults(elements: readonly unknown[]): PlacementDefaults[] {
  const found: PlacementDefaults[] = [];
  for (const element of elements) {
    if (typeof element !== "object" || element === null) continue;
    const placement = element as Record<string, unknown>;
    const defaults = placement.defaultProps;
    if (typeof defaults !== "object" || defaults === null || Array.isArray(defaults)) continue;
    const keys = Object.keys(defaults);
    if (keys.length === 0) continue;
    const placementId = typeof placement.id === "string" ? placement.id : "(no id)";
    found.push({ placementId, keys });
  }
  return found;
}

/** The note a put_screen result carries for one placement with defaultProps. */
export function placementDefaultsNote({ placementId, keys }: PlacementDefaults): string {
  return (
    `Placement "${placementId}" carries defaultProps (${keys.join(", ")}). A replay renders them ` +
    "under its data, and a placement with no data renders from them alone, so they reach visitors " +
    "whenever the home, a fixed screen or a deterministic answer leaves those keys out. Keep only " +
    "copy that is right on every render; take out sample rows, form prefills and a preset topic " +
    "(samples belong in the element's own defaultProps, which only previews read)."
  );
}
