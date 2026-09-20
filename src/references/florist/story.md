# Brandelia, the Agentic Florist (flower studio)

A worked example. Sending flowers is emotional and visual, so the home is a deck of photos,
not a list; a bakery, a gift basket service or anything ordered for an occasion and delivered
on a day shares the shape (occasion → thing → message → window → recipient) with a different
skin.

## The moment
The visitor is sending flowers to someone else, with a feeling attached and a day in mind. The
studio ties bouquets on the morning of delivery, so the delivery windows and their cutoffs are
the one live fact that matters. Payment is a phone call after the order, never in the chat.

## The home: a deck
Small caps studio line, the question "Who are the flowers for?", "Swipe, then tap", then the
occasions as tall photo cards in a snap scroller (Love, A birthday, Thank you, A new baby,
Get well, Condolence, A new home, Just browsing), the hint "Or just tell me who it is for,
what for, and roughly how much", and the delivery windows still open ("Still open for delivery
· Thu 17 Sep 16:00-19:00 (order by 14:00)") as one ruled line bound live from delivery_slots.
Opening line: "I'm Brandelia's AI florist. Tell me who the flowers are for and when they should
arrive, and I'll take the whole order; the studio phones to confirm."

## One screen, one job
- bouquets (bouquet-grid): the shelf for one occasion: occasion tabs, portrait cards, palette
  dots, "In season", "Not today". ALL rows are bound and activeOccasion is set, so the tabs
  still work on the phone and no screen can go empty.
- bouquet-detail: one bouquet, size picker with the live price, the card message.
- delivery-window (delivery-windows): grouped by day, sold-out visible and disabled.
- order-checkout (order-form): the order sheet with a dotted-leader summary, recipient,
  address, sender, the card, consent, one square button carrying the total.
- order-done (order-confirmation): "Your flowers are on the list", the card message on paper,
  a calm line that the studio phones to confirm and take payment.

## Fixed screens (exact match queries)
"Flowers for someone I love", "Flowers for a birthday", "Flowers to say thank you", "Flowers
for a new baby", "Flowers to say get well", "Flowers for a condolence", "Flowers for a new
home" → bouquets (all rows bound, activeOccasion set per screen); "Show me the bouquets" →
bouquets; "When can flowers arrive?" → delivery-window (delivery_slots bound). Home bound to
delivery_slots (available = "true", limit 6).

## Data
bouquets (10: name, occasionKey, price number, stemsSummary, stems[], palette[] hex, vaseLife,
sizesAvailable [{id,label,stemCount,priceDelta}], seasonal, inStock, imageUrl, description),
delivery_slots (per day: date, dayLabel, window, area, price, remaining, available, cutoffTime,
sortOrder), orders (end-user-scoped, open, add-only, marketingConsent: "Happy to hear about
seasonal flowers and offers from Brandelia by text or email").

## Skills and persona
occasion-guidance (who it is for + roughly how much → two or three bouquets), order-flow
(bouquet + size → delivery window → order form → create_orders + escalate → confirmation; the
studio phones to confirm and take payment), flower-care. Persona: the florist's voice, warm
and brief; never invents a bouquet, a price, stock or a window.

## Art direction
Editorial florist: deep sage #3F4A38 as the surface colour, paper #F3EDE2, terracotta accent
#C2705F, Helvetica Neue (local, nothing swaps), hairlines, small caps labels, italic notes,
square buttons, a lined paper card. A stem-and-bud mark as the logo.

## Lessons that generalise
- For "one category" screens bind ALL rows and set the active chip instead of filtering: the
  chips keep working and no screen can go empty.
- Dated rows (delivery slots) go stale; the home only shows rows from today on and the agent
  says so when nothing is open.
- A sold-out option stays visible: hiding it makes the visitor think the business is closed.
