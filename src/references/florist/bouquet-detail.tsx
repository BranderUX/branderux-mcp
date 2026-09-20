import { useState, useEffect } from "react";
import { Box, ButtonBase, InputBase, Typography } from "@mui/material";

type Size = { id: string; label: string; stemCount?: string; priceDelta?: number };

export interface Props {
  id: string;
  name: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  occasion?: string;
  description?: string;
  stems?: string[];
  palette?: string[];
  vaseLife?: string;
  seasonal?: boolean;
  inStock?: boolean;
  sizes?: Size[];
  orderLabel?: string;
  careLabel?: string;
  onStartOrder?: (payload: { id: string; name: string; sizeLabel: string; price: number; cardMessage: string }) => void;
  onAskCare?: (payload: { id: string; name: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" as const, fontWeight: 600 };

export default function Component({ id, name, price, currency, imageUrl, occasion, description, stems, palette, vaseLife, seasonal, inStock, sizes, orderLabel, careLabel, onStartOrder, onAskCare, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const options = sizes && sizes.length > 0 ? sizes : [{ id: "m", label: "Standard", priceDelta: 0 }];
  const standard = options.find((size) => (size.priceDelta || 0) === 0) || options[0];
  const [sizeId, setSizeId] = useState(standard.id);
  const [message, setMessage] = useState("");
  const out = inStock === false;
  useEffect(() => {
    setSizeId(standard.id);
    setMessage("");
  }, [id, standard.id]);
  const chosen = options.find((size) => size.id === sizeId) || standard;
  const total = price + (chosen.priceDelta || 0);
  const bouquet = { id, name, price: total, sizeLabel: chosen.label };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Box sx={{ position: "relative", aspectRatio: { xs: "4 / 5", sm: "16 / 9" }, overflow: "hidden", bgcolor: "primary.main" }}>
        {imageUrl && <Box component="img" src={imageUrl} alt={name} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,24,18,0) 45%, rgba(20,24,18,0.7) 100%)" }} />
        <Box sx={{ position: "absolute", insetBlockEnd: 0, insetInlineStart: 0, insetInlineEnd: 0, p: { xs: 3, sm: 5 }, color: "#FFFFFF", display: "flex", alignItems: "flex-end", gap: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ ...CAPS, color: "rgba(255,255,255,0.8)", mb: 1 }}>{[occasion, seasonal && !out ? "In season" : "", out ? "Not today" : ""].filter(Boolean).join(" · ")}</Typography>
            <Typography variant="h3" component="h2" sx={{ fontStyle: "italic", fontWeight: 500, lineHeight: 1, fontSize: { xs: "2.8rem", sm: "3.6rem" } }}>{name}</Typography>
          </Box>
          <Typography sx={{ fontSize: "1.6rem", fontFeatureSettings: "'tnum'", lineHeight: 1 }} aria-live="polite">{sign + total}</Typography>
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 3, display: "flex", flexDirection: "column", gap: 3 }}>
        {description && (
          <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.4rem" }, lineHeight: 1.45, color: "text.primary", maxWidth: 640 }}>{description}</Typography>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2.5, borderTop: "1px solid", borderBottom: "1px solid", borderColor: "rgba(63,74,56,0.22)", py: 2.5 }}>
          {stems && stems.length > 0 && (
            <Box>
              <Typography sx={{ ...CAPS, color: "secondary.main", mb: 0.75 }}>In the bouquet</Typography>
              <Typography sx={{ fontStyle: "italic", fontSize: "1.05rem", lineHeight: 1.5, color: "text.primary" }}>{stems.join(" · ")}</Typography>
            </Box>
          )}
          <Box>
            <Typography sx={{ ...CAPS, color: "secondary.main", mb: 0.75 }}>Palette and life</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              {palette && palette.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.6 }} aria-hidden="true">
                  {palette.map((colour, index) => (
                    <Box key={index} sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: colour, border: "1px solid rgba(0,0,0,0.12)" }} />
                  ))}
                </Box>
              )}
              {vaseLife && <Typography sx={{ fontStyle: "italic", fontSize: "1.05rem", color: "text.primary" }}>{vaseLife}</Typography>}
            </Box>
          </Box>
        </Box>

        {options.length > 1 && (
          <Box>
            <Typography sx={{ ...CAPS, color: "secondary.main", mb: 1.25 }}>Size</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }} role="group" aria-label="Size">
              {options.map((size) => {
                const on = size.id === chosen.id;
                return (
                  <ButtonBase
                    key={size.id}
                    onClick={() => setSizeId(size.id)}
                    aria-pressed={on}
                    sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.25, p: 1.5, border: "1px solid", borderColor: on ? "text.primary" : "rgba(63,74,56,0.3)", bgcolor: on ? "text.primary" : "transparent", color: on ? "background.default" : "text.primary", textAlign: "start", transition: "background-color 160ms", "&:focus-visible": { outline: "2px solid", outlineColor: "info.main", outlineOffset: 2 } }}
                  >
                    <Typography sx={{ fontSize: "1.2rem", lineHeight: 1.1, color: "inherit" }}>{size.label}</Typography>
                    <Typography sx={{ fontSize: "0.85rem", color: "inherit", opacity: 0.8, fontStyle: "italic" }}>{[size.stemCount, sign + (price + (size.priceDelta || 0))].filter(Boolean).join(" · ")}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        )}

        <Box>
          <Typography sx={{ ...CAPS, color: "secondary.main", mb: 1.25 }}>The card</Typography>
          <Box sx={{ bgcolor: "#FFFDF9", border: "1px solid rgba(63,74,56,0.25)", p: 2, backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, rgba(63,74,56,0.18) 31px, rgba(63,74,56,0.18) 32px)", backgroundPosition: "0 18px" }}>
            <InputBase
              multiline
              minRows={2}
              maxRows={4}
              fullWidth
              placeholder="We write it by hand. Leave it empty for no card."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              inputProps={{ maxLength: 220, "aria-label": "Card message" }}
              sx={{ fontStyle: "italic", fontSize: "1.15rem", lineHeight: "32px", color: "text.primary" }}
            />
            <Typography sx={{ ...CAPS, color: "text.secondary", mt: 1, fontWeight: 500 }}>{message.length + " / 220"}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <ButtonBase
            disabled={out}
            onClick={() => onStartOrder?.({ id, name, sizeLabel: chosen.label, price: total, cardMessage: message.trim() || "no card" })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, bouquet);
            }}
            sx={{ ...CAPS, fontSize: 12, width: "100%", py: 2, bgcolor: out ? "rgba(63,74,56,0.25)" : "primary.main", color: "#FFFFFF", "&:hover": { bgcolor: out ? "rgba(63,74,56,0.25)" : "accent.main" }, "&:focus-visible": { outline: "2px solid", outlineColor: "info.main", outlineOffset: 2 } }}
          >
            {out ? "Not available today" : (orderLabel || "Choose a delivery window") + " · " + sign + total}
          </ButtonBase>
          <ButtonBase
            onClick={() => onAskCare?.({ id, name })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, bouquet);
            }}
            sx={{ alignSelf: "flex-start", fontStyle: "italic", fontSize: "1.05rem", color: "text.secondary", textDecoration: "underline", textUnderlineOffset: 4, "&:focus-visible": { outline: "2px solid", outlineColor: "info.main", outlineOffset: 2 } }}
          >
            {careLabel || "How do I keep it fresh?"}
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}
