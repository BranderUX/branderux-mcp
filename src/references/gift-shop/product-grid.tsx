import { useState, useEffect } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { Gift } from "lucide-react";

type Product = { id?: string; _id?: string; sku: string; name: string; price: number; compareAtPrice?: number; category?: string; forWho?: string[]; budgetTier?: string; imageUrl?: string; inStock?: boolean; stockNote?: string; giftWrap?: boolean; sortOrder?: number };

export interface Props {
  title?: string;
  subtitle?: string;
  currency?: string;
  whoOptions?: { id: string; label: string }[];
  activeWho?: string;
  budgetOptions?: { id: string; label: string }[];
  activeBudget?: string;
  products: Product[];
  onSelectProduct?: (product: { id: string; sku: string; name: string; price: number }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const TINTS: Record<string, string> = { home: "#F6E7D3", kitchen: "#DDEFE3", kids: "#DCE9F7", stationery: "#E8E0F3", wellness: "#FBE3D6", jewellery: "#F7DCE3", tech: "#E1E5EC" };
const keyOf = (product: Product): string => product.id || product._id || product.sku;

export default function Component({ title, subtitle, currency, whoOptions, activeWho, budgetOptions, activeBudget, products, onSelectProduct, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const [who, setWho] = useState(activeWho || "all");
  const [budget, setBudget] = useState(activeBudget || "all");
  useEffect(() => {
    setWho(activeWho || "all");
  }, [activeWho]);
  useEffect(() => {
    setBudget(activeBudget || "all");
  }, [activeBudget]);

  const whoChips = [{ id: "all", label: "Anyone" }, ...(whoOptions || [])];
  const budgetChips = [{ id: "all", label: "Any budget" }, ...(budgetOptions || [])];
  const rows = (products || [])
    .filter((product) => who === "all" || (product.forWho || []).includes(who) || (product.forWho || []).includes("anyone"))
    .filter((product) => budget === "all" || product.budgetTier === budget)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const pills = (label: string, chips: { id: string; label: string }[], active: string, set: (id: string) => void) => (
    <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 0.5, scrollbarWidth: "none" }} role="group" aria-label={label}>
      {chips.map((chip) => {
        const on = chip.id === active;
        return (
          <ButtonBase key={chip.id} onClick={() => set(chip.id)} aria-pressed={on} sx={{ flexShrink: 0, px: 1.75, py: 0.85, borderRadius: 999, fontWeight: 700, fontSize: "0.85rem", border: "2px solid", borderColor: on ? "primary.main" : "rgba(31,27,46,0.18)", bgcolor: on ? "primary.main" : "transparent", color: on ? "#FFFFFF" : "text.primary", "&:focus-visible": { outline: "3px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
            {chip.label}
          </ButtonBase>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 3, sm: 4 }, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        {title && <Typography variant="h3" component="h2" sx={{ fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontSize: { xs: "2.4rem", sm: "3rem" }, color: "text.primary" }}>{title}</Typography>}
        {subtitle && <Typography sx={{ mt: 1, color: "text.secondary", fontSize: "0.98rem" }}>{subtitle}</Typography>}
      </Box>
      {whoOptions && whoOptions.length > 0 && pills("Who is it for", whoChips, who, setWho)}
      {budgetOptions && budgetOptions.length > 0 && pills("Budget", budgetChips, budget, setBudget)}

      {rows.length === 0 ? (
        <Typography sx={{ color: "text.secondary" }}>Nothing on the shelf for that mix. Widen the budget or tell me more.</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: { xs: 1.5, sm: 2 } }}>
          {rows.map((product) => {
            const key = keyOf(product);
            const out = product.inStock === false;
            const offer = typeof product.compareAtPrice === "number" && product.compareAtPrice > product.price;
            const tint = TINTS[product.category || ""] || "#EFEBE4";
            return (
              <ButtonBase
                key={key}
                onClick={() => onSelectProduct?.({ id: key, sku: product.sku, name: product.name, price: product.price })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onItemContextMenu?.(event, { ...product, id: key });
                }}
                aria-label={"Open " + product.name}
                sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "start", bgcolor: tint, borderRadius: "22px", p: 1.25, transition: "transform 160ms ease", "&:hover": { transform: "translateY(-3px)" }, "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
              >
                <Box sx={{ position: "relative" }}>
                  <Box sx={{ aspectRatio: "1 / 1", borderRadius: "16px", overflow: "hidden", bgcolor: "#FFFFFF" }}>
                    {product.imageUrl && <Box component="img" src={product.imageUrl} alt={product.name} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: out ? 0.45 : 1 }} />}
                  </Box>
                  {offer && !out && (
                    <Box sx={{ position: "absolute", insetBlockStart: -8, insetInlineStart: -8, transform: "rotate(-8deg)", bgcolor: "secondary.main", color: "#FFFFFF", fontWeight: 800, fontSize: 12, px: 1.25, py: 0.4, borderRadius: 999, boxShadow: "0 4px 10px -4px rgba(0,0,0,0.35)" }}>Offer</Box>
                  )}
                  {product.giftWrap && !out && (
                    <Box sx={{ position: "absolute", insetBlockEnd: 8, insetInlineEnd: 8, width: 28, height: 28, borderRadius: "50%", bgcolor: "#FFFFFF", color: "secondary.main", display: "flex", alignItems: "center", justifyContent: "center" }} role="img" aria-label="Gift wrap available">
                      <Gift size={15} />
                    </Box>
                  )}
                  {out && (
                    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Box sx={{ bgcolor: "text.primary", color: "#FFFFFF", fontWeight: 800, fontSize: 12, px: 1.25, py: 0.5, borderRadius: 999, transform: "rotate(-8deg)" }}>Sold out</Box>
                    </Box>
                  )}
                </Box>
                <Box sx={{ pt: 1.25, px: 0.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.25, color: "text.primary" }}>{product.name}</Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.1rem", color: "text.primary" }}>{sign + product.price}</Typography>
                    {offer && <Typography sx={{ fontSize: "0.8rem", color: "text.secondary", textDecoration: "line-through" }}>{sign + product.compareAtPrice}</Typography>}
                  </Box>
                  {product.stockNote && <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, color: out ? "text.secondary" : "secondary.main" }}>{product.stockNote}</Typography>}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
