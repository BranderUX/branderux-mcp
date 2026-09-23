import { Box, ButtonBase, Typography } from "@mui/material";

type Line = { id?: string; sku: string; name: string; price: number; qty: number; imageUrl?: string };

export interface Props {
  title?: string;
  currency?: string;
  lines: Line[];
  shippingFlat?: number;
  freeShippingOver?: number;
  note?: string;
  reserveLabel?: string;
  keepLabel?: string;
  onReserveBasket?: (payload: { itemsLine: string; itemCount: number; subtotal: string; shipping: string; total: string }) => void;
  onKeepShopping?: (payload: { itemCount: number }) => void;
  onRemoveLine?: (payload: { sku: string; name: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const MONO = { fontFamily: "'SF Mono', Menlo, Consolas, monospace", fontFeatureSettings: "'tnum'" };
const ZIGZAG = "linear-gradient(135deg, #FFFFFF 50%, transparent 50%) 0 0 / 12px 12px repeat-x, linear-gradient(225deg, #FFFFFF 50%, transparent 50%) 0 0 / 12px 12px repeat-x";

export default function Component({ title, currency, lines, shippingFlat, freeShippingOver, note, reserveLabel, keepLabel, onReserveBasket, onKeepShopping, onRemoveLine, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const rows = lines || [];
  const itemCount = rows.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = rows.reduce((sum, line) => sum + line.price * line.qty, 0);
  const flat = typeof shippingFlat === "number" ? shippingFlat : 6;
  const threshold = typeof freeShippingOver === "number" ? freeShippingOver : 60;
  const shipping = rows.length === 0 ? 0 : subtotal >= threshold ? 0 : flat;
  const total = subtotal + shipping;
  const itemsLine = rows.map((line) => line.qty + " x " + line.name + " (" + line.sku + ") at " + sign + line.price).join("; ");
  const money = (value: number) => sign + value.toFixed(2);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 2.5, alignItems: "center" }}>
      <Typography variant="h3" component="h2" sx={{ alignSelf: "flex-start", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontSize: { xs: "2.4rem", sm: "3rem" }, color: "text.primary" }}>{title || "Your basket"}</Typography>

      <Box sx={{ width: "100%", maxWidth: 460, position: "relative", filter: "drop-shadow(0 16px 24px rgba(31,27,46,0.18))" }}>
        <Box sx={{ height: 12, background: ZIGZAG, transform: "rotate(180deg)" }} aria-hidden="true" />
        <Box sx={{ bgcolor: "#FFFFFF", px: 3, py: 3, ...MONO, color: "text.primary" }}>
          <Typography sx={{ ...MONO, textAlign: "center", letterSpacing: "0.3em", fontWeight: 700, fontSize: 13 }}>BRANDAZAAR</Typography>
          <Typography sx={{ ...MONO, textAlign: "center", fontSize: 11, color: "text.secondary", mt: 0.5 }}>{"the market square · " + itemCount + (itemCount === 1 ? " item" : " items")}</Typography>
          <Box sx={{ borderTop: "2px dashed rgba(31,27,46,0.25)", my: 2 }} />
          {rows.length === 0 ? (
            <Typography sx={{ ...MONO, fontSize: 13, color: "text.secondary", textAlign: "center" }}>the basket is empty</Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.25 }}>
              {rows.map((line) => (
                <Box
                  key={line.id || line.sku}
                  component="li"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onItemContextMenu?.(event, line);
                  }}
                  sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
                >
                  <Typography sx={{ ...MONO, fontSize: 13, minWidth: 28 }}>{line.qty + "x"}</Typography>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ ...MONO, fontSize: 13, textTransform: "uppercase", lineHeight: 1.3 }}>{line.name}</Typography>
                    <ButtonBase onClick={() => onRemoveLine?.({ sku: line.sku, name: line.name })} aria-label={"Remove " + line.name} sx={{ ...MONO, fontSize: 11, color: "secondary.main", textDecoration: "underline", mt: 0.25 }}>
                      remove
                    </ButtonBase>
                  </Box>
                  <Typography sx={{ ...MONO, fontSize: 13, whiteSpace: "nowrap" }}>{money(line.price * line.qty)}</Typography>
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ borderTop: "2px dashed rgba(31,27,46,0.25)", my: 2 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography sx={{ ...MONO, fontSize: 13 }}>SUBTOTAL</Typography>
            <Typography sx={{ ...MONO, fontSize: 13 }}>{money(subtotal)}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
            <Typography sx={{ ...MONO, fontSize: 13 }}>{shipping === 0 ? "SHIPPING (free over " + sign + threshold + ")" : "SHIPPING"}</Typography>
            <Typography sx={{ ...MONO, fontSize: 13 }}>{shipping === 0 ? "0.00" : money(shipping)}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mt: 1.5, pt: 1.5, borderTop: "2px solid", borderColor: "text.primary" }}>
            <Typography sx={{ ...MONO, fontSize: 14, fontWeight: 700 }}>TOTAL</Typography>
            <Typography sx={{ ...MONO, fontSize: 24, fontWeight: 700 }}>{money(total)}</Typography>
          </Box>
          <Typography sx={{ ...MONO, fontSize: 11, color: "text.secondary", textAlign: "center", mt: 2.5 }}>{note || "held three days at the shop · pay at the counter or by phone"}</Typography>
        </Box>
        <Box sx={{ height: 12, background: ZIGZAG }} aria-hidden="true" />
      </Box>

      <Box sx={{ width: "100%", maxWidth: 460, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25 }}>
        <ButtonBase
          disabled={rows.length === 0}
          onClick={() => onReserveBasket?.({ itemsLine, itemCount, subtotal: sign + subtotal, shipping: shipping === 0 ? "free" : sign + shipping, total: sign + total })}
          sx={{ py: 1.6, borderRadius: 999, bgcolor: rows.length === 0 ? "rgba(31,27,46,0.2)" : "primary.main", color: "#FFFFFF", fontWeight: 800, fontSize: "1rem", "&:hover": { bgcolor: "secondary.main" }, "&:focus-visible": { outline: "3px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}
        >
          {reserveLabel || "Reserve at the shop"}
        </ButtonBase>
        <ButtonBase onClick={() => onKeepShopping?.({ itemCount })} sx={{ py: 1.6, borderRadius: 999, border: "2px solid", borderColor: "primary.main", color: "primary.main", fontWeight: 800, fontSize: "1rem", "&:hover": { bgcolor: "primary.main", color: "#FFFFFF" }, "&:focus-visible": { outline: "3px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
          {keepLabel || "Keep looking"}
        </ButtonBase>
      </Box>
    </Box>
  );
}
