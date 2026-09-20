import { Box, ButtonBase, Typography } from "@mui/material";

type Occasion = { id: string; label: string; hint?: string; query: string; imageUrl?: string };
type Slot = { id?: string; _id?: string; date?: string; dayLabel?: string; window?: string; area?: string; price?: number; remaining?: number; available?: boolean; cutoffTime?: string; sortOrder?: number };

export interface Props {
  studioLine?: string;
  question?: string;
  occasions: Occasion[];
  hintText?: string;
  windowsTitle?: string;
  windowsNote?: string;
  windowsQuery?: string;
  currency?: string;
  slots?: Slot[];
  onPickOccasion?: (occasion: { id: string; label: string; query: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" as const, fontWeight: 600 };
const NUM = { fontFeatureSettings: "'tnum'" };
const CARD_W = 232;

export default function Component({ studioLine, question, occasions, hintText, windowsTitle, windowsNote, windowsQuery, currency, slots, onPickOccasion, onItemContextMenu }: Props) {
  const items = occasions || [];
  const sign = currency || "$";
  const today = new Date().toISOString().slice(0, 10);
  const open = (slots || []).filter((slot) => slot.available !== false && (!slot.date || slot.date >= today)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).slice(0, 2);
  const query = windowsQuery || "When can flowers arrive?";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", pt: { xs: 3, sm: 4 }, pb: 3 }}>
      <Box sx={{ px: { xs: 2.5, sm: 4 } }}>
        {studioLine && <Typography sx={{ ...CAPS, color: "secondary.main", mb: 1 }}>{studioLine}</Typography>}
        <Typography variant="h3" component="h2" sx={{ fontWeight: 400, lineHeight: 1.02, letterSpacing: "-0.02em", fontSize: { xs: "2.5rem", sm: "3.6rem" }, maxWidth: 600, color: "text.primary" }}>
          {question || "Who are the flowers for?"}
        </Typography>
        <Typography sx={{ ...CAPS, color: "text.secondary", mt: 2 }}>Swipe, then tap</Typography>
      </Box>

      <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, mt: 2, display: "flex", gap: 1.5, overflowX: "auto", scrollSnapType: "x mandatory", px: { xs: 2.5, sm: 4 }, pb: 1.5, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        {items.map((occasion, index) => (
          <Box key={occasion.id} component="li" sx={{ flexShrink: 0, scrollSnapAlign: "start" }}>
            <ButtonBase
              onClick={() => onPickOccasion?.({ id: occasion.id, label: occasion.label, query: occasion.query })}
              onContextMenu={(event) => {
                event.preventDefault();
                onItemContextMenu?.(event, occasion);
              }}
              aria-label={occasion.label}
              sx={{ position: "relative", width: CARD_W, aspectRatio: "4 / 5", overflow: "hidden", bgcolor: "primary.main", textAlign: "start", alignItems: "flex-end", justifyContent: "flex-start", "&:hover img": { transform: "scale(1.04)" }, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 3 } }}
            >
              {occasion.imageUrl && <Box component="img" src={occasion.imageUrl} alt="" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 500ms" }} />}
              <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,24,18,0) 45%, rgba(20,24,18,0.78) 100%)" }} aria-hidden="true" />
              <Typography sx={{ ...CAPS, ...NUM, position: "absolute", top: 12, insetInlineStart: 14, color: "rgba(255,255,255,0.85)" }}>{String(index + 1).padStart(2, "0")}</Typography>
              <Box sx={{ position: "relative", p: 2 }}>
                <Typography sx={{ fontSize: "1.9rem", lineHeight: 1, letterSpacing: "-0.02em", color: "#FFFFFF" }}>{occasion.label}</Typography>
                {occasion.hint && <Typography sx={{ mt: 0.5, fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>{occasion.hint}</Typography>}
              </Box>
            </ButtonBase>
          </Box>
        ))}
      </Box>

      <Box sx={{ px: { xs: 2.5, sm: 4 }, display: "flex", flexDirection: "column", gap: 2.5, mt: 1 }}>
        {hintText && <Typography sx={{ color: "text.secondary", fontSize: "1rem" }}>{hintText}</Typography>}

        {open.length > 0 && (
          <ButtonBase
            onClick={() => onPickOccasion?.({ id: "windows", label: windowsTitle || "Delivery today", query })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, { id: "windows", query });
            }}
            aria-label={windowsTitle || "Delivery windows still open"}
            sx={{ width: "100%", display: "flex", alignItems: "center", gap: 2, textAlign: "start", borderTop: "1px solid", borderBottom: "1px solid", borderColor: "rgba(63,74,56,0.3)", py: 1.5, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "accent.main", flexShrink: 0 }} aria-hidden="true" />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ ...CAPS, color: "text.secondary" }}>{windowsTitle || "Still open for delivery"}</Typography>
              <Typography sx={{ ...NUM, fontSize: "1rem", color: "text.primary", mt: 0.25 }}>
                {open.map((slot) => (slot.dayLabel || slot.date) + " " + slot.window + (slot.cutoffTime ? " (order by " + slot.cutoffTime + ")" : "")).join(" · ")}
              </Typography>
              {windowsNote && <Typography sx={{ fontSize: "0.85rem", color: "text.secondary", mt: 0.25 }}>{windowsNote}</Typography>}
            </Box>
            <Typography sx={{ fontSize: "1.3rem", color: "text.secondary" }} aria-hidden="true">→</Typography>
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
