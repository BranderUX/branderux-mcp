import { isPlainObject } from "./policy-bag.js";

/**
 * Explicit mappers from the owner-data endpoints' JSON to what an AI client
 * sees. Every object is rebuilt from the keys it is documented to have, so a
 * field the server adds later (a token, a setting, a delete choice) never
 * reaches a result by accident. Two parts pass through whole because they
 * ARE the record: a record's `fields` (what the visitor typed) and the text
 * of a conversation's turns.
 */

type Json = Record<string, unknown>;
type Scalar = string | number | boolean | null;

const EMPTY: Json = {};

const obj = (value: unknown): Json => (isPlainObject(value) ? value : EMPTY);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean => value === true;
const boolOrNull = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const scalar = (value: unknown): Scalar =>
  typeof value === "string" || typeof value === "boolean" || num(value) !== null
    ? (value as Scalar)
    : null;
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isPlainObject) : []);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The visit-source keys a record may carry, in their fixed order. */
export const SOURCE_KEYS = [
  "channel",
  "page",
  "referrerHost",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
] as const;

/** Every status a record can hold (all kinds), plus `none` for older records in counts. */
const STATUS_KEYS = [
  "new",
  "contacted",
  "won",
  "lost",
  "confirmed",
  "done",
  "cancelled",
  "no_show",
  "handled",
  "none",
] as const;

const KIND_KEYS = ["lead", "booking", "order", "request"] as const;

/** Keys an activity row's `meta` may carry, across every activity kind. */
const META_KEYS = [
  "from",
  "to",
  "channel",
  "via",
  "mode",
  "event",
  "outcome",
  "code",
  "provider",
  "deliveryKind",
  "url",
  "reason",
  "field",
  "crmValue",
] as const;

/** Where the visitor came from, re-picked against the whitelist; null when nothing is left. */
export function mapSource(value: unknown): Json | null {
  const source = obj(value);
  const picked: Json = {};
  for (const key of SOURCE_KEYS) {
    const text = str(source[key]);
    if (text !== null) picked[key] = text;
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

/** The person behind a record, as the server detected it. */
export function mapWho(value: unknown): { name: string | null; phone: string | null; email: string | null } {
  const who = obj(value);
  return { name: str(who.name), phone: str(who.phone), email: str(who.email) };
}

/** A record's CRM block: its state and link, never the delete choices or what the CRM still holds. */
export function mapCrmBlock(value: unknown): Json | null {
  if (!isPlainObject(value)) return null;
  return {
    state: str(value.state),
    provider: str(value.provider),
    providerLabel: str(value.providerLabel),
    url: str(value.url),
    sentAt: str(value.sentAt),
    handedOffAt: str(value.handedOffAt),
  };
}

/** One Inbox row (the row shape of lists, workflow answers and query results). */
export function mapInboxRow(value: unknown): Json {
  const row = obj(value);
  return {
    id: str(row.id),
    entity: str(row.entity),
    entityLabel: str(row.entityLabel),
    kind: str(row.kind),
    status: str(row.status),
    waiting: bool(row.waiting),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
    statusChangedAt: str(row.statusChangedAt),
    firstHandledAt: str(row.firstHandledAt),
    followUpAt: str(row.followUpAt),
    summary: str(row.summary),
    who: mapWho(row.who),
    preview: objects(row.preview).map((item) => ({
      key: str(item.key),
      title: str(item.title),
      value: str(item.value),
    })),
    source: mapSource(row.source),
    hasConversation: bool(row.hasConversation),
    sessionKey: str(row.sessionKey),
    visitorId: str(row.visitorId),
    crm: mapCrmBlock(row.crm),
  };
}

/** A query result row: the Inbox row plus the record's own fields, passed through whole. */
export function mapRecordRow(value: unknown): Json {
  const row = obj(value);
  return { ...mapInboxRow(row), fields: isPlainObject(row.fields) ? row.fields : {} };
}

/** The consent record of one record (asked, given, the wording and the times). */
function mapConsent(value: unknown): Json | null {
  if (!isPlainObject(value)) return null;
  return {
    asked: bool(value.asked),
    given: bool(value.given),
    text: str(value.text),
    at: str(value.at),
    withdrawnAt: str(value.withdrawnAt),
  };
}

/** The `record` part of a record detail: the row, its fields and its consent record. */
export function mapDetailRecord(value: unknown): Json {
  const record = obj(value);
  return { ...mapRecordRow(record), consent: mapConsent(record.consent) };
}

/** One timeline entry, with its `meta` re-picked. */
function mapActivity(value: Json): Json {
  const meta = obj(value.meta);
  const picked: Json = {};
  for (const key of META_KEYS) {
    if (key in meta) picked[key] = scalar(meta[key]);
  }
  if (Array.isArray(meta.changes)) {
    picked.changes = objects(meta.changes).map((change) => ({
      key: str(change.key),
      title: str(change.title),
      from: scalar(change.from),
      to: scalar(change.to),
    }));
  }
  return {
    id: str(value.id),
    kind: str(value.kind),
    actor: str(value.actor),
    clientId: str(value.clientId),
    body: str(value.body),
    meta: picked,
    createdAt: str(value.createdAt),
  };
}

/** The entity a record belongs to, with its field list (keys and titles). */
function mapEntityInfo(value: unknown): Json {
  const entity = obj(value);
  return {
    name: str(entity.name),
    label: str(entity.label),
    kind: str(entity.kind),
    kindInferred: boolOrNull(entity.kindInferred),
    collected: bool(entity.collected),
    statuses: strings(entity.statuses),
    fields: objects(entity.fields).map((field) => ({
      key: str(field.key),
      title: str(field.title),
      type: str(field.type),
      format: str(field.format),
    })),
    hasConsentField: bool(entity.hasConsentField),
  };
}

/** Where the record's conversation stands (still stored, how long transcripts are kept). */
function mapConversationRef(value: unknown): Json | null {
  if (!isPlainObject(value)) return null;
  return {
    sessionKey: str(value.sessionKey),
    available: bool(value.available),
    retentionDays: num(value.retentionDays),
    turnsKeptPerProject: num(value.turnsKeptPerProject),
  };
}

/** The site's name and language, which reply drafts use. */
function mapSite(value: unknown): { name: string | null; language: string | null } {
  const site = obj(value);
  return { name: str(site.name), language: str(site.language) };
}

/** The whole record page: the record, its entity, the timeline, the conversation, the CRM, the site. */
export function mapRecordDetail(value: unknown): {
  record: Json;
  entity: Json;
  activity: Json[];
  conversation: Json | null;
  crm: Json | null;
  site: { name: string | null; language: string | null };
  timezone: string;
} {
  const detail = obj(value);
  return {
    record: mapDetailRecord(detail.record),
    entity: mapEntityInfo(detail.entity),
    activity: objects(detail.activity).map(mapActivity),
    conversation: mapConversationRef(detail.conversation),
    crm: mapCrmBlock(detail.crm),
    site: mapSite(detail.site),
    timezone: str(detail.timezone) ?? "UTC",
  };
}

/** The keys of a record detail's entity fields (the entity's schema properties, in order). */
export function detailFieldKeys(detail: { entity: Json }): string[] {
  return objects(detail.entity.fields)
    .map((field) => str(field.key))
    .filter((key): key is string => key !== null);
}

/** One page of the records query. */
export function mapRecordPage(value: unknown): Json {
  const page = obj(value);
  return {
    records: objects(page.records).map(mapRecordRow),
    nextCursor: str(page.nextCursor),
    total: num(page.total),
    timezone: str(page.timezone) ?? "UTC",
    now: str(page.now) ?? new Date().toISOString(),
    skippedLive: Array.isArray(page.skippedLive) ? strings(page.skippedLive) : null,
  };
}

/** The value key an aggregate metric answers under: `count`, or `<op>:<field>`. */
export function metricKey(metric: { op: string; field?: string }): string {
  return metric.op === "count" ? "count" : `${metric.op}:${metric.field ?? ""}`;
}

/** Only these keys, each a number or null. */
function pickNumbers(value: unknown, keys: readonly string[]): Record<string, number | null> {
  const source = obj(value);
  const picked: Record<string, number | null> = {};
  for (const key of keys) picked[key] = num(source[key]);
  return picked;
}

/**
 * Only these metric keys. The min and max of a date or a time answer ISO text
 * (`YYYY-MM-DD`, or an ISO time), so a `min:`/`max:` value keeps a string as it
 * is; every other value (`unclassified` included) is a number or null.
 */
function pickMetricValues(value: unknown, keys: readonly string[]): Record<string, number | string | null> {
  const source = obj(value);
  const picked: Record<string, number | string | null> = {};
  for (const key of keys) {
    const ordered = key.startsWith("min:") || key.startsWith("max:");
    const raw = source[key];
    picked[key] = ordered && typeof raw === "string" ? raw : num(raw);
  }
  return picked;
}

/**
 * An aggregate answer, re-picked by the request itself: group keys are the
 * fields grouped by, values are the metrics asked for, so nothing else can
 * ride along.
 */
export function mapAggregate(
  value: unknown,
  groupKeys: readonly string[],
  valueKeys: readonly string[],
  totalKeys: readonly string[] = valueKeys
): Json {
  const answer = obj(value);
  return {
    groups: objects(answer.groups).map((group) => {
      const key = obj(group.key);
      const pickedKey: Record<string, Scalar> = {};
      for (const field of groupKeys) pickedKey[field] = scalar(key[field]);
      return { key: pickedKey, values: pickMetricValues(group.values, valueKeys) };
    }),
    totals: pickMetricValues(answer.totals, totalKeys),
    truncated: bool(answer.truncated),
    timezone: str(answer.timezone) ?? "UTC",
  };
}

/** One conversation row of the conversations query. */
function mapConversationRow(value: Json): Json {
  const writes = obj(value.writes);
  return {
    session: str(value.session),
    startedAt: str(value.startedAt),
    lastAt: str(value.lastAt),
    turns: num(value.turns),
    signedIn: bool(value.signedIn),
    visitor: str(value.visitor),
    topic: str(value.topic),
    satisfaction: str(value.satisfaction),
    outcome: str(value.outcome),
    channel: str(value.channel),
    writes: {
      proposed: num(writes.proposed),
      confirmed: num(writes.confirmed),
      declined: num(writes.declined),
      expired: num(writes.expired),
      failed: num(writes.failed),
    },
    unfinished: bool(value.unfinished),
    classified: bool(value.classified),
    pagesOnly: bool(value.pagesOnly),
    firstQuestion: str(value.firstQuestion),
    recordIds: strings(value.recordIds),
  };
}

/** One page of the conversations query. */
export function mapConversationPage(value: unknown): Json {
  const page = obj(value);
  return {
    conversations: objects(page.conversations).map(mapConversationRow),
    nextCursor: str(page.nextCursor),
    total: num(page.total),
    timezone: str(page.timezone) ?? "UTC",
    now: str(page.now) ?? new Date().toISOString(),
  };
}

/** One conversation: the transcript as stored, its classification, its writes and records. */
export function mapConversationDetail(value: unknown, session: string): Json {
  const detail = obj(value);
  const insight = isPlainObject(detail.insight)
    ? {
        satisfaction: str(detail.insight.satisfaction),
        outcome: str(detail.insight.outcome),
        topic: str(detail.insight.topic),
      }
    : null;
  return {
    session: str(detail.session) ?? session,
    turns: objects(detail.turns).map((turn) => ({
      visitor: str(turn.visitor),
      query: str(turn.query),
      answer: str(turn.answer),
      at: str(turn.at),
      session: str(turn.session),
      screens: str(turn.screens),
      actions: str(turn.actions),
      kind: str(turn.kind),
    })),
    insight,
    writes: objects(detail.writes).map((write) => ({
      tool: str(write.tool),
      status: str(write.status),
      createdAt: str(write.createdAt),
      recordId: str(write.recordId),
    })),
    records: objects(detail.records).map((record) => ({
      id: str(record.id),
      entity: str(record.entity),
      createdAt: str(record.createdAt),
      status: str(record.status),
      summary: str(record.summary),
    })),
    channel: str(detail.channel) ?? "web",
  };
}

/** One page of the visitors query. */
export function mapVisitorPage(value: unknown): Json {
  const page = obj(value);
  return {
    visitors: objects(page.visitors).map((visitor) => ({
      id: str(visitor.id),
      email: str(visitor.email),
      name: str(visitor.name),
      status: str(visitor.status),
      google: bool(visitor.google),
      joined: str(visitor.joined),
      lastSeen: str(visitor.lastSeen),
      records: num(visitor.records),
      lastRecordAt: str(visitor.lastRecordAt),
      turns30d: num(visitor.turns30d),
    })),
    nextCursor: str(page.nextCursor),
    total: num(page.total),
    timezone: str(page.timezone) ?? "UTC",
    now: str(page.now) ?? new Date().toISOString(),
  };
}

/** Only the known keys that are present, each a number or null. */
function pickPresentCounts(value: unknown, keys: readonly string[]): Record<string, number | null> {
  const source = obj(value);
  const picked: Record<string, number | null> = {};
  for (const key of keys) {
    if (key in source) picked[key] = num(source[key]);
  }
  return picked;
}

/**
 * The overview. The allowance is a percentage only: nothing else of the
 * account's usage is picked, so no money ever reaches an AI client.
 */
export function mapStats(value: unknown, requestedDays: number): Json {
  const stats = obj(value);
  const records = obj(stats.records);
  const firstResponse = obj(stats.firstResponse);
  const conversations = obj(stats.conversations);
  const unfinished = obj(stats.unfinished);
  return {
    period: {
      from: str(stats.from),
      to: str(stats.to),
      timezone: str(stats.timezone) ?? "UTC",
      days: num(stats.windowDays) ?? requestedDays,
    },
    records: {
      total: num(records.total),
      previousTotal: num(records.previousTotal),
      byKind: pickNumbers(records.byKind, KIND_KEYS),
      byStatus: pickPresentCounts(records.byStatus, STATUS_KEYS),
      bySource: objects(records.bySource).map((row) => ({
        channel: str(row.channel),
        campaign: str(row.campaign),
        count: num(row.count),
      })),
    },
    firstResponse: {
      medianMinutes: num(firstResponse.medianMinutes),
      handled: num(firstResponse.handled),
      waiting: num(firstResponse.waiting),
    },
    conversations: {
      total: num(conversations.total),
      previousTotal: num(conversations.previousTotal),
      classified: num(conversations.classified),
      unclassified: num(conversations.unclassified),
    },
    unfinished: {
      total: num(unfinished.total),
      byKind: pickNumbers(unfinished.byKind, KIND_KEYS),
    },
    topTopics: objects(stats.topTopics).map((row) => ({ topic: str(row.topic), count: num(row.count) })),
    unanswered: objects(stats.unanswered).map((row) => ({
      question: str(row.question),
      session: str(row.session),
      at: str(row.at),
    })),
    allowance: { agentPercent: num(obj(stats.allowance).agentPercent) },
  };
}

/**
 * The CRM sync at a glance: which CRM, its state, the last send, the waiting
 * and problem counts and what goes there. No token, no account id, no
 * settings beyond what goes, and a problem keeps only its cause, count and
 * message (never the record ids or the fix).
 */
export function mapCrmStatus(value: unknown): Json {
  const status = obj(value);
  const connection = isPlainObject(status.connection) ? status.connection : null;
  const counts = obj(connection?.counts);
  const settings = connection && isPlainObject(connection.settings) ? connection.settings : null;
  return {
    connected: connection !== null,
    provider: str(connection?.provider),
    providerLabel: str(connection?.providerLabel),
    status: str(connection?.status),
    accountLabel: str(connection?.accountLabel),
    lastSentAt: str(connection?.lastSentAt),
    waiting: num(counts.waiting) ?? 0,
    needsAttention: num(counts.needsAttention) ?? 0,
    held: num(counts.held) ?? 0,
    problems: objects(connection?.problems)
      .filter((problem) => typeof problem.cause === "string")
      .map((problem) => ({
        cause: problem.cause as string,
        count: num(problem.count) ?? 0,
        message: str(problem.message) ?? "",
      })),
    whatGoes: settings
      ? {
          excludedEntities: strings(settings.excludedEntities),
          includeConversation: bool(settings.includeConversation),
        }
      : null,
  };
}
