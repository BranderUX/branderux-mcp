# Brandazaar, the Agentic Shop Assistant (gift shop)

A worked example. A shop's moment is decision support (who and how much), so the home asks
two questions and shows two or three things, not the whole catalogue. A boutique, a bookshop,
a deli, a plant shop share the shape; a shop with a real store (Shopify, WooCommerce) binds the
same elements to the live products source instead of managed rows.

## The moment
A gift for someone else, in a hurry. The visitor needs the shop assistant's two questions, a
short shelf, a basket that survives the conversation, and a way to hold the items without
paying in the chat. Payment happens at the counter or by phone when the shop calls.

## The home: a finder
"Who is it for?" in a heavy sans, six tinted cards (For her, For him, For kids, For a host, For
a colleague, Just browsing) with a photo sticker, budget pills (Under $25, Under $50, Under
$100, On offer), the hint "Or just tell me who it is for and roughly how much", and at the
bottom "This week's offers" bound live from products with compareAtPrice above price. Opening
line: "I'm Brandazaar's AI shop assistant. Tell me who the gift is for and roughly how much,
and I'll pick two or three things and hold them at the shop."

The offers strip moved from the top to the bottom on review: the question and its answers
come first, the extra comes last.

## One screen, one job
- shelf (product-grid): one person or one budget, both chip rows to widen it on the phone.
- product (product-detail): a category-tinted header with the photo in a rounded plate, a
  rotated "Offer · was $109" sticker, big price, pill details, a pill quantity stepper, "Add to
  basket · $89".
- basket (basket-review): the receipt.
- reserve (reserve-form): tinted summary, pickup / ship segmented pill, address when shipping,
  gift wrap with a card message, consent, "Hold it for me · $102".
- reserve-done (reservation-confirmation): a rotated HELD stamp, "Held for you, Alex", the
  receipt, one calm line on the three-day hold.

## Fixed screens (exact match queries)
"A gift for her", "A gift for him", "A gift for kids", "A gift for a host", "A gift for a
colleague" → shelf (all rows bound, activeWho set); "Show me the gift shelf" → shelf; "Gifts
under $25", "Gifts under $50", "Gifts under $100" → shelf (activeBudget set); "What's on
offer?" → shelf (binding filter compareAtPrice gt 0, a numeric range filter). Home bound to
products with compareAtPrice gt 0.

## Data
products (20: sku, name, price number, compareAtPrice, category, forWho[], budgetTier,
details, inStock, stockNote, giftWrap, imageUrl, sortOrder; or a shopify-products live source
with the same field names), reservations (end-user-scoped, open, add-only: items as one line,
total as a number, fulfilment, address, gift wrap and message, marketingConsent: "Happy to hear
about new arrivals and offers from Brandazaar by email or text").

## Skills and persona
gift-finding (who + budget → two to six things, lead with the one you would pick),
basket-and-reservation (the basket lives in the conversation; every change re-renders
basket-review; reserve → reserve-form → create_reservations + escalate → confirmation; the
shop confirms, never a sale concluded in chat), shop-facts (hours, wrapping, shipping $6 flat
free over $60, returns 14 days). Persona: a quick, friendly shop assistant; never invents a
product, a price or stock.

## Art direction
Playful market: plum #1F1B2E ink, terracotta #E07A5F, sand #F2CC8F, warm white #FFFBF5,
chrome #E4DDF1, the system sans at 700-800, radius 20, rotating pastel tints per category,
rotated stickers, pill buttons, a paper receipt. A gift-box mark as the logo.

## Lessons that generalise
- Two questions and three answers sell more than a catalogue page; the whole shelf is one tap
  away, not the first thing.
- A floating tag over a scroller needs padding inside the scroller or it clips.
- Range filters in bindings take JSON numbers; equality filters take strings.
