/**
 * Re-pinning screens after `edit_element` publishes a new version. A custom placement pins ONE
 * version (`elementType: null`, `customElementId: <element key>`, `version: <n>`), so a fix
 * reaches a screen only once its placements point at the new number. Only the placements pinned
 * to the version the edit was applied to move: a pin to any other version may be deliberate (a
 * screen kept on an older props contract), so it is left alone and reported (`otherPinsIn`).
 * Everything else in the screen goes back byte for byte: only the `version` value of the moved
 * placements changes, in `elements` and in its mirror `config.elements`. The screen-level
 * `version`, `created` and `modified` are the server's own and are left out of the write, as
 * put_screen leaves them out.
 */

type Json = Record<string, unknown>;

export interface OtherPin {
  screenId: string;
  version: number;
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A placement of this custom element, with the version it pins (null when it pins none). */
function pinnedVersion(placement: unknown, elementKey: string): number | null {
  if (!isObject(placement) || placement.elementType != null || placement.customElementId !== elementKey) return null;
  return typeof placement.version === "number" ? placement.version : null;
}

/** A placement of this custom element pinned to exactly `version`. */
export function pinsVersion(placement: unknown, elementKey: string, version: number): boolean {
  return pinnedVersion(placement, elementKey) === version;
}

/** Both placement lists of a screen: `elements` and its mirror `config.elements`. */
function placementLists(screen: Json): unknown[][] {
  const lists: unknown[][] = [];
  if (Array.isArray(screen.elements)) lists.push(screen.elements);
  if (isObject(screen.config) && Array.isArray(screen.config.elements)) lists.push(screen.config.elements);
  return lists;
}

/** Whether the screen has a placement of this element pinned to exactly `version`. */
export function screenPinsVersion(screen: Json, elementKey: string, version: number): boolean {
  return placementLists(screen).some((list) => list.some((placement) => pinsVersion(placement, elementKey, version)));
}

function repinList(list: unknown, elementKey: string, fromVersion: number, toVersion: number): { list: unknown; changed: number } {
  if (!Array.isArray(list)) return { list, changed: 0 };
  let changed = 0;
  const next = list.map((placement: unknown) => {
    if (!pinsVersion(placement, elementKey, fromVersion)) return placement;
    changed += 1;
    return { ...(placement as Json), version: toVersion };
  });
  return { list: changed > 0 ? next : list, changed };
}

/**
 * The screen to PUT back with this element's placements pinned to `fromVersion` moved to
 * `toVersion`, or null when the screen has no such placement (it is then left untouched).
 * Placements pinned to any other version keep their pin.
 */
export function repinScreen(screen: Json, elementKey: string, fromVersion: number, toVersion: number): Json | null {
  const elements = repinList(screen.elements, elementKey, fromVersion, toVersion);
  const config = isObject(screen.config) ? screen.config : null;
  const configElements = config
    ? repinList(config.elements, elementKey, fromVersion, toVersion)
    : { list: undefined, changed: 0 };
  if (elements.changed + configElements.changed === 0) return null;
  const { version: _version, created: _created, modified: _modified, ...rest } = screen;
  return {
    ...rest,
    ...(elements.changed > 0 ? { elements: elements.list } : {}),
    ...(config && configElements.changed > 0 ? { config: { ...config, elements: configElements.list } } : {}),
  };
}

/**
 * Every pin of this element to a version that is neither the one the edit was applied to nor the
 * one it published: one entry per screen and version (the `config.elements` mirror is not counted
 * twice), in screen order, versions ascending.
 */
export function otherPinsIn(screens: readonly Json[], elementKey: string, editedVersion: number, publishedVersion: number): OtherPin[] {
  const pins: OtherPin[] = [];
  for (const screen of screens) {
    const versions = new Set<number>();
    for (const list of placementLists(screen)) {
      for (const placement of list) {
        const version = pinnedVersion(placement, elementKey);
        if (version !== null && version !== editedVersion && version !== publishedVersion) versions.add(version);
      }
    }
    const screenId = typeof screen.id === "string" ? screen.id : "";
    for (const version of [...versions].sort((a, b) => a - b)) pins.push({ screenId, version });
  }
  return pins;
}
