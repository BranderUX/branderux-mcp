import { Box, ButtonBase, Typography } from "@mui/material";

type Pick = { id: string; label: string; hint?: string; query: string; imageUrl?: string };
type Offer = { id?: string; _id?: string; name: string; price: number; compareAtPrice?: number; imageUrl?: string };

export interface Props {
  shopLine?: string;
  question?: string;
  cards: Pick[];
  budgetLabel?: string;
  budgets?: { id: string; label: string; query: string }[];
  hintText?: string;
  offersTitle?: string;
  offersQuery?: string;
  currency?: string;
  offers?: Offer[];
  onPickCard?: (card: { id: string; label: string; query: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const TINTS = ["#F7DCE3", "#DCE9F7", "#DDEFE3", "#F6E7D3", "#E8E0F3", "#FBE3D6"];
const CAPS = { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, fontWeight: 700 };
const keyOf = (offer: Offer): string => offer.id || offer._id || offer.name;

export default function Component({ shopLine, question, cards, budgetLabel, budgets, hintText, offersTitle, offersQuery, currency, offers, onPickCard, onItemContextMenu }: Props) {
  const items = cards || [];
  const tiers = budgets || [];
  const sign = currency || "$";
  const deals = (offers || []).filter((offer) => typeof offer.compareAtPrice === "number" && offer.compareAtPrice > offer.price).slice(0, 6);
  const query = offersQuery || "What's on offer?";
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 3, sm: 4 }, pb: 2, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        {shopLine && <Typography sx={{ ...CAPS, color: "secondary.main", mb: 1 }}>{shopLine}</Typography>}
        <Typography variant="h3" component="h2" sx={{ fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 0.98, fontSize: { xs: "2.8rem", sm: "3.6rem" }, color: "text.primary" }}>
          {question || "Who is it for?"}
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: { xs: 1.5, sm: 2 } }}>
        {items.map((card, index) => (
          <ButtonBase
            key={card.id}
            onClick={() => onPickCard?.({ id: card.id, label: card.label, query: card.query })}
            onContextMenu={(event) => {
              event.preventDefault();
              onItemContextMenu?.(event, card);
            }}
            aria-label={card.label}
            sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "start", bgcolor: TINTS[index % TINTS.length], borderRadius: "22px", p: 2, minHeight: 170, transition: "transform 160ms ease", "&:hover": { transform: "translateY(-3px) rotate(-0.6deg)" }, "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
          >
            <Box sx={{ alignSelf: "flex-end", width: 76, height: 76, borderRadius: "50%", overflow: "hidden", border: "4px solid #FFFFFF", boxShadow: "0 6px 16px -8px rgba(31,27,46,0.5)", transform: "rotate(6deg)", bgcolor: "#FFFFFF" }} aria-hidden="true">
              {card.imageUrl && <Box component="img" src={card.imageUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </Box>
            <Box sx={{ mt: "auto", pt: 1.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: "1.35rem", lineHeight: 1.05, letterSpacing: "-0.02em", color: "text.primary" }}>{card.label}</Typography>
              {card.hint && <Typography sx={{ fontSize: "0.85rem", color: "text.secondary", mt: 0.5, lineHeight: 1.35 }}>{card.hint}</Typography>}
            </Box>
          </ButtonBase>
        ))}
      </Box>

      {tiers.length > 0 && (
        <Box>
          {budgetLabel && <Typography sx={{ ...CAPS, color: "text.secondary", mb: 1.25 }}>{budgetLabel}</Typography>}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} role="group" aria-label={budgetLabel || "Budget"}>
            {tiers.map((tier) => (
              <ButtonBase
                key={tier.id}
                onClick={() => onPickCard?.({ id: tier.id, label: tier.label, query: tier.query })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onItemContextMenu?.(event, tier);
                }}
                sx={{ px: 2.25, py: 1.1, borderRadius: 999, border: "2px solid", borderColor: "primary.main", color: "primary.main", fontWeight: 800, fontSize: "0.95rem", "&:hover": { bgcolor: "primary.main", color: "#FFFFFF" }, "&:focus-visible": { outline: "3px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}
              >
                {tier.label}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      )}

      {hintText && <Typography sx={{ color: "text.secondary", fontSize: "0.95rem" }}>{hintText}</Typography>}

      {deals.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 0.5 }}>
            <Typography sx={{ ...CAPS, color: "text.secondary" }}>{offersTitle || "This week's offers"}</Typography>
            <ButtonBase onClick={() => onPickCard?.({ id: "offers", label: offersTitle || "Offers", query })} sx={{ ...CAPS, fontSize: 10, color: "primary.main", "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>See all →</ButtonBase>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pt: 2, pb: 1.5, mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
            {deals.map((offer) => {
              const pct = Math.round(100 - (offer.price / (offer.compareAtPrice || offer.price)) * 100);
              return (
                <ButtonBase
                  key={keyOf(offer)}
                  onClick={() => onPickCard?.({ id: "offers", label: offer.name, query })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onItemContextMenu?.(event, offer);
                  }}
                  aria-label={offer.name + ", now " + sign + offer.price}
                  sx={{ position: "relative", flexShrink: 0, width: 136, mr: 0.5, display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "start", bgcolor: "#FFFFFF", border: "2px solid", borderColor: "primary.main", borderRadius: "18px", p: 1.25, overflow: "visible", "&:focus-visible": { outline: "3px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}
                >
                  <Box sx={{ position: "absolute", top: -12, insetInlineEnd: 8, bgcolor: "secondary.main", color: "#FFFFFF", fontWeight: 800, fontSize: "0.72rem", px: 1, py: 0.35, borderRadius: 999, transform: "rotate(6deg)", boxShadow: "0 2px 6px rgba(31,27,46,0.25)" }} aria-hidden="true">{"−" + pct + "%"}</Box>
                  <Box sx={{ width: "100%", aspectRatio: "1 / 1", borderRadius: "12px", overflow: "hidden", bgcolor: "#F2EEE8" }} aria-hidden="true">
                    {offer.imageUrl && <Box component="img" src={offer.imageUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </Box>
                  <Typography sx={{ mt: 1, fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.2, color: "text.primary", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{offer.name}</Typography>
                  <Box sx={{ display: "flex", gap: 0.75, alignItems: "baseline", mt: 0.4 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "1rem", color: "primary.main" }}>{sign + offer.price}</Typography>
                    <Typography sx={{ fontSize: "0.8rem", color: "text.secondary", textDecoration: "line-through" }}>{sign + offer.compareAtPrice}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
