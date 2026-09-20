import { useState, useEffect } from "react";
import { Box, ButtonBase, InputBase, Typography } from "@mui/material";

export interface Props {
  id: string;
  name: string;
  pricePerNight: number;
  currency?: string;
  imageUrl?: string;
  sleeps?: number;
  bedType?: string;
  view?: string;
  floor?: string;
  sizeSqm?: number;
  amenities?: string[];
  description?: string;
  available?: boolean;
  availabilityNote?: string;
  requestLabel?: string;
  askLabel?: string;
  onRequestRoom?: (payload: { id: string; name: string; checkIn: string; checkOut: string; guests: number; nights: number; pricePerNight: number }) => void;
  onAskRoom?: (payload: { id: string; name: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const, fontWeight: 700 };
const INK = "rgba(46,42,37,0.28)";
const nightsBetween = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const diff = (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000;
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : 0;
};

export default function Component({ id, name, pricePerNight, currency, imageUrl, sleeps, bedType, view, floor, sizeSqm, amenities, description, available, availabilityNote, requestLabel, askLabel, onRequestRoom, onAskRoom, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [attempted, setAttempted] = useState(false);
  const closed = available === false;
  const max = sleeps || 2;
  useEffect(() => {
    setCheckIn("");
    setCheckOut("");
    setGuests(Math.min(2, max));
    setAttempted(false);
  }, [id, max]);
  const nights = nightsBetween(checkIn, checkOut);
  const total = nights * pricePerNight;
  const ready = nights > 0 && guests >= 1 && guests <= max;
  const room = { id, name, pricePerNight };
  const ledger: [string, string][] = [
    ["Sleeps", sleeps ? String(sleeps) : ""],
    ["Bed", bedType || ""],
    ["Looks at", view || ""],
    ["Floor", floor || ""],
    ["Size", sizeSqm ? sizeSqm + " m²" : ""],
  ].filter((row) => row[1]) as [string, string][];

  const submit = () => {
    setAttempted(true);
    if (!ready) return;
    onRequestRoom?.({ id, name, checkIn, checkOut, guests, nights, pricePerNight });
  };

  const field = (label: string, value: string | number, onChange: (value: string) => void, type: string, extra?: Record<string, unknown>) => (
    <Box sx={{ borderBottom: "1px solid", borderColor: INK, pb: 0.5 }}>
      <Typography component="label" htmlFor={"room-" + label} sx={{ ...CAPS, display: "block", color: "text.secondary", mb: 0.25 }}>{label}</Typography>
      <InputBase id={"room-" + label} fullWidth type={type} value={value} onChange={(event) => onChange(event.target.value)} inputProps={extra} sx={{ fontSize: "1.1rem", color: "text.primary", "& input": { p: 0 } }} />
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 3, maxWidth: 720, mx: "auto", width: "100%" }}>
      <Box sx={{ p: 0.75, bgcolor: "#FFFDF8", border: "1px solid", borderColor: INK, boxShadow: "4px 4px 0 rgba(46,42,37,0.12)" }}>
        <Box sx={{ aspectRatio: "4 / 3", overflow: "hidden", bgcolor: "rgba(46,42,37,0.08)" }}>
          {imageUrl && <Box component="img" src={imageUrl} alt={name} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: closed ? "grayscale(0.8)" : "none" }} />}
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 500, lineHeight: 1.05, fontSize: { xs: "2.4rem", sm: "3rem" }, color: "text.primary", flexGrow: 1 }}>{name}</Typography>
          <Box sx={{ textAlign: "end", flexShrink: 0 }}>
            <Typography sx={{ fontSize: "1.6rem", lineHeight: 1, color: "text.primary", fontFeatureSettings: "'tnum'" }}>{sign + pricePerNight}</Typography>
            <Typography sx={{ ...CAPS, fontSize: 9, color: "text.secondary" }}>a night, with breakfast</Typography>
          </Box>
        </Box>
        {availabilityNote && <Typography sx={{ mt: 1, fontStyle: "italic", fontSize: "1rem", color: closed ? "text.secondary" : "accent.main" }}>{availabilityNote}</Typography>}
      </Box>

      {description && <Typography sx={{ fontStyle: "italic", fontSize: { xs: "1.2rem", sm: "1.35rem" }, lineHeight: 1.5, color: "text.primary" }}>{description}</Typography>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 3 }}>
        <Box>
          {ledger.map(([label, value]) => (
            <Box key={label} sx={{ display: "flex", alignItems: "baseline", gap: 1, py: 0.6, borderBottom: "1px dotted", borderColor: INK }}>
              <Typography sx={{ ...CAPS, color: "text.secondary", minWidth: 72 }}>{label}</Typography>
              <Typography sx={{ fontSize: "1.05rem", color: "text.primary" }}>{value}</Typography>
            </Box>
          ))}
        </Box>
        {amenities && amenities.length > 0 && (
          <Box>
            <Typography sx={{ ...CAPS, color: "text.secondary", mb: 0.75 }}>In the room</Typography>
            <Typography sx={{ fontStyle: "italic", fontSize: "1.05rem", lineHeight: 1.6, color: "text.primary" }}>{amenities.join(", ")}</Typography>
          </Box>
        )}
      </Box>

      {!closed && (
        <Box sx={{ bgcolor: "#FFFDF8", border: "1px solid", borderColor: INK, p: 2.5, display: "flex", flexDirection: "column", gap: 2, boxShadow: "4px 4px 0 rgba(46,42,37,0.12)" }}>
          <Typography sx={{ ...CAPS, color: "accent.main" }}>Reservation slip</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
            {field("Check-in", checkIn, setCheckIn, "date")}
            {field("Check-out", checkOut, setCheckOut, "date")}
            <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>{field("Guests (up to " + max + ")", guests, (value) => setGuests(Number(value)), "number", { min: 1, max, inputMode: "numeric" })}</Box>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }} aria-live="polite">
            <Typography sx={{ fontStyle: "italic", color: "text.secondary" }}>{nights > 0 ? nights + (nights === 1 ? " night" : " nights") + " × " + sign + pricePerNight : "Pick your dates to see the total"}</Typography>
            {nights > 0 && <Typography sx={{ fontSize: "1.5rem", lineHeight: 1, color: "text.primary", fontFeatureSettings: "'tnum'" }}>{sign + total}</Typography>}
          </Box>
          <ButtonBase
            onClick={submit}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, room);
            }}
            sx={{ ...CAPS, fontSize: 12, width: "100%", py: 1.9, bgcolor: "primary.main", color: "#FFFDF8", "&:hover": { bgcolor: "accent.main" }, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}
          >
            {requestLabel || "Request this room"}
          </ButtonBase>
          {attempted && !ready && <Typography sx={{ fontStyle: "italic", color: "accent.main" }}>Check-out must be after check-in, and guests within the room's limit.</Typography>}
          <Typography sx={{ fontStyle: "italic", fontSize: "0.92rem", color: "text.secondary" }}>The total is indicative. Mara confirms the dates by phone or email; you pay at the house.</Typography>
        </Box>
      )}
      {closed && <Typography sx={{ fontStyle: "italic", color: "text.secondary" }}>This room cannot be requested right now. Ask the host about it, or look at the other rooms.</Typography>}

      <ButtonBase
        onClick={() => onAskRoom?.({ id, name })}
        onContextMenu={(event) => {
          event.preventDefault();
          onItemContextMenu?.(event, room);
        }}
        sx={{ alignSelf: "flex-start", fontStyle: "italic", fontSize: "1.05rem", color: "text.secondary", textDecoration: "underline", textUnderlineOffset: 4, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}
      >
        {askLabel || "Ask the host about this room"}
      </ButtonBase>
    </Box>
  );
}
