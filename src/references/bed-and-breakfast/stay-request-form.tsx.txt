import { useState, useEffect } from "react";
import { Box, ButtonBase, Checkbox, InputBase, Typography } from "@mui/material";

type Kind = { id: string; label: string };

export interface Props {
  title?: string;
  kinds?: Kind[];
  initialKind?: string;
  roomId?: string;
  roomName?: string;
  pricePerNight?: number;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  currency?: string;
  consentLabel?: string;
  note?: string;
  submitLabel?: string;
  initialValues?: { guestName?: string; phone?: string; email?: string; notes?: string };
  onSubmitRequest?: (payload: Record<string, string | number>) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const, fontWeight: 700 };
const INK = "rgba(46,42,37,0.28)";
const DEFAULT_KINDS: Kind[] = [
  { id: "booking", label: "Book a room" },
  { id: "early-checkin", label: "Early check-in" },
  { id: "late-checkout", label: "Late check-out" },
  { id: "dinner-table", label: "A dinner table" },
  { id: "pickup", label: "Station pickup" },
  { id: "other", label: "Something else" },
];
const nightsBetween = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const diff = (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000;
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : 0;
};

export default function Component({ title, kinds, initialKind, roomId, roomName, pricePerNight, checkIn, checkOut, guests, currency, consentLabel, note, submitLabel, initialValues, onSubmitRequest }: Props) {
  const sign = currency || "$";
  const options = kinds && kinds.length > 0 ? kinds : DEFAULT_KINDS;
  const seed = initialValues || {};
  const [kind, setKind] = useState(initialKind || (roomName ? "booking" : "other"));
  const [inDate, setInDate] = useState(checkIn || "");
  const [outDate, setOutDate] = useState(checkOut || "");
  const [count, setCount] = useState(guests || 2);
  const [values, setValues] = useState({ guestName: seed.guestName || "", phone: seed.phone || "", email: seed.email || "", notes: seed.notes || "" });
  const [consent, setConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (initialKind) setKind(initialKind);
  }, [initialKind]);
  useEffect(() => {
    if (checkIn) setInDate(checkIn);
    if (checkOut) setOutDate(checkOut);
    if (guests) setCount(guests);
  }, [checkIn, checkOut, guests]);
  const seedKey = JSON.stringify(initialValues || {});
  useEffect(() => {
    const next = JSON.parse(seedKey) as Record<string, string>;
    setValues((current) => {
      const merged = { ...current };
      (Object.keys(merged) as (keyof typeof merged)[]).forEach((field) => {
        if (next[field]) merged[field] = next[field];
      });
      return merged;
    });
  }, [seedKey]);

  const booking = kind === "booking";
  const nights = nightsBetween(inDate, outDate);
  const estimatedTotal = booking && pricePerNight ? nights * pricePerNight : 0;
  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const missing: string[] = [];
  if (values.guestName.trim().length < 2) missing.push("your name");
  if (values.phone.trim().length < 6) missing.push("a phone number");
  if (booking && nights === 0) missing.push("check-in and check-out dates");
  const ready = missing.length === 0;
  const kindLabel = (options.find((k) => k.id === kind) || options[0]).label;

  const submit = () => {
    setAttempted(true);
    if (!ready) return;
    onSubmitRequest?.({ kind, kindLabel, roomId: booking ? roomId || "" : "", roomName: booking ? roomName || "" : "none", checkIn: inDate || "none", checkOut: outDate || "none", guests: count, estimatedTotal: estimatedTotal ? sign + estimatedTotal : "n/a", guestName: values.guestName.trim(), phone: values.phone.trim(), email: values.email.trim() || "none", notes: values.notes.trim() || "none", marketingConsent: consent ? "yes" : "no" });
  };

  const line = (label: string, id: string, value: string | number, onChange: (value: string) => void, invalid: boolean, type = "text", extra?: Record<string, unknown>) => (
    <Box sx={{ borderBottom: "1px solid", borderColor: attempted && invalid ? "accent.main" : INK, pb: 0.5 }}>
      <Typography component="label" htmlFor={"req-" + id} sx={{ ...CAPS, display: "block", color: attempted && invalid ? "accent.main" : "text.secondary", mb: 0.25 }}>{label}</Typography>
      <InputBase id={"req-" + id} fullWidth type={type} value={value} onChange={(event) => onChange(event.target.value)} inputProps={extra} sx={{ fontSize: "1.1rem", color: "text.primary", "& input, & textarea": { p: 0 } }} />
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 }, maxWidth: 640, mx: "auto", width: "100%" }}>
      <Box sx={{ bgcolor: "#FFFDF8", border: "1px solid", borderColor: INK, p: { xs: 2.5, sm: 3.5 }, boxShadow: "4px 4px 0 rgba(46,42,37,0.12)", display: "flex", flexDirection: "column", gap: 3 }}>
        <Box>
          <Typography sx={{ ...CAPS, color: "accent.main", mb: 1 }}>A note for the host</Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 500, lineHeight: 1.05, fontSize: { xs: "2.2rem", sm: "2.8rem" }, color: "text.primary" }}>{title || "What do you need?"}</Typography>
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} role="group" aria-label="What do you need">
          {options.map((option) => {
            const on = option.id === kind;
            return (
              <ButtonBase key={option.id} onClick={() => setKind(option.id)} aria-pressed={on} sx={{ ...CAPS, px: 1.5, py: 1, border: "1px solid", borderColor: on ? "text.primary" : INK, bgcolor: on ? "text.primary" : "transparent", color: on ? "#FFFDF8" : "text.primary", "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}>
                {option.label}
              </ButtonBase>
            );
          })}
        </Box>

        {booking && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography sx={{ fontSize: "1.3rem", color: "text.primary" }}>{(roomName || "Any room") + (pricePerNight ? ", " + sign + pricePerNight + " a night" : "")}</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
              {line("Check-in", "in", inDate, setInDate, booking && !inDate, "date")}
              {line("Check-out", "out", outDate, setOutDate, booking && nights === 0, "date")}
              <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>{line("Guests", "guests", count, (value) => setCount(Number(value)), false, "number", { min: 1, max: 6, inputMode: "numeric" })}</Box>
            </Box>
            {estimatedTotal > 0 && <Typography sx={{ fontStyle: "italic", color: "text.secondary" }} aria-live="polite">{nights + (nights === 1 ? " night" : " nights") + ", about " + sign + estimatedTotal + " with breakfast. Indicative; Mara confirms."}</Typography>}
          </Box>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          {line("Your name *", "name", values.guestName, (value) => setValues((c) => ({ ...c, guestName: value })), values.guestName.trim().length < 2)}
          {line("Phone *", "phone", values.phone, (value) => setValues((c) => ({ ...c, phone: value })), values.phone.trim().length < 6, "text", { inputMode: "tel" })}
          <Box sx={{ gridColumn: { xs: "auto", sm: "1 / -1" } }}>{line("Email (optional)", "email", values.email, (value) => setValues((c) => ({ ...c, email: value })), false, "text", { inputMode: "email" })}</Box>
        </Box>

        <Box sx={{ borderBottom: "1px solid", borderColor: INK, pb: 0.5 }}>
          <Typography component="label" htmlFor="req-notes" sx={{ ...CAPS, display: "block", color: "text.secondary", mb: 0.25 }}>Anything Mara should know</Typography>
          <InputBase id="req-notes" fullWidth multiline minRows={2} maxRows={4} value={values.notes} onChange={set("notes")} inputProps={{ maxLength: 400 }} sx={{ fontStyle: "italic", fontSize: "1.1rem", color: "text.primary", "& textarea": { p: 0 } }} />
        </Box>

        <Box component="label" sx={{ display: "flex", alignItems: "flex-start", gap: 1, cursor: "pointer" }}>
          <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} size="small" sx={{ p: 0.5, mt: -0.25, color: "secondary.main" }} />
          <Typography sx={{ fontStyle: "italic", fontSize: "0.95rem", color: "text.secondary", lineHeight: 1.5 }}>{consentLabel || "Happy to hear about seasonal offers and events by email or text"}</Typography>
        </Box>

        {note && <Typography sx={{ fontSize: "0.92rem", color: "text.secondary", lineHeight: 1.55 }}>{note}</Typography>}

        <ButtonBase onClick={submit} sx={{ ...CAPS, fontSize: 12, width: "100%", py: 1.9, bgcolor: "primary.main", color: "#FFFDF8", "&:hover": { bgcolor: "accent.main" }, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}>
          {submitLabel || "Send to Mara"}
        </ButtonBase>
        {attempted && !ready && <Typography sx={{ fontStyle: "italic", color: "accent.main" }} aria-live="polite">{"Still missing: " + missing.join(", ")}</Typography>}
      </Box>
    </Box>
  );
}
