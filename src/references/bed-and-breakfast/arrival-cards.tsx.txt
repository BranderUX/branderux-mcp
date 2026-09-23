import { Box, ButtonBase, Typography } from "@mui/material";

type Card = { id: string; label: string; hint?: string; query: string; imageUrl?: string };
type Line = { label: string; value: string };

export interface Props {
  houseLine?: string;
  hostName?: string;
  question?: string;
  todayTitle?: string;
  todayLines?: Line[];
  hostNote?: string;
  perkTitle?: string;
  perkText?: string;
  perkCode?: string;
  cards: Card[];
  hintText?: string;
  onPickCard?: (card: { id: string; label: string; query: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" as const, fontWeight: 700 };
const INK = "rgba(46,42,37,0.28)";
const PAPER = "#FFFDF8";

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export default function Component({ houseLine, hostName, question, todayTitle, todayLines, hostNote, perkTitle, perkText, perkCode, cards, hintText, onPickCard, onItemContextMenu }: Props) {
  const items = cards || [];
  const lines = todayLines || [];
  const hello = hostName ? `${greeting()}, ${hostName} here.` : `${greeting()}.`;
  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, pt: { xs: 3, sm: 4 }, pb: 3, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ textAlign: "center" }}>
        {houseLine && <Typography sx={{ ...CAPS, color: "accent.main", mb: 1.5 }}>{houseLine}</Typography>}
        <Typography sx={{ fontStyle: "italic", fontSize: "1.15rem", color: "text.secondary" }}>{hello}</Typography>
        <Typography variant="h3" component="h2" sx={{ fontWeight: 400, lineHeight: 1.05, fontSize: { xs: "2.1rem", sm: "2.8rem" }, color: "text.primary", mt: 0.5 }}>{question || "What can I do for you?"}</Typography>
        <Box sx={{ width: 48, height: 1, bgcolor: "accent.main", mx: "auto", mt: 2 }} aria-hidden="true" />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
        {items.map((card) => (
          <ButtonBase
            key={card.id}
            onClick={() => onPickCard?.({ id: card.id, label: card.label, query: card.query })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, card);
            }}
            aria-label={card.label}
            sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1, p: 2, pt: 2.5, bgcolor: PAPER, border: "1px solid", borderColor: INK, boxShadow: "3px 3px 0 rgba(46,42,37,0.1)", "&:hover": { borderColor: "accent.main" }, "&:focus-visible": { outline: "2px solid", outlineColor: "accent.main", outlineOffset: 2 } }}
          >
            <Box sx={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", border: "2px solid", borderColor: "accent.main", p: "3px", bgcolor: PAPER }} aria-hidden="true">
              {card.imageUrl && <Box component="img" src={card.imageUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block", filter: "sepia(0.25)" }} />}
            </Box>
            <Typography sx={{ fontSize: "1.1rem", lineHeight: 1.15, color: "text.primary" }}>{card.label}</Typography>
            {card.hint && <Typography sx={{ fontStyle: "italic", fontSize: "0.8rem", color: "text.secondary", lineHeight: 1.3 }}>{card.hint}</Typography>}
          </ButtonBase>
        ))}
      </Box>

      {hintText && <Typography sx={{ fontStyle: "italic", color: "text.secondary", fontSize: "0.98rem", textAlign: "center", mt: -1 }}>{hintText}</Typography>}

      {(lines.length > 0 || hostNote) && (
        <Box sx={{ position: "relative", bgcolor: PAPER, border: "1px solid", borderColor: INK, boxShadow: "4px 4px 0 rgba(46,42,37,0.12)", p: { xs: 2, sm: 2.5 }, pt: 2.5, mt: 1 }}>
          <Box sx={{ position: "absolute", top: -9, left: "50%", width: 18, height: 18, borderRadius: "50%", bgcolor: "accent.main", boxShadow: "0 2px 3px rgba(0,0,0,0.3)", transform: "translateX(-50%)" }} aria-hidden="true" />
          <Typography sx={{ ...CAPS, color: "accent.main", mb: 1 }}>{todayTitle || "Today at the house"}</Typography>
          <Box component="dl" sx={{ m: 0 }}>
            {lines.map((line) => (
              <Box key={line.label} sx={{ display: "flex", gap: 1.5, alignItems: "baseline", py: 0.5, borderBottom: "1px dotted", borderColor: INK }}>
                <Typography component="dt" sx={{ ...CAPS, fontSize: 10, color: "text.secondary", minWidth: 88 }}>{line.label}</Typography>
                <Typography component="dd" sx={{ m: 0, fontSize: "1rem", color: "text.primary" }}>{line.value}</Typography>
              </Box>
            ))}
          </Box>
          {hostNote && <Typography sx={{ mt: 1.25, fontStyle: "italic", fontSize: "0.98rem", lineHeight: 1.5, color: "text.primary" }}>{hostNote}</Typography>}
        </Box>
      )}

      {perkText && (
        <Box sx={{ display: "flex", alignItems: "stretch", border: "1px dashed", borderColor: "accent.main", bgcolor: "rgba(184,134,43,0.08)" }}>
          <Box sx={{ px: 2, py: 1.75, flexGrow: 1, minWidth: 0 }}>
            <Typography sx={{ ...CAPS, color: "accent.main" }}>{perkTitle || "A guest perk"}</Typography>
            <Typography sx={{ mt: 0.5, fontSize: "1rem", lineHeight: 1.45, color: "text.primary" }}>{perkText}</Typography>
          </Box>
          {perkCode && (
            <Box sx={{ borderInlineStart: "1px dashed", borderColor: "accent.main", px: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Typography sx={{ ...CAPS, fontSize: 9, color: "text.secondary" }}>Show this</Typography>
              <Typography sx={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontWeight: 700, fontSize: "1.05rem", color: "text.primary", letterSpacing: "0.06em" }}>{perkCode}</Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
