import { Box, ButtonBase, Typography } from "@mui/material";

type Need = { id: string; label: string; hint?: string; query: string; imageUrl?: string; price?: number; minutes?: number };
type Hours = { day: string; opens?: string; closes?: string; closed?: boolean; note?: string; dayOrder?: number };
type Barber = { name: string; title?: string; daysAvailable?: string; imageUrl?: string; specialties?: string[] };

export interface Props {
  shopLine?: string;
  question?: string;
  walkInLabel?: string;
  walkInNote?: string;
  walkInQuery?: string;
  bookLabel?: string;
  bookNote?: string;
  bookQuery?: string;
  barbersTitle?: string;
  needsTitle?: string;
  needs: Need[];
  hours?: Hours[];
  barbers?: Barber[];
  hintText?: string;
  onPickNeed?: (need: { id: string; label: string; query: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" as const, fontWeight: 600 };
const BRASS = "rgba(201,151,63,0.35)";
const MONO = { fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontFeatureSettings: "'tnum'" };
const SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toMinutes = (hhmm?: string): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const worksToday = (days: string | undefined, today: number): boolean => {
  if (!days) return false;
  const text = days.toLowerCase();
  const range = text.match(/([a-z]{3})[a-z]*\s*[-–]\s*([a-z]{3})/);
  if (range) {
    const from = SHORT.indexOf(range[1]);
    const to = SHORT.indexOf(range[2]);
    if (from >= 0 && to >= 0) return from <= to ? today >= from && today <= to : today >= from || today <= to;
  }
  return text.includes(SHORT[today]);
};

export default function Component({ shopLine, question, walkInLabel, walkInNote, walkInQuery, bookLabel, bookNote, bookQuery, barbersTitle, needsTitle, needs, hours, barbers, hintText, onPickNeed, onItemContextMenu }: Props) {
  const now = new Date();
  const todayIndex = now.getDay();
  const todayRow = (hours || []).find((row) => row.day.toLowerCase().startsWith(SHORT[todayIndex]));
  const opens = toMinutes(todayRow?.opens);
  const closes = toMinutes(todayRow?.closes);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const closedToday = !todayRow || todayRow.closed === true || opens === null || closes === null;
  const openNow = !closedToday && minutesNow >= (opens as number) && minutesNow < (closes as number);
  const status = closedToday ? DAYS[todayIndex] + " · closed" : openNow ? "Open now · until " + todayRow?.closes : "Today " + todayRow?.opens + " to " + todayRow?.closes;
  const inToday = (barbers || []).filter((barber) => worksToday(barber.daysAvailable, todayIndex));
  const pick = (id: string, label: string, query: string) => onPickNeed?.({ id, label, query });
  const menu = (event: React.MouseEvent, item: unknown) => {
    event.preventDefault();
    onItemContextMenu?.(event, item);
  };
  const focus = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } };

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: openNow ? "primary.main" : "text.disabled", boxShadow: openNow ? "0 0 10px rgba(201,151,63,0.9)" : "none" }} aria-hidden="true" />
        <Typography sx={{ ...CAPS, color: "primary.main" }}>{shopLine || "Barbrander"}</Typography>
        <Typography sx={{ ...CAPS, color: "text.secondary", ml: "auto" }}>{status}</Typography>
      </Box>

      <Typography variant="h3" component="h2" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1, fontSize: { xs: "2.4rem", sm: "3.2rem" }, color: "text.primary", mt: -1 }}>
        {question || "Walk in or book?"}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
        <ButtonBase onClick={() => pick("walkin", walkInLabel || "Walk in", walkInQuery || "How long is the wait right now")} onContextMenu={(event) => menu(event, { id: "walkin" })} sx={{ ...focus, display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "start", gap: 1, p: 2, minHeight: 150, border: "1px solid", borderColor: BRASS, bgcolor: "rgba(255,255,255,0.03)", position: "relative" }}>
          <Box sx={{ position: "absolute", inset: 5, border: "1px solid", borderColor: BRASS, pointerEvents: "none" }} aria-hidden="true" />
          <Typography sx={{ ...CAPS, color: "text.secondary" }}>Now</Typography>
          <Typography sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "1.6rem", lineHeight: 1, color: "text.primary" }}>{walkInLabel || "Walk in"}</Typography>
          <Typography sx={{ fontSize: "0.85rem", color: "text.secondary", lineHeight: 1.4, mt: "auto", fontStyle: "italic" }}>{walkInNote || "Twenty to thirty minutes at peak"}</Typography>
        </ButtonBase>
        <ButtonBase onClick={() => pick("book", bookLabel || "Book a chair", bookQuery || "I want to book an appointment")} onContextMenu={(event) => menu(event, { id: "book" })} sx={{ ...focus, display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "start", gap: 1, p: 2, minHeight: 150, bgcolor: "primary.main", color: "#131110", "&:hover": { bgcolor: "#E0B45E" } }}>
          <Typography sx={{ ...CAPS, color: "rgba(19,17,16,0.7)" }}>Later</Typography>
          <Typography sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "1.6rem", lineHeight: 1, color: "inherit" }}>{bookLabel || "Book a chair"}</Typography>
          <Typography sx={{ fontSize: "0.85rem", color: "rgba(19,17,16,0.75)", lineHeight: 1.4, mt: "auto", fontStyle: "italic" }}>{bookNote || "Pick a day, we call to confirm"}</Typography>
        </ButtonBase>
      </Box>

      {inToday.length > 0 && (
        <Box>
          <Typography sx={{ ...CAPS, color: "text.secondary", mb: 1.25 }}>{barbersTitle || "In today, tap to book with"}</Typography>
          <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 0.5, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
            {inToday.map((barber) => (
              <ButtonBase key={barber.name} onClick={() => pick("barber", barber.name, "I'd like to book with " + barber.name + ". What do they specialise in and what should I book?")} onContextMenu={(event) => menu(event, barber)} aria-label={"Book with " + barber.name} sx={{ ...focus, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, flexShrink: 0, width: 84 }}>
                <Box sx={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: "2px solid", borderColor: "primary.main", bgcolor: "rgba(201,151,63,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
                  {barber.imageUrl ? <Box component="img" src={barber.imageUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.35)" }} /> : <Typography sx={{ fontWeight: 700, color: "primary.main" }}>{barber.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</Typography>}
                </Box>
                <Typography sx={{ fontSize: "0.9rem", fontWeight: 600, color: "text.primary", lineHeight: 1.1 }}>{barber.name.split(" ")[0]}</Typography>
                {barber.specialties && barber.specialties[0] && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", textAlign: "center", lineHeight: 1.2 }}>{barber.specialties[0]}</Typography>}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      )}

      <Box>
        <Typography sx={{ ...CAPS, color: "text.secondary", mb: 1.25 }}>{needsTitle || "What do you need?"}</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {(needs || []).map((need) => (
            <ButtonBase key={need.id} onClick={() => pick(need.id, need.label, need.query)} onContextMenu={(event) => menu(event, need)} sx={{ ...focus, display: "flex", alignItems: "baseline", gap: 1, px: 1.5, py: 1, border: "1px solid", borderColor: BRASS, "&:hover": { borderColor: "primary.main" } }}>
              <Typography sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.95rem", color: "text.primary" }}>{need.label}</Typography>
              {(typeof need.price === "number" || need.hint) && (
                <Typography sx={{ ...MONO, fontSize: "0.75rem", color: "primary.main" }}>{typeof need.price === "number" ? "from $" + need.price : need.hint}</Typography>
              )}
            </ButtonBase>
          ))}
        </Box>
      </Box>

      {hintText && <Typography sx={{ fontSize: "0.95rem", color: "text.secondary", fontStyle: "italic" }}>{hintText}</Typography>}
    </Box>
  );
}
