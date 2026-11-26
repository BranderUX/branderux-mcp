# Element skeletons: navigation, intake form, receipt

Three complete elements that almost every hosted build needs: a navigation element (the home, or a
detail sheet), the intake form, and the receipt shown after a submission. Each one passes
`create_element`'s pre-flight as it stands and follows `custom-elements-contract`, including its
"Traps that only show on a phone".

They are SKELETONS, not a house style. Keep the wiring, the guards and the comments that explain
them; replace the layout, the colours, the copy and the options with the business's own: its
visitor's moment, its measured UI, its words, in the site's language. `<Business>` and the sample
services are placeholders. The colours are constants for the business's measured values (the theme
carries the brand as `primary` and `info` too; constants let an element match the site exactly).

Every piece of copy is a constant inside the element, never a prop: in flexible mode the agent
fills an optional text prop it has nothing for with a neutral sample value (the prop's own name in
words), whatever its description says. The props are only the data the agent or a binding really
fills: rows, an active key, the form's initial values, the saved record.

## 1. Navigation (a home or a detail sheet)

Every tap sends a query that a fixed screen answers. The same element serves the home (ALL rows,
no active key) and each detail screen (ALL rows, `activeKey` set to that screen's row), so no
binding ever filters down to a single row that might not exist.

```tsx
// Navigation: a home or a detail sheet. Every tap calls onAsk({ id, label, query }) and the
// clickQueryTemplate is "{query}", so the query sent is the row's own query. It must equal a fixed
// screen's matchQuery character for character, or the live agent answers it (right only for the
// form's chip and for free questions).
// Right-click: onItemContextMenu(event, item) on the same element as the click, preventDefault first.
// Never give a DATA field an on* name: tools read an optional onX field as an action.
import { Box, ButtonBase, Typography } from "@mui/material";
import { ChevronRight } from "lucide-react";

type Row = { key: string; title: string; line?: string; query: string; sortOrder?: number };
type Post = { title?: string; date?: string; link?: string };
type Chip = { id: string; label: string; query: string };

export interface Props {
  rows: Row[];
  latest?: Post[];
  activeKey?: string;
  onAsk?: (chip: Chip) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

// The business's measured values.
const PRIMARY = "#1F2A44";
const ACCENT = "#B5523B";
const INK = "#1B1F27";
const MUTED = "#5E6573";
const SURFACE = "#FFFFFF";
const RULE = "rgba(31,42,68,0.14)";
// fontFamily inherit: ButtonBase renders a native button, which ignores the brand font otherwise.
const FOCUS = { fontFamily: "inherit", "&:focus-visible": { outline: "3px solid", outlineColor: ACCENT, outlineOffset: 2 } };
// Chevrons point the way the text reads: mirrored on right-to-left sites.
const FLIP = { '[dir="rtl"] &': { transform: "scaleX(-1)" } };
// Visually hidden text. Sizes are strings: sx reads 1 as 100%, which would push the page sideways.
const HIDDEN = { position: "absolute", width: "1px", height: "1px", m: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

// The element's own copy, in the site's language. Constants, never props.
const EYEBROW = "<Business>";
const QUESTION = "What brings you here today?";
const HINT = "Or tell me in a sentence what you need.";
const OPENS = " (opens in a new tab)";
// The way in: the form's chip. It stays LIVE (no fixed screen) so the agent opens the form prefilled.
const CONTACT: Chip = { id: "contact", label: "Talk to us", query: "I want to talk to someone" };
// Month names in the site's language: an English "30 Sep 2026" built from parts reads "Sep 2026 30"
// on a right-to-left site.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Store and CMS APIs send titles with HTML entities (&amp;, &#038;): decode to text, never inject HTML.
function clean(text?: string) {
  if (!text) return "";
  const doc = new DOMParser().parseFromString(text, "text/html");
  return (doc.documentElement.textContent || "").replace(/\s+/g, " ").trim();
}

// ISO dates parsed by hand: new Date("2026-09-30") is midnight UTC and shows the day before west of it.
function when(iso?: string) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map((part) => Number(part));
  return y && m && d ? d + " " + MONTHS[m - 1] + " " + y : "";
}

export default function Component({ rows, latest, activeKey, onAsk, onItemContextMenu }: Props) {
  // Rows from the data tools carry _id, not id: key on your own field, and sort here too.
  const list = (rows || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const post = (latest || [])[0];
  const context = (event: React.MouseEvent, chip: Chip) => {
    event.preventDefault();
    onItemContextMenu?.(event, chip);
  };

  return (
    <Box sx={{ px: { xs: 0.5, sm: 2 }, py: { xs: 1, sm: 2 }, maxWidth: 720, width: "100%", marginInline: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* 1. The question the visitor arrives with, on the brand primary as a surface. */}
      <Box sx={{ bgcolor: PRIMARY, color: "#FFFFFF", p: { xs: 2.5, sm: 3.5 }, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>{EYEBROW}</Typography>
        <Typography component="h3" sx={{ fontSize: { xs: "1.8rem", sm: "2.3rem" }, fontWeight: 300, lineHeight: 1.15 }}>{QUESTION}</Typography>
      </Box>

      {/* 2. The answers. Navigation looks like navigation: rows with a forward chevron, never checkboxes. */}
      <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, bgcolor: SURFACE, border: "1px solid " + RULE }}>
        {list.map((row) => {
          const chip: Chip = { id: row.key, label: row.title, query: row.query };
          const active = row.key === activeKey;
          return (
            <Box component="li" key={row.key} sx={{ borderTop: "1px solid " + RULE, "&:first-of-type": { borderTop: "none" } }}>
              <ButtonBase
                aria-current={active ? "true" : undefined}
                onClick={() => onAsk?.(chip)}
                onContextMenu={(event) => context(event, chip)}
                sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.6, textAlign: "start", borderInlineStart: "3px solid " + (active ? ACCENT : "transparent"), ...FOCUS }}
              >
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.35 }}>
                  <Typography component="span" sx={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, color: INK }}>{row.title}</Typography>
                  {row.line ? <Typography component="span" sx={{ fontSize: 13.5, lineHeight: 1.45, color: MUTED }}>{row.line}</Typography> : null}
                </Box>
                <Box component="span" aria-hidden="true" sx={{ color: MUTED, display: "flex", flexShrink: 0, ...FLIP }}>
                  <ChevronRight size={18} />
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {/* 3. ONE useful extra the business really keeps (here the newest post, from a live source). */}
      {post ? (
        <Box sx={{ bgcolor: SURFACE, border: "1px solid " + RULE, p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>{when(post.date)}</Typography>
          {post.link ? (
            <Box component="a" href={post.link} target="_blank" rel="noopener" sx={{ position: "relative", fontSize: 15.5, fontWeight: 700, lineHeight: 1.35, color: INK, overflowWrap: "anywhere", ...FOCUS }}>
              {clean(post.title)}
              <Box component="span" sx={HIDDEN}>{OPENS}</Box>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.35, color: INK }}>{clean(post.title)}</Typography>
          )}
        </Box>
      ) : null}

      {/* 4. The way in (the live form chip) and the hint that free text works. */}
      <ButtonBase onClick={() => onAsk?.(CONTACT)} onContextMenu={(event) => context(event, CONTACT)} sx={{ width: "100%", py: 1.7, bgcolor: ACCENT, color: "#FFFFFF", fontSize: 16, fontWeight: 700, ...FOCUS }}>
        {CONTACT.label}
      </ButtonBase>
      <Typography sx={{ textAlign: "center", fontSize: 13.5, color: MUTED, px: 2 }}>{HINT}</Typography>
    </Box>
  );
}
```

The `create_element` fields:

```json
{
  "propsSchema": {
    "type": "object",
    "properties": {
      "rows": {
        "type": "array",
        "description": "ALL rows of query_<entity>, sorted by sortOrder. Bound on the home and on every fixed screen; never filtered down to one row.",
        "items": {
          "type": "object",
          "properties": {
            "key": { "type": "string", "description": "Stable key of the row" },
            "title": { "type": "string", "description": "What the row is, in the site's words" },
            "line": { "type": "string", "description": "One line on what it covers" },
            "query": { "type": "string", "description": "The exact query a tap sends: a fixed screen's matchQuery, character for character" },
            "sortOrder": { "type": "number", "description": "Position in the list" }
          },
          "required": ["key", "title", "query"]
        }
      },
      "latest": {
        "type": "array",
        "description": "Optional: the newest post from the live posts source (an optional binding, limit 1)",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "date": { "type": "string", "description": "ISO date" },
            "link": { "type": "string", "description": "https address of the post" }
          }
        }
      },
      "activeKey": { "type": "string", "description": "On a detail screen, the key of the row the screen is about. A value that matches no row marks nothing." }
    },
    "required": ["rows"]
  },
  "defaultProps": {
    "rows": [
      { "key": "first", "title": "First service", "line": "One line on what it covers.", "query": "Tell me about the first service", "sortOrder": 1 },
      { "key": "second", "title": "Second service", "line": "Another line.", "query": "Tell me about the second service", "sortOrder": 2 }
    ],
    "latest": [{ "title": "A post title &amp; more", "date": "2026-09-30T10:00:00", "link": "https://example.com/post" }]
  },
  "structurePrompt": "The answers to the question a visitor arrives with, one row per answer, each opening its own screen. rows carries ALL rows of query_<entity>; on a detail screen activeKey is that screen's row key. Use it alone on a screen.",
  "clickQueryTemplate": "{query}",
  "interactionPropName": "onAsk"
}
```

What to adapt: the layout comes from the visitor's moment (a list of situations, a route, a price
board; the rows and chevron are the navigation affordance, keep one), the copy and colours from the
site. Store each row's `query` in the entity so the element sends exactly what its fixed screen
matches, and give the home and each detail screen the same `rows` binding (all rows) with the
screen's own `activeKey` in its static `data`. Drop `latest` when the business keeps nothing live.

## 2. Intake form (contact, quote, booking, demo, consultation)

A form is never a fixed screen: its chip stays live, so the agent opens it with `initialValues`
prefilled from the conversation. ONE callback carries every field, and the template names every
field.

```tsx
// Intake form. ONE callback, onSubmit(payload), carrying EVERY field. Its clickQueryTemplate names
// every field as a {token}: a field the template omits is dropped before the agent ever sees it.
// The persona keys its write flow on the template's prefix ("Request to <Business>:").
// Submit runs from the button's onClick, the pattern that works on every surface.
import { useEffect, useState } from "react";
import { Box, ButtonBase, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { Send } from "lucide-react";

type Values = { fullName?: string; email?: string; phone?: string; service?: string; preferredDate?: string; message?: string };
type Payload = { fullName: string; email: string; phone: string; service: string; preferredDate: string; message: string; marketingConsent: string };
type Field = keyof Values;

export interface Props {
  initialValues?: Values;
  onSubmit?: (payload: Payload) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

// The business's measured values.
const PRIMARY = "#1F2A44";
const ACCENT = "#B5523B";
const INK = "#1B1F27";
const MUTED = "#5E6573";
const RULE = "rgba(31,42,68,0.18)";
const FOCUS = { fontFamily: "inherit", "&:focus-visible": { outline: "3px solid", outlineColor: ACCENT, outlineOffset: 2 } };
const FLIP = { '[dir="rtl"] &': { transform: "scaleX(-1)" } };
const FIELD = { "& .MuiOutlinedInput-root": { bgcolor: "#FFFFFF" } };

// The element's own copy, in the site's language. Constants, never props.
const TITLE = "Talk to <Business>";
const INTRO = "Tell the team who you are and what you need. They reply by email.";
const NEED = "What do you need?";
const SUBMIT = "Send";
const WAITING = "Waiting for your confirmation";
const CONFIRM_HINT = "Confirm the details in the chat and they reach the team.";
// Where the details go, in the business's words (the agent also says it before it asks for them).
const NOTICE = "What you send is stored in <Business>'s request records; the team reads it and replies.";
// The options the business's own form offers, VERBATIM and in its order. The same list goes into the
// routing skill: the agent cannot read it from this code, and leaves an option it cannot match unselected.
const SERVICES = ["Service one", "Service two", "Service three"];
// The business's own consent line, VERBATIM. The entity's marketingConsent description carries the same words.
const CONSENT = "I agree to receive news and offers from <Business> by email.";
const FIELDS: Field[] = ["fullName", "email", "phone", "service", "preferredDate", "message"];

// The agent may send an option in another case: match it tolerantly, never invent one.
function option(value?: string) {
  const wanted = (value || "").trim().toLowerCase();
  return SERVICES.find((service) => service.toLowerCase() === wanted) || "";
}

export default function Component({ initialValues, onSubmit, onItemContextMenu }: Props) {
  const [values, setValues] = useState<Values>({});
  const [consent, setConsent] = useState(false); // never pre-ticked, never prefilled
  const [invalid, setInvalid] = useState<Field | "">("");
  const [sent, setSent] = useState(false);

  // Prefill from what the visitor already said, and again when the agent sends new values.
  // What the visitor typed always wins.
  useEffect(() => {
    const initial: Values = { ...(initialValues || {}), service: option(initialValues?.service) };
    setValues((current) => {
      const next: Values = {};
      for (const field of FIELDS) next[field] = current[field] || initial[field] || "";
      return next;
    });
  }, [initialValues]);

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const value = (field: Field) => (values[field] || "").trim();
  const payload = (): Payload => ({
    fullName: value("fullName"),
    email: value("email"),
    phone: value("phone"),
    service: value("service"),
    preferredDate: value("preferredDate"),
    message: value("message"),
    marketingConsent: consent ? "yes" : "no",
  });
  const submit = () => {
    const next = payload();
    if (!next.fullName) { setInvalid("fullName"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) { setInvalid("email"); return; }
    setInvalid("");
    setSent(true);
    onSubmit?.(next);
  };

  return (
    <Box sx={{ px: { xs: 0.5, sm: 2 }, py: { xs: 1, sm: 2 }, maxWidth: 680, width: "100%", marginInline: "auto" }}>
      <Box sx={{ bgcolor: "#FFFFFF", color: INK, border: "1px solid " + RULE }}>
        <Box sx={{ bgcolor: PRIMARY, color: "#FFFFFF", px: { xs: 2.25, sm: 3.25 }, py: 2.25, display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography component="h3" sx={{ fontSize: { xs: "1.7rem", sm: "2.1rem" }, fontWeight: 300, lineHeight: 1.15 }}>{TITLE}</Typography>
          <Typography sx={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(255,255,255,0.82)" }}>{INTRO}</Typography>
        </Box>
        <Box sx={{ p: { xs: 2.25, sm: 3.25 }, display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
            <TextField label="Full name" required value={values.fullName || ""} onChange={set("fullName")} error={invalid === "fullName"} helperText={invalid === "fullName" ? "Your name is missing." : " "} size="small" fullWidth autoComplete="name" sx={FIELD} />
            {/* dir ltr keeps emails and phone numbers readable inside a right-to-left form */}
            <TextField label="Email address" required value={values.email || ""} onChange={set("email")} error={invalid === "email"} helperText={invalid === "email" ? "The team replies by email, so it needs a valid address." : " "} size="small" fullWidth autoComplete="email" slotProps={{ htmlInput: { dir: "ltr", inputMode: "email" } }} sx={FIELD} />
            <TextField label="Phone number" value={values.phone || ""} onChange={set("phone")} helperText=" " size="small" fullWidth autoComplete="tel" slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} sx={FIELD} />
            <TextField label="Preferred date" type="date" value={values.preferredDate || ""} onChange={set("preferredDate")} helperText=" " size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} sx={FIELD} />
          </Box>

          <Box role="group" aria-label={NEED} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700 }}>{NEED}</Typography>
            {/* Pills, because the visitor really picks one here: a real input may look like one. */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {SERVICES.map((service) => {
                const picked = values.service === service;
                return (
                  <ButtonBase
                    key={service}
                    aria-pressed={picked}
                    onClick={() => setValues((current) => ({ ...current, service: picked ? "" : service }))}
                    sx={{ px: 2, py: 0.9, border: "1.5px solid " + (picked ? PRIMARY : RULE), bgcolor: picked ? PRIMARY : "#FFFFFF", color: picked ? "#FFFFFF" : INK, fontSize: 14, fontWeight: 700, ...FOCUS }}
                  >
                    {service}
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>

          <TextField label="Message" value={values.message || ""} onChange={set("message")} size="small" fullWidth multiline minRows={3} sx={FIELD} />

          <FormControlLabel
            control={<Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} size="small" />}
            label={<Typography sx={{ fontSize: 13.5, color: INK }}>{CONSENT}</Typography>}
            sx={{ alignItems: "flex-start", marginInline: 0, gap: 0.5, "& .MuiCheckbox-root": { pt: 0.25 } }}
          />

          <ButtonBase
            onClick={submit}
            disabled={sent}
            onContextMenu={(event) => { event.preventDefault(); onItemContextMenu?.(event, payload()); }}
            sx={{ width: "100%", py: 1.6, bgcolor: ACCENT, color: "#FFFFFF", fontSize: 16, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1, "&.Mui-disabled": { opacity: 0.55 }, ...FOCUS }}
          >
            <Box component="span" aria-hidden="true" sx={{ display: "flex", ...FLIP }}>
              <Send size={16} />
            </Box>
            {sent ? WAITING : SUBMIT}
          </ButtonBase>
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>{sent ? CONFIRM_HINT : NOTICE}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
```

The `create_element` fields:

```json
{
  "propsSchema": {
    "type": "object",
    "properties": {
      "initialValues": {
        "type": "object",
        "description": "Prefill ONLY what the visitor already said anywhere in this conversation. A field nobody gave is left out, never invented and never an empty string.",
        "properties": {
          "fullName": { "type": "string", "description": "The visitor's full name" },
          "email": { "type": "string", "description": "Email address" },
          "phone": { "type": "string", "description": "Phone number" },
          "service": { "type": "string", "description": "One of the form's options, verbatim (the routing skill lists them)" },
          "preferredDate": { "type": "string", "description": "ISO date, YYYY-MM-DD" },
          "message": { "type": "string", "description": "What they need, in their words" }
        }
      }
    }
  },
  "defaultProps": {
    "initialValues": { "fullName": "Sam Rivera", "service": "service two" }
  },
  "structurePrompt": "The way a visitor sends <Business> a request. Open it ALONE when a visitor wants to get in touch, prefilled through initialValues with everything they already said in this conversation; prefill ONLY what the visitor said, never invent a value.",
  "clickQueryTemplate": "Request to <Business>: name: {fullName}; email: {email}; phone: {phone}; service: {service}; preferred date: {preferredDate}; message: {message}; newsletter: {marketingConsent}",
  "interactionPropName": "onSubmit"
}
```

What to adapt: the fields, their labels, which are required, the options and the consent line all
come from the business's own contact form, in its words and order; the intake entity carries the
same fields (each property with a `title` in the site's language) and its `marketingConsent`
description is the consent line verbatim. The template keeps one `{token}` per field and its fixed
prefix, which the persona's submission steps name. The chip that opens the form stays live.

## 3. Receipt (only after the record exists)

Shown only after the write returned the created row, never before it and never after a cancel. The
persona fills it from the saved row, and its chips lead back into fixed screens.

```tsx
// Receipt: shown ONLY after create_<entity> returned the created row (never before it, never after a
// cancel). The persona fills it: reference = the first 6 characters of the row's id in capitals,
// receivedLabel = today's date in the site's language, the saved fields verbatim.
// Wiring: chips back into fixed screens; clickQueryTemplate "{query}", interactionPropName "onAsk".
import { Box, ButtonBase, Typography } from "@mui/material";
import { ChevronRight } from "lucide-react";

type Chip = { id: string; label: string; query: string };

export interface Props {
  reference: string;
  receivedLabel?: string;
  fullName?: string;
  email?: string;
  service?: string;
  onAsk?: (chip: Chip) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

// The business's measured values.
const PRIMARY = "#1F2A44";
const ACCENT = "#B5523B";
const INK = "#1B1F27";
const MUTED = "#5E6573";
const SURFACE = "#FFFFFF";
const RULE = "rgba(31,42,68,0.16)";
const FOCUS = { fontFamily: "inherit", "&:focus-visible": { outline: "3px solid", outlineColor: ACCENT, outlineOffset: 2 } };
const FLIP = { '[dir="rtl"] &': { transform: "scaleX(-1)" } };

// The element's own copy and its way back, in the site's language. Constants, never props.
// Each chip's query is a fixed screen's matchQuery (the home's is the first custom page's query).
const HEADING = "Request received";
const NEXT_STEP = "The team reads your request and replies by email.";
const LABELS = { reference: "Reference", from: "From", about: "About", replyTo: "Reply to" };
const CHIPS: Chip[] = [{ id: "home", label: "Back to the start", query: "Show me the home page" }];

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "92px 1fr", sm: "130px 1fr" }, gap: 1, py: 1, borderTop: "1px solid " + RULE }}>
      <Typography component="dt" sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, pt: 0.25 }}>{label}</Typography>
      {/* overflowWrap anywhere: a long email must not push the screen sideways on a phone */}
      <Typography component="dd" sx={{ m: 0, fontSize: 14.5, lineHeight: 1.45, color: INK, overflowWrap: "anywhere", unicodeBidi: "plaintext" }}>{value}</Typography>
    </Box>
  );
}

export default function Component({ reference, receivedLabel, fullName, email, service, onAsk, onItemContextMenu }: Props) {
  return (
    <Box sx={{ px: { xs: 0.5, sm: 2 }, py: { xs: 1, sm: 2 }, maxWidth: 640, width: "100%", marginInline: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ bgcolor: SURFACE, border: "1px solid " + RULE, borderTop: "6px solid " + PRIMARY, p: { xs: 2.25, sm: 3.25 }, display: "flex", flexDirection: "column", gap: 1.75 }}>
        {receivedLabel ? <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>{receivedLabel}</Typography> : null}
        <Typography component="h3" sx={{ fontSize: { xs: "1.8rem", sm: "2.2rem" }, fontWeight: 300, lineHeight: 1.1, color: PRIMARY }}>{HEADING}</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>{LABELS.reference}</Typography>
          {/* unicodeBidi plaintext keeps a Latin reference readable on a right-to-left site;
              never direction: "ltr", which the runtime's right-to-left pass flips */}
          <Typography component="span" sx={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.14em", color: INK, unicodeBidi: "plaintext" }}>{reference}</Typography>
        </Box>
        <Box component="dl" sx={{ m: 0 }}>
          <Row label={LABELS.from} value={fullName} />
          <Row label={LABELS.about} value={service} />
          <Row label={LABELS.replyTo} value={email} />
        </Box>
        <Typography sx={{ fontSize: 14, lineHeight: 1.55, color: INK }}>{NEXT_STEP}</Typography>
      </Box>
      {CHIPS.map((chip) => (
        <ButtonBase
          key={chip.id}
          onClick={() => onAsk?.(chip)}
          onContextMenu={(event) => { event.preventDefault(); onItemContextMenu?.(event, chip); }}
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1.4, bgcolor: SURFACE, border: "1px solid " + RULE, color: PRIMARY, fontSize: 15, fontWeight: 700, textAlign: "start", ...FOCUS }}
        >
          {chip.label}
          <Box component="span" aria-hidden="true" sx={{ display: "flex", ...FLIP }}>
            <ChevronRight size={18} />
          </Box>
        </ButtonBase>
      ))}
    </Box>
  );
}
```

The `create_element` fields:

```json
{
  "propsSchema": {
    "type": "object",
    "properties": {
      "reference": { "type": "string", "description": "The first 6 characters of the created row's id, in capitals" },
      "receivedLabel": { "type": "string", "description": "Today's date in the site's language, such as 27 Sep 2026" },
      "fullName": { "type": "string", "description": "The saved name" },
      "email": { "type": "string", "description": "The saved email address" },
      "service": { "type": "string", "description": "The saved option, verbatim" }
    },
    "required": ["reference"]
  },
  "defaultProps": {
    "reference": "3B9F1A",
    "receivedLabel": "3 Oct 2026",
    "fullName": "Sam Rivera",
    "email": "sam.rivera.with.a.long.address@example.com",
    "service": "Service two"
  },
  "structurePrompt": "The confirmation of a request. Show it ONLY after create_<entity> returned the created row in this turn, never before it and never after a cancel, filled from the saved row.",
  "clickQueryTemplate": "{query}",
  "interactionPropName": "onAsk"
}
```

What to adapt: the saved fields shown (the ones the visitor would want to check), the honest next
step in the business's words ("the shop calls to confirm", never "confirmed" unless it is), and the
chips back into the fixed screens worth visiting next. Only `reference` is required: a missing
optional field hides its row instead of hiding the receipt. The persona wording that makes the
receipt appear at the right moment is in `hosted-agent-contract`, "Persona and skills that work".
