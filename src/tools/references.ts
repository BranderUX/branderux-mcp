import { z } from "zod";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READ_ONLY, fail, ok } from "./helpers.js";

/**
 * Reference builds: the five template sites, served as worked examples a client AI reads
 * before designing for a customer. Nothing here is copied into a project — the story says
 * what a build designed for its moment looks like, the element code shows how it was done.
 * Each reference is a folder under src/references/<id>/ with template.json (metadata),
 * story.md (the narrative) and one .tsx per signature element.
 */

const REFERENCES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "references");

export interface ReferenceElement {
  key: string;
  file: string;
  role: string;
  notes: string;
}

export interface ReferenceTemplate {
  id: string;
  name: string;
  role: string;
  business: string;
  moment: string;
  homePattern: string;
  liveUrl: string;
  tags: string[];
  elements: ReferenceElement[];
}

export function loadReferences(dir: string = REFERENCES_DIR): Map<string, ReferenceTemplate> {
  const references = new Map<string, ReferenceTemplate>();
  if (!existsSync(dir)) return references;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(dir, entry.name, "template.json");
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as ReferenceTemplate;
    references.set(meta.id, meta);
  }
  return references;
}

export function readReferenceStory(id: string, dir: string = REFERENCES_DIR): string | null {
  const path = join(dir, id, "story.md");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function readReferenceElement(
  template: ReferenceTemplate,
  key: string,
  dir: string = REFERENCES_DIR
): { element: ReferenceElement; code: string } | null {
  const element = template.elements.find((candidate) => candidate.key === key);
  if (!element) return null;
  const path = join(dir, template.id, element.file);
  return existsSync(path) ? { element, code: readFileSync(path, "utf8") } : null;
}

const summaryOf = (template: ReferenceTemplate) => ({
  id: template.id,
  name: template.name,
  role: template.role,
  business: template.business,
  moment: template.moment,
  homePattern: template.homePattern,
  liveUrl: template.liveUrl,
  tags: template.tags,
  elements: template.elements.map((element) => ({ key: element.key, role: element.role })),
});

export function registerReferenceTools(server: McpServer): void {
  const references = loadReferences();
  const ids = [...references.keys()].sort();
  if (ids.length === 0) return;

  server.registerTool(
    "list_templates",
    {
      title: "List the reference builds",
      description:
        "The five reference builds (a restaurant's waiter, a barbershop's receptionist, a florist, a bed-and-breakfast concierge, a gift shop's assistant): for each, the moment the visitor is in, the home pattern that moment produced, the live site and the signature elements. REFERENCES, NOT KITS: read the one whose MOMENT is closest to the customer's, then design for the customer with their data, voice and palette. Nothing is copied into a project. Read brander://docs/hosted-design-bar first.",
      inputSchema: {},
      outputSchema: {
        templates: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            role: z.string(),
            business: z.string(),
            moment: z.string(),
            homePattern: z.string(),
            liveUrl: z.string(),
            tags: z.array(z.string()),
            elements: z.array(z.object({ key: z.string(), role: z.string() })),
          })
        ),
        howToUse: z.string(),
      },
      annotations: READ_ONLY,
    },
    async () =>
      ok({
        templates: ids.map((id) => summaryOf(references.get(id) as ReferenceTemplate)),
        howToUse:
          "Pick the reference whose MOMENT (not category) is closest, call get_template for its story, then get_template with an element key for the code of the element you want to learn from. Adapt the pattern to the customer's moment, data, voice and palette; never copy tiles, copy or brand from a reference into a different business. These are defaults and recommendations; the owner's instructions win.",
      })
  );

  server.registerTool(
    "get_template",
    {
      title: "Read a reference build",
      description:
        "One reference build as a worked example: without `element`, the full story (the moment, the home, every screen and what it does, the fixed screens and their exact match queries, the data, the skills and persona, the art direction, the lessons that generalise) plus the signature elements with notes; with `element`, that element's complete TSX (Props, the component, its wiring) to read and learn from. For reading and adapting only — the customer's build is designed for the customer's moment. Available: " +
        ids.join(", "),
      inputSchema: {
        template: z.enum(ids as [string, ...string[]]),
        element: z
          .string()
          .optional()
          .describe("A signature element key from list_templates / the story, to read its code"),
      },
      outputSchema: {
        template: z.string(),
        name: z.string(),
        role: z.string(),
        liveUrl: z.string(),
        story: z.string().optional(),
        elements: z
          .array(z.object({ key: z.string(), role: z.string(), notes: z.string() }))
          .optional(),
        element: z
          .object({ key: z.string(), role: z.string(), notes: z.string(), code: z.string() })
          .optional(),
        reminder: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ template, element }) => {
      const reference = references.get(template);
      if (!reference) return fail(`Unknown reference '${template}'.`);
      const reminder =
        "A reference to read, not a kit to copy: the customer's home comes from the customer's moment, their rows, their voice and their palette. Defaults and recommendations only.";
      if (element) {
        const found = readReferenceElement(reference, element);
        if (!found)
          return fail(
            `No element '${element}' in '${template}'. Available: ${reference.elements.map((e) => e.key).join(", ")}.`
          );
        return ok({
          template: reference.id,
          name: reference.name,
          role: reference.role,
          liveUrl: reference.liveUrl,
          element: { key: found.element.key, role: found.element.role, notes: found.element.notes, code: found.code },
          reminder,
        });
      }
      const story = readReferenceStory(template);
      if (!story) return fail(`The story for '${template}' is missing.`);
      return ok({
        template: reference.id,
        name: reference.name,
        role: reference.role,
        liveUrl: reference.liveUrl,
        story,
        elements: reference.elements.map((e) => ({ key: e.key, role: e.role, notes: e.notes })),
        reminder,
      });
    }
  );
}
