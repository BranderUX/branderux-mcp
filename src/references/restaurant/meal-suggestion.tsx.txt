import { useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";

type Dish = { id?: string; _id?: string; name: string; tags?: string[]; price: number; imageUrl?: string; available?: boolean; description?: string };

export interface Props {
  title?: string;
  note?: string;
  currency?: string;
  startersLabel?: string;
  startersIntro?: string;
  mainsLabel?: string;
  mainsIntro?: string;
  finishLabel?: string;
  finishIntro?: string;
  orderLabel?: string;
  starters?: Dish[];
  mains?: Dish[];
  finish?: Dish[];
  onSelectDish?: (dish: { name: string; id: string }) => void;
  onOrderMeal?: (payload: { items: string; total: number }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

const CAPS = { fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" as const, fontWeight: 600 };
const SANS = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const NUM = { fontFamily: SANS, fontFeatureSettings: "'tnum'" };
const CREAM = "#FFF8EE";
const keyOf = (dish: Dish): string => dish.id || dish._id || dish.name;

export default function Component({ title, note, currency, startersLabel, startersIntro, mainsLabel, mainsIntro, finishLabel, finishIntro, orderLabel, starters, mains, finish, onSelectDish, onOrderMeal, onItemContextMenu }: Props) {
  const sign = currency || "$";
  const [qty, setQty] = useState<Record<string, number>>({});
  const courses = [
    { label: startersLabel || "To start", intro: startersIntro, rows: starters || [] },
    { label: mainsLabel || "Mains", intro: mainsIntro, rows: mains || [] },
    { label: finishLabel || "To finish", intro: finishIntro, rows: finish || [] },
  ].filter((course) => course.rows.length > 0);
  const all = courses.flatMap((course) => course.rows);
  const chosen = all.filter((dish) => (qty[keyOf(dish)] || 0) > 0);
  const count = chosen.reduce((sum, dish) => sum + (qty[keyOf(dish)] || 0), 0);
  const total = chosen.reduce((sum, dish) => sum + (qty[keyOf(dish)] || 0) * dish.price, 0);
  const bump = (dish: Dish, delta: number) => setQty((current) => ({ ...current, [keyOf(dish)]: Math.max(0, (current[keyOf(dish)] || 0) + delta) }));
  const order = () => {
    if (count === 0) return;
    onOrderMeal?.({ items: chosen.map((dish) => (qty[keyOf(dish)] || 0) + " x " + dish.name).join(", "), total });
  };

  const stepButton = (label: string, glyph: string, onClick: () => void, filled: boolean) => (
    <ButtonBase onClick={onClick} aria-label={label} sx={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid", borderColor: "primary.main", bgcolor: filled ? "primary.main" : "transparent", color: filled ? CREAM : "primary.main", fontSize: "1.3rem", fontFamily: SANS, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
      {glyph}
    </ButtonBase>
  );

  return (
    <Box sx={{ position: "relative", pb: count > 0 ? 11 : 3 }}>
      <Box sx={{ px: { xs: 2, sm: 4 }, pt: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 3 }}>
        <Box>
          {title && <Typography variant="h3" component="h2" sx={{ fontStyle: "italic", fontWeight: 400, lineHeight: 1.05, fontSize: { xs: "2.1rem", sm: "2.8rem" }, color: "text.primary" }}>{title}</Typography>}
          {note && <Typography sx={{ mt: 1.25, fontFamily: SANS, fontSize: "0.98rem", lineHeight: 1.55, color: "text.secondary" }}>{note}</Typography>}
        </Box>
        {courses.map((course) => (
          <Box key={course.label}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 0.5 }}>
              <Typography sx={{ ...CAPS, color: "primary.main" }}>{course.label}</Typography>
              {course.intro && <Typography sx={{ fontFamily: SANS, fontSize: "0.82rem", color: "text.secondary", fontStyle: "italic" }}>{course.intro}</Typography>}
            </Box>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, borderTop: "1px solid", borderColor: "divider" }}>
              {course.rows.map((dish) => {
                const n = qty[keyOf(dish)] || 0;
                const off = dish.available === false;
                return (
                  <Box key={keyOf(dish)} component="li" sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider", opacity: off ? 0.5 : 1 }}>
                    <ButtonBase
                      onClick={() => onSelectDish?.({ name: dish.name, id: dish.id || dish._id || "" })}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onItemContextMenu?.(event, dish);
                      }}
                      aria-label={"About " + dish.name}
                      sx={{ display: "flex", alignItems: "center", gap: 1.5, flexGrow: 1, minWidth: 0, textAlign: "start", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
                    >
                      <Box sx={{ width: 64, height: 64, borderRadius: 1.5, overflow: "hidden", flexShrink: 0, bgcolor: "rgba(0,0,0,0.06)" }} aria-hidden="true">
                        {dish.imageUrl && <Box component="img" src={dish.imageUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </Box>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography sx={{ fontSize: "1.15rem", fontWeight: 500, lineHeight: 1.15, color: "text.primary" }}>{dish.name}</Typography>
                        {dish.description && <Typography sx={{ fontFamily: SANS, fontSize: "0.8rem", color: "text.secondary", mt: 0.3, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{dish.description}</Typography>}
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.4 }}>
                          <Typography sx={{ ...NUM, fontSize: "0.98rem", fontWeight: 600, color: "primary.main" }}>{off ? "Not tonight" : sign + dish.price}</Typography>
                          {dish.tags && dish.tags.length > 0 && <Typography sx={{ ...CAPS, fontSize: 9, color: "text.secondary" }}>{dish.tags.slice(0, 3).join(" · ")}</Typography>}
                        </Box>
                      </Box>
                    </ButtonBase>
                    {!off && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                        {n > 0 && stepButton("Remove one " + dish.name, "−", () => bump(dish, -1), false)}
                        {n > 0 && <Typography sx={{ ...NUM, minWidth: 18, textAlign: "center", color: "text.primary", fontWeight: 600 }} aria-live="polite">{n}</Typography>}
                        {stepButton("Add " + dish.name, "+", () => bump(dish, 1), n > 0)}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
      {count > 0 && (
        <Box sx={{ position: "sticky", bottom: 12, mx: { xs: 2, sm: 4 }, mt: 2, zIndex: 2 }}>
          <ButtonBase onClick={order} sx={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, py: 1.9, borderRadius: 2, bgcolor: "primary.main", color: CREAM, boxShadow: "0 12px 30px rgba(60,20,16,0.35)", "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 2 } }}>
            <Typography sx={{ ...CAPS, fontSize: 12, color: "inherit" }}>{orderLabel || "Order this for the table"}</Typography>
            <Typography sx={{ ...NUM, fontSize: "1.05rem", fontWeight: 700, color: "inherit" }}>{count + (count === 1 ? " item · " : " items · ") + sign + total}</Typography>
          </ButtonBase>
        </Box>
      )}
    </Box>
  );
}
