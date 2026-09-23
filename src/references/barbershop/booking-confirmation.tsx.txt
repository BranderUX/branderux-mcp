import { Box, ButtonBase, Typography } from "@mui/material";

export interface Props {
  title?: string;
  customerName?: string;
  serviceName: string;
  barberName?: string;
  preferredDate?: string;
  preferredTime?: string;
  estimatedPrice?: number;
  durationMinutes?: number;
  phone?: string;
  currencySymbol?: string;
  line?: string;
  shelfLabel?: string;
  shopLabel?: string;
  onSeeShelf?: (payload: { serviceName: string }) => void;
  onBackToShop?: (payload: { serviceName: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" as const, fontWeight: 600 };
const BRASS = "rgba(201,151,63,0.35)";
const MONO = { fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontFeatureSettings: "'tnum'" };

export default function Component({ title, customerName, serviceName, barberName, preferredDate, preferredTime, estimatedPrice, durationMinutes, phone, currencySymbol, line, shelfLabel, shopLabel, onSeeShelf, onBackToShop, onItemContextMenu }: Props) {
  const sign = currencySymbol || "$";
  const summary = { serviceName, barberName, preferredDate, preferredTime };
  const rows: [string, string][] = [
    ["Service", serviceName],
    ["Barber", barberName || "Any barber"],
    ["Day", preferredDate || ""],
    ["Time", preferredTime || ""],
    ["Price", typeof estimatedPrice === "number" ? sign + estimatedPrice + (durationMinutes ? " · " + durationMinutes + " min" : "") : ""],
    ["We call", phone || ""],
  ].filter((row) => row[1]) as [string, string][];

  return (
    <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 3, sm: 5 }, maxWidth: 640, mx: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ border: "1px solid", borderColor: BRASS, p: { xs: 2.5, sm: 3.5 }, position: "relative", bgcolor: "rgba(255,255,255,0.03)" }}>
        <Box sx={{ position: "absolute", inset: 6, border: "1px solid", borderColor: BRASS, pointerEvents: "none" }} aria-hidden="true" />
        <Box sx={{ display: "inline-block", transform: "rotate(-6deg)", border: "3px solid", borderColor: "primary.main", color: "primary.main", px: 2, py: 0.6, ...CAPS, fontSize: 14, fontWeight: 700, mb: 2 }} aria-hidden="true">Request in</Box>
        <Typography variant="h3" component="h2" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1, fontSize: { xs: "2.2rem", sm: "2.8rem" }, color: "text.primary" }}>{title || (customerName ? "Noted, " + customerName + "." : "Noted.")}</Typography>
        <Typography sx={{ mt: 1.5, fontSize: "1rem", lineHeight: 1.55, color: "text.secondary", fontStyle: "italic" }}>{line || "The shop calls to lock in the exact time. Nothing is confirmed until they do."}</Typography>
        <Box sx={{ mt: 2.5, borderTop: "1px solid", borderColor: BRASS, pt: 1.5 }}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ display: "flex", alignItems: "baseline", gap: 1, py: 0.6 }}>
              <Typography sx={{ ...CAPS, fontSize: 10, color: "primary.main", minWidth: 72 }}>{label}</Typography>
              <Box sx={{ flexGrow: 1, borderBottom: "1px dotted", borderColor: "rgba(232,223,209,0.35)", transform: "translateY(-4px)" }} aria-hidden="true" />
              <Typography sx={{ ...MONO, fontSize: "0.95rem", color: "text.primary", textAlign: "end" }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
        <ButtonBase
          onClick={() => onBackToShop?.({ serviceName })}
          onContextMenu={(event) => {
            event.preventDefault();
            onItemContextMenu?.(event, summary);
          }}
          sx={{ ...CAPS, fontSize: 12, py: 1.8, bgcolor: "primary.main", color: "#131110", "&:hover": { bgcolor: "#E0B45E" }, "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}
        >
          {shopLabel || "Back to the shop"}
        </ButtonBase>
        <ButtonBase
          onClick={() => onSeeShelf?.({ serviceName })}
          onContextMenu={(event) => {
            event.preventDefault();
            onItemContextMenu?.(event, summary);
          }}
          sx={{ ...CAPS, fontSize: 12, py: 1.8, border: "1px solid", borderColor: "primary.main", color: "primary.main", "&:hover": { bgcolor: "rgba(201,151,63,0.12)" }, "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}
        >
          {shelfLabel || "See the shelf"}
        </ButtonBase>
      </Box>
    </Box>
  );
}
