import { Box, ButtonBase, Typography } from "@mui/material";

type Slot = { id?: string; _id?: string; dayLabel: string; window: string; area?: string; price?: number; available?: boolean; remaining?: number; cutoffTime?: string; sortOrder?: number };

export interface Props {
  title?: string;
  note?: string;
  currency?: string;
  slots: Slot[];
  onSelectSlot?: (slot: { id: string; dayLabel: string; window: string; area: string; price: number }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" as const, fontWeight: 600 };
const keyOf = (slot: Slot): string => slot.id || slot._id || slot.dayLabel + slot.window + (slot.area || "");

export default function Component({ title, note, currency, slots, onSelectSlot, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const rows = (slots || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const days: { label: string; items: Slot[] }[] = [];
  rows.forEach((slot) => {
    const day = days.find((entry) => entry.label === slot.dayLabel);
    if (day) day.items.push(slot);
    else days.push({ label: slot.dayLabel, items: [slot] });
  });

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h3" component="h2" sx={{ fontStyle: "italic", fontWeight: 500, lineHeight: 1.05, fontSize: { xs: "2.4rem", sm: "3rem" }, color: "text.primary" }}>{title || "When should it arrive?"}</Typography>
        {note && <Typography sx={{ mt: 1, color: "text.secondary", fontSize: "1.05rem", maxWidth: 520 }}>{note}</Typography>}
      </Box>

      {days.length === 0 && <Typography sx={{ color: "text.secondary", fontStyle: "italic" }}>No delivery windows are open right now.</Typography>}

      {days.map((day) => (
        <Box key={day.label}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, borderBottom: "1px solid", borderColor: "text.primary", pb: 1 }}>
            <Typography component="h3" sx={{ fontSize: "1.7rem", lineHeight: 1, color: "text.primary" }}>{day.label}</Typography>
            <Typography sx={{ ...CAPS, color: "secondary.main" }}>{day.items.filter((slot) => slot.available !== false).length + " open"}</Typography>
          </Box>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {day.items.map((slot) => {
              const key = keyOf(slot);
              const off = slot.available === false;
              const payload = { id: key, dayLabel: slot.dayLabel, window: slot.window, area: slot.area || "", price: typeof slot.price === "number" ? slot.price : 0 };
              return (
                <Box key={key} component="li" sx={{ borderBottom: "1px solid", borderColor: "rgba(63,74,56,0.22)" }}>
                  <ButtonBase
                    disabled={off}
                    onClick={() => onSelectSlot?.(payload)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onItemContextMenu?.(event, { ...slot, id: key });
                    }}
                    sx={{ width: "100%", display: "flex", alignItems: "baseline", gap: 2, py: 1.75, textAlign: "start", color: off ? "text.disabled" : "text.primary", "&:hover .slot-time, &:focus-visible .slot-time": { color: off ? "text.disabled" : "accent.main" }, "&:focus-visible": { outline: "2px solid", outlineColor: "info.main", outlineOffset: -2 } }}
                  >
                    <Typography className="slot-time" sx={{ fontSize: "1.5rem", lineHeight: 1, fontFeatureSettings: "'tnum'", minWidth: 128, textDecoration: off ? "line-through" : "none", transition: "color 160ms" }}>{slot.window}</Typography>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ ...CAPS, color: off ? "text.disabled" : "secondary.main" }}>{[slot.area, typeof slot.price === "number" ? sign + slot.price : ""].filter(Boolean).join(" · ")}</Typography>
                      <Typography sx={{ fontStyle: "italic", fontSize: "0.95rem", color: off ? "text.disabled" : "text.secondary", mt: 0.25 }}>
                        {off ? "Sold out" : [typeof slot.remaining === "number" ? slot.remaining + " left" : "", slot.cutoffTime ? "order by " + slot.cutoffTime : ""].filter(Boolean).join(", ")}
                      </Typography>
                    </Box>
                    {!off && <Typography sx={{ fontSize: "1.4rem", lineHeight: 1, color: "text.secondary" }} aria-hidden="true">→</Typography>}
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
