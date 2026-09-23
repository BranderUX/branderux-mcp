import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The reference pack: every template folder is complete and every signature element is a
 * real sandbox element (Props + default Component), so get_template never hands a client AI
 * a broken example. Source files are checked directly (the build copies the folder).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "references");
const EXPECTED = ["barbershop", "bed-and-breakfast", "florist", "gift-shop", "restaurant"];

test("the five reference builds exist with metadata, a story and their elements", () => {
  const dirs = readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(dirs, EXPECTED);
  for (const id of dirs) {
    const meta = JSON.parse(readFileSync(join(ROOT, id, "template.json"), "utf8"));
    assert.equal(meta.id, id);
    for (const key of ["name", "role", "liveUrl"]) {
      assert.ok(typeof meta[key] === "string" && meta[key].length > 3, `${id}.${key}`);
    }
    for (const key of ["business", "moment", "homePattern"]) {
      assert.ok(typeof meta[key] === "string" && meta[key].length > 40, `${id}.${key}`);
    }
    assert.ok(meta.liveUrl.endsWith(".branderux.app"), `${id} live url`);
    assert.ok(Array.isArray(meta.tags) && meta.tags.length >= 3, `${id} tags`);
    assert.ok(meta.elements.length >= 3, `${id} elements`);
    assert.ok(meta.elements.some((e) => e.role === "home"), `${id} has a home element`);
    const story = readFileSync(join(ROOT, id, "story.md"), "utf8");
    for (const heading of ["## The moment", "## The home", "## One screen, one job", "## Fixed screens", "## Data", "## Art direction", "## Lessons that generalise"]) {
      assert.ok(story.includes(heading), `${id} story has ${heading}`);
    }
    for (const element of meta.elements) {
      // Text, not .tsx: the Vercel function drops .tsx files it does not import.
      assert.ok(element.file.endsWith(".tsx.txt"), `${id}/${element.file} is stored as .tsx.txt`);
      const path = join(ROOT, id, element.file);
      assert.ok(existsSync(path), `${id}/${element.file}`);
      const code = readFileSync(path, "utf8");
      assert.ok(code.includes("export interface Props"), `${id}/${element.key} exports Props`);
      assert.ok(code.includes("export default function Component"), `${id}/${element.key} exports Component`);
      assert.ok(element.notes.length > 20, `${id}/${element.key} notes`);
    }
  }
});

test("the design-bar doc frames itself as defaults and recommendations and points at the references", () => {
  const doc = readFileSync(join(ROOT, "..", "docs", "hosted-design-bar.md"), "utf8");
  assert.ok(doc.includes("DEFAULT and a RECOMMENDATION"));
  assert.ok(doc.includes("owner's instructions always win"));
  assert.ok(doc.includes("never for copying"));
  assert.ok(doc.includes("`list_templates`"));
  assert.ok(doc.includes("`get_template`"));
});

test("get_started, the contract and the build arc point at the design bar and the references", () => {
  const docs = join(ROOT, "..", "docs");
  assert.ok(readFileSync(join(docs, "getting-started.md"), "utf8").includes("hosted-design-bar"));
  assert.ok(readFileSync(join(docs, "hosted-agent-contract.md"), "utf8").includes("hosted-design-bar"));
  const prompts = readFileSync(join(ROOT, "..", "prompts.ts"), "utf8");
  assert.ok(prompts.includes("hosted-design-bar"));
  assert.ok(prompts.includes("never a kit to copy"));
});
