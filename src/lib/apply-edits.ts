/**
 * Search-and-replace edits for `edit_element`: a small fix to an element costs the lines that
 * change, never a re-typed file. A port of the web app's proven Vibe Studio algorithm
 * (BranderUX-client `lib/vibe-studio/apply-search-replace.ts`), same semantics:
 *
 * - Edits apply IN ORDER, each to the code the edits before it leave.
 * - A `search` must match exactly ONE place: the exact text first, then a line-wise match that
 *   ignores trailing whitespace and one CONSISTENT leading-indent offset (the replacement is
 *   re-indented by the same offset). Measured in the app, the indent-tolerant pass takes applied
 *   edits from 93% to 98.6%; nearly every miss is a re-indented quote of the right code.
 * - More than one match is REFUSED: taking the first would ship a mis-targeted edit that compiles
 *   and renders with no error anywhere.
 *
 * Added here: an edit whose replacement equals its search is refused as `no_change`, every edit is
 * checked (a failed one is skipped, the rest still run) so one call reports every failure, and each
 * failure carries a hint the model can act on. ANY failure refuses the whole call.
 */

export interface SearchReplaceEdit {
  search: string;
  replace: string;
}

export type EditFailureReason = "not_found" | "ambiguous" | "empty_search" | "no_change";

export interface EditFailure {
  /** 0-based position of the edit in the call. */
  index: number;
  reason: EditFailureReason;
  hint: string;
}

export type ApplyEditsResult =
  | { ok: true; code: string; applied: number }
  | { ok: false; failures: EditFailure[] };

/** How many match sites are collected: two prove ambiguity, a few more make the hint useful. */
const MATCH_LIMIT = 5;
/** Above this size the closest-line search is skipped (the hint is a courtesy, not a cost). */
const CLOSEST_LINE_MAX_CODE = 200_000;
/** A "closest" line below this bigram similarity is noise, not a hint. */
const CLOSEST_LINE_MIN_SCORE = 0.4;

interface Match {
  start: number;
  end: number;
  /** Spaces to add (positive) or remove (negative) from the replacement's own indentation. */
  indentDelta: number;
  /** 1-based line of the match in the code it was found in. */
  line: number;
}

/**
 * A CRLF file (every line break is `\r\n`) is matched as LF, the edits too, and written back with
 * `\r\n` on every line, so a model that quotes it either way gets the same match and the file keeps
 * its endings. Any other file (LF, or mixed endings) is matched as it is.
 */
export function applyEdits(source: string, edits: readonly SearchReplaceEdit[]): ApplyEditsResult {
  if (!isCrlf(source)) return applyEditsLf(source, edits);
  const result = applyEditsLf(
    toLf(source),
    edits.map((edit) => ({ search: toLf(edit.search), replace: toLf(edit.replace) }))
  );
  return result.ok ? { ...result, code: result.code.replace(/\n/g, "\r\n") } : result;
}

/** Every line break is `\r\n` (and there is at least one). */
function isCrlf(text: string): boolean {
  return text.includes("\r\n") && !/(^|[^\r])\n/.test(text);
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function applyEditsLf(source: string, edits: readonly SearchReplaceEdit[]): ApplyEditsResult {
  let code = source;
  let applied = 0;
  const failures: EditFailure[] = [];

  edits.forEach((edit, index) => {
    const failure = (reason: EditFailureReason, hint: string): void => {
      failures.push({ index, reason, hint: index > 0 ? `${hint} ${ORDER_NOTE}` : hint });
    };
    // An empty search would match at index 0 and silently prepend: refuse it outright.
    if (edit.search.trim().length === 0) {
      failure("empty_search", "search is empty. Copy the lines to change from the current code, with enough around them to match one place.");
      return;
    }
    if (edit.search === edit.replace) {
      failure("no_change", "replace is the same as search, so this edit changes nothing. Put the new text in replace, or leave the edit out.");
      return;
    }

    const exact = exactMatches(code, edit.search);
    const matches = exact.length > 0 ? exact : indentTolerantMatches(code, edit.search);
    if (matches.length === 0) {
      failure("not_found", notFoundHint(code, edit.search));
      return;
    }
    if (matches.length > 1) {
      failure("ambiguous", ambiguousHint(matches));
      return;
    }
    const match = matches[0];
    const replacement = exact.length > 0 ? edit.replace : reindent(edit.replace, match.indentDelta);
    code = code.slice(0, match.start) + replacement + code.slice(match.end);
    applied += 1;
  });

  return failures.length > 0 ? { ok: false, failures } : { ok: true, code, applied };
}

const ORDER_NOTE = "The edits before it in this call run first, so search must match the code as they leave it.";

/** Every exact occurrence, overlapping ones included (as the app counts them), up to the limit. */
function exactMatches(code: string, search: string): Match[] {
  const found: Match[] = [];
  let at = code.indexOf(search);
  while (at !== -1 && found.length < MATCH_LIMIT) {
    found.push({ start: at, end: at + search.length, indentDelta: 0, line: lineOf(code, at) });
    at = code.indexOf(search, at + 1);
  }
  return found;
}

/**
 * Locate `search` ignoring (a) trailing whitespace and (b) a CONSISTENT leading-indent offset on
 * every line. Lines that drift independently are not the same code and never match. After a hit
 * the scan resumes past it, so overlapping re-matches of one region are not a second site.
 */
function indentTolerantMatches(source: string, search: string): Match[] {
  const sourceLines = source.split("\n");
  const searchLines = search.split("\n");
  const lineStarts: number[] = [];
  let cursor = 0;
  for (const line of sourceLines) {
    lineStarts.push(cursor);
    cursor += line.length + 1;
  }

  const found: Match[] = [];
  for (let i = 0; i + searchLines.length <= sourceLines.length && found.length < MATCH_LIMIT; i++) {
    let delta: number | null = null;
    let matched = true;
    for (let j = 0; j < searchLines.length; j++) {
      const sourceLine = sourceLines[i + j] ?? "";
      const wantLine = searchLines[j] ?? "";
      // Blank lines carry no indentation information: accept and skip the offset check.
      if (sourceLine.trim().length === 0 && wantLine.trim().length === 0) continue;
      if (sourceLine.trim() !== wantLine.trim()) {
        matched = false;
        break;
      }
      const lineDelta = leadingSpaces(sourceLine) - leadingSpaces(wantLine);
      if (delta === null) delta = lineDelta;
      else if (delta !== lineDelta) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const last = i + searchLines.length - 1;
    // A mixed-endings file keeps the `\r` of the last matched line (trim() matched past it).
    const lastLine = sourceLines[last] ?? "";
    found.push({
      start: lineStarts[i] ?? 0,
      end: (lineStarts[last] ?? 0) + lastLine.length - (lastLine.endsWith("\r") ? 1 : 0),
      indentDelta: delta ?? 0,
      line: i + 1,
    });
    i = last;
  }
  return found;
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

/** Shift every non-blank line of `text` by `delta` spaces (clamped at column 0). */
function reindent(text: string, delta: number): string {
  if (delta === 0) return text;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) return line;
      if (delta > 0) return " ".repeat(delta) + line;
      return line.slice(Math.min(-delta, leadingSpaces(line)));
    })
    .join("\n");
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (code.charCodeAt(i) === 10) line += 1;
  return line;
}

function ambiguousHint(matches: Match[]): string {
  const count = matches.length >= MATCH_LIMIT ? `${MATCH_LIMIT} or more` : String(matches.length);
  const lines = matches.map((match) => match.line).join(", ");
  return `search matches ${count} places (lines ${lines}). Include more of the surrounding lines so it matches exactly one place.`;
}

/** Which line of the search is missing, and the code's closest line to it when that is cheap. */
function notFoundHint(code: string, search: string): string {
  const copyAgain = "Copy search exactly from the current code (get_element shows it).";
  const codeLines = code.split("\n");
  const present = new Set(codeLines.map((line) => line.trim()));
  const searchLines = search.split("\n");
  const missingAt = searchLines.findIndex((line) => line.trim().length > 0 && !present.has(line.trim()));
  if (missingAt === -1) {
    return `Every line of search is in the code, but not together, in this order, with one consistent indentation. ${copyAgain}`;
  }
  const missing = searchLines[missingAt].trim();
  let hint = `Line ${missingAt + 1} of search is not in the code: "${clip(missing)}".`;
  const closest = code.length <= CLOSEST_LINE_MAX_CODE ? closestLine(codeLines, missing) : null;
  if (closest) hint += ` The closest line in the code is line ${closest.line}: "${clip(closest.text)}".`;
  return `${hint} ${copyAgain}`;
}

function closestLine(codeLines: string[], target: string): { line: number; text: string } | null {
  const want = bigrams(target);
  let bestLine = -1;
  let bestScore = 0;
  for (let i = 0; i < codeLines.length; i++) {
    const text = (codeLines[i] ?? "").trim();
    if (text.length === 0) continue;
    const score = dice(want, bigrams(text));
    if (score > bestScore) {
      bestScore = score;
      bestLine = i;
    }
  }
  if (bestLine === -1 || bestScore < CLOSEST_LINE_MIN_SCORE) return null;
  return { line: bestLine + 1, text: (codeLines[bestLine] ?? "").trim() };
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i + 1 < text.length; i++) {
    const pair = text.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen-Dice similarity of two bigram multisets: 1 identical, 0 nothing shared. */
function dice(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  let shared = 0;
  for (const count of a.values()) total += count;
  for (const [pair, count] of b) {
    total += count;
    shared += Math.min(count, a.get(pair) ?? 0);
  }
  return total === 0 ? 0 : (2 * shared) / total;
}

function clip(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
