import { useState, useEffect } from "react";
import { Box, ButtonBase, InputBase, Typography } from "@mui/material";

type Line = { name: string; quantity: number; price?: number };

export interface Props {
  title?: string;
  intro?: string;
  submitLabel?: string;
  currency?: string;
  initialValues?: { tableNumber?: string; guests?: number; notes?: string; items?: Line[] | string };
  onSubmitOrder?: (payload: { tableNumber: string; guests: number; items: string; notes: string; total: number }) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" as const, fontWeight: 600 };
const MONO = { fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontFeatureSettings: "'tnum'" };
const SANS = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const PAPER = "#FFFFFF";
const INK = "#2A2220";
const CREAM = "#FFF8EE";
const DASH = "1px dashed rgba(42,34,32,0.35)";

const parseLines = (items?: Line[] | string): Line[] => {
  if (!items) return [];
  if (Array.isArray(items)) return items.map((line) => ({ name: line.name, quantity: Math.max(1, Number(line.quantity) || 1), price: typeof line.price === "number" ? line.price : undefined }));
  return items.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    return match ? { name: match[2].trim(), quantity: Number(match[1]) } : { name: part, quantity: 1 };
  });
};

export default function Component({ title, intro, submitLabel, currency, initialValues, onSubmitOrder }: Props) {
  const sign = currency || "$";
  const seed = initialValues || {};
  const [table, setTable] = useState(seed.tableNumber || "");
  const [guests, setGuests] = useState(seed.guests || 2);
  const [notes, setNotes] = useState(seed.notes || "");
  const [lines, setLines] = useState<Line[]>(parseLines(seed.items));
  const [attempted, setAttempted] = useState(false);
  const seedKey = JSON.stringify(seed);
  useEffect(() => {
    const next = JSON.parse(seedKey) as Props["initialValues"];
    if (next?.tableNumber) setTable(next.tableNumber);
    if (next?.guests) setGuests(next.guests);
    if (next?.notes) setNotes(next.notes);
    const parsed = parseLines(next?.items);
    if (parsed.length > 0) setLines(parsed);
  }, [seedKey]);

  const bump = (index: number, delta: number) => setLines((current) => current.map((line, i) => (i === index ? { ...line, quantity: line.quantity + delta } : line)).filter((line) => line.quantity > 0));
  const total = lines.reduce((sum, line) => sum + (line.price || 0) * line.quantity, 0);
  const priced = lines.every((line) => typeof line.price === "number");
  const ready = table.trim().length > 0 && lines.length > 0;
  const submit = () => {
    setAttempted(true);
    if (!ready) return;
    onSubmitOrder?.({ tableNumber: table.trim(), guests, items: lines.map((line) => line.quantity + " x " + line.name).join(", "), notes: notes.trim() || "none", total });
  };
  const roundButton = (label: string, glyph: string, onClick: () => void) => (
    <ButtonBase onClick={onClick} aria-label={label} sx={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid", borderColor: INK, color: INK, fontSize: "1.2rem", fontFamily: SANS, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>{glyph}</ButtonBase>
  );

  return (
    <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 4 }, maxWidth: 560, mx: "auto", width: "100%" }}>
      <Box sx={{ bgcolor: PAPER, color: INK, px: { xs: 2.5, sm: 3.5 }, py: 3, borderRadius: 0.5, boxShadow: "0 14px 34px rgba(60,40,30,0.18)", position: "relative", "&::after": { content: '""', position: "absolute", insetInlineStart: 0, insetInlineEnd: 0, bottom: -10, height: 10, background: "linear-gradient(135deg, transparent 50%, " + PAPER + " 50%) 0 0 / 14px 10px, linear-gradient(45deg, " + PAPER + " 50%, transparent 50%) 0 0 / 14px 10px" } }}>
        <Typography sx={{ ...CAPS, color: INK, textAlign: "center" }}>{title || "Kitchen ticket"}</Typography>
        {intro && <Typography sx={{ fontFamily: SANS, fontSize: "0.88rem", color: "rgba(42,34,32,0.7)", textAlign: "center", mt: 0.75, lineHeight: 1.45 }}>{intro}</Typography>}

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 2.5, pt: 2, borderTop: DASH }}>
          <Box>
            <Typography component="label" htmlFor="ord-table" sx={{ ...CAPS, fontSize: 10, color: attempted && !table.trim() ? "primary.main" : "rgba(42,34,32,0.6)", display: "block" }}>Table</Typography>
            <InputBase id="ord-table" value={table} onChange={(event) => setTable(event.target.value)} placeholder="on the sign" inputProps={{ inputMode: "numeric", maxLength: 6 }} sx={{ ...MONO, fontSize: "2.2rem", fontWeight: 700, color: INK, width: "100%", "& input": { p: 0 }, "& input::placeholder": { fontSize: "1rem", fontWeight: 400, opacity: 0.5 } }} />
          </Box>
          <Box>
            <Typography sx={{ ...CAPS, fontSize: 10, color: "rgba(42,34,32,0.6)" }}>Guests</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }} role="group" aria-label="Guests">
              {roundButton("One fewer guest", "−", () => setGuests((current) => Math.max(1, current - 1)))}
              <Typography sx={{ ...MONO, fontSize: "1.6rem", fontWeight: 700, minWidth: 28, textAlign: "center" }} aria-live="polite">{guests}</Typography>
              {roundButton("One more guest", "+", () => setGuests((current) => Math.min(20, current + 1)))}
            </Box>
          </Box>
        </Box>

        <Box sx={{ mt: 2, pt: 1.5, borderTop: DASH }}>
          <Typography sx={{ ...CAPS, fontSize: 10, color: "rgba(42,34,32,0.6)", mb: 0.5 }}>Order</Typography>
          {lines.length === 0 && <Typography sx={{ fontFamily: SANS, fontSize: "0.9rem", color: attempted ? "primary.main" : "rgba(42,34,32,0.6)", fontStyle: "italic" }}>Nothing on the ticket yet. Pick from the menu or tell me what you want.</Typography>}
          {lines.map((line, index) => (
            <Box key={line.name + index} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75 }}>
              <Typography sx={{ ...MONO, fontSize: "1rem", minWidth: 32 }}>{line.quantity + "×"}</Typography>
              <Typography sx={{ ...MONO, fontSize: "0.98rem", flexGrow: 1, minWidth: 0 }}>{line.name}</Typography>
              {typeof line.price === "number" && <Typography sx={{ ...MONO, fontSize: "0.95rem" }}>{sign + line.price * line.quantity}</Typography>}
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {roundButton("One fewer " + line.name, "−", () => bump(index, -1))}
                {roundButton("One more " + line.name, "+", () => bump(index, 1))}
              </Box>
            </Box>
          ))}
          {lines.length > 0 && priced && (
            <Box sx={{ display: "flex", justifyContent: "space-between", pt: 1, mt: 0.5, borderTop: DASH }}>
              <Typography sx={{ ...MONO, fontWeight: 700 }}>TOTAL</Typography>
              <Typography sx={{ ...MONO, fontWeight: 700 }}>{sign + total}</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 2, pt: 1.5, borderTop: DASH }}>
          <Typography component="label" htmlFor="ord-notes" sx={{ ...CAPS, fontSize: 10, color: "rgba(42,34,32,0.6)", display: "block" }}>For the kitchen</Typography>
          <InputBase id="ord-notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Allergies, no onion, sauce on the side..." inputProps={{ maxLength: 300 }} sx={{ ...MONO, fontSize: "0.95rem", width: "100%", color: INK, "& textarea": { p: 0 } }} />
        </Box>
      </Box>

      <ButtonBase onClick={submit} sx={{ mt: 3, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, py: 1.9, borderRadius: 2, bgcolor: "primary.main", color: CREAM, "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
        <Typography sx={{ ...CAPS, fontSize: 12, color: "inherit" }}>{submitLabel || "Send to the kitchen"}</Typography>
        {priced && lines.length > 0 && <Typography sx={{ ...MONO, fontWeight: 700, color: "inherit" }}>{sign + total}</Typography>}
      </ButtonBase>
      {attempted && !ready && <Typography sx={{ mt: 1, fontFamily: SANS, fontSize: "0.9rem", color: "primary.main" }} aria-live="polite">{!table.trim() ? "Add your table number, it is on the sign." : "Add at least one dish."}</Typography>}
    </Box>
  );
}
