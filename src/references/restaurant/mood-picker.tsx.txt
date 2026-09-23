import { Box, ButtonBase, Typography } from "@mui/material";

type Mood = { id: string; label: string; hint?: string; query: string; imageUrl?: string };

export interface Props {
  houseLine?: string;
  question?: string;
  moods: Mood[];
  hintText?: string;
  onPickMood?: (mood: { id: string; label: string; query: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" as const, fontWeight: 600 };
const SANS = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export default function Component({ houseLine, question, moods, hintText, onPickMood, onItemContextMenu }: Props) {
  const items = moods || [];
  return (
    <Box sx={{ px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Box>
        <Typography sx={{ ...CAPS, color: "primary.main" }}>{houseLine || "Tonight's board"}</Typography>
        <Typography variant="h3" component="h2" sx={{ mt: 1, fontStyle: "italic", fontWeight: 400, lineHeight: 1.05, fontSize: { xs: "2.4rem", sm: "3.2rem" }, color: "text.primary" }}>
          {question || "What do you feel like?"}
        </Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1.25 }}>
        {items.map((mood) => (
          <ButtonBase
            key={mood.id}
            onClick={() => onPickMood?.({ id: mood.id, label: mood.label, query: mood.query })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, mood);
            }}
            aria-label={mood.label}
            sx={{ position: "relative", aspectRatio: "1 / 1.1", overflow: "hidden", borderRadius: 2, bgcolor: "rgba(0,0,0,0.06)", textAlign: "start", alignItems: "flex-end", justifyContent: "flex-start", boxShadow: "0 8px 20px rgba(60,40,30,0.12)", "&:hover img": { transform: "scale(1.04)" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
          >
            {mood.imageUrl && <Box component="img" src={mood.imageUrl} alt="" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 400ms" }} />}
            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(40,20,16,0.9) 0%, rgba(40,20,16,0.3) 55%, rgba(40,20,16,0) 100%)" }} aria-hidden="true" />
            <Box sx={{ position: "relative", p: 1.5 }}>
              <Typography sx={{ fontStyle: "italic", fontWeight: 400, fontSize: { xs: "1.35rem", sm: "1.55rem" }, lineHeight: 1.05, color: "#FFF8EE" }}>{mood.label}</Typography>
              {mood.hint && <Typography sx={{ fontFamily: SANS, fontSize: "0.78rem", color: "rgba(255,248,238,0.8)", mt: 0.4, lineHeight: 1.3 }}>{mood.hint}</Typography>}
            </Box>
          </ButtonBase>
        ))}
      </Box>
      {hintText && <Typography sx={{ fontFamily: SANS, fontSize: "0.92rem", color: "text.secondary" }}>{hintText}</Typography>}
    </Box>
  );
}
