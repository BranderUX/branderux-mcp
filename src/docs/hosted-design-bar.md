# The design bar for hosted builds (defaults and recommendations)

This doc is guidance, not a rule set. Everything here is a DEFAULT and a RECOMMENDATION: the
owner's instructions always win, nothing below is enforced by the platform, and a build that
departs from it for a good reason is a good build. It exists because the difference between a
build that looks like a demo and one that looks like the business is a handful of decisions,
and these are them.

Read it before the first `create_element`, and read the closest reference build
(`list_templates`, then `get_template`) as a worked example. References are for reading and
adapting to the customer, never for copying into a project: their data, copy, brand and even
their home pattern belong to a different business.

## 1. Start from the moment, not from the category

Before any screen, write two sentences: WHO the visitor is, WHERE they are and on WHAT (a phone
at a table, a laptop at a desk, a guest already in the house), and WHAT they must finish. The
moment decides the home; the category only hints at it.

- A restaurant's guest at the table wants to pick and send in under a minute → mood tiles.
- A barbershop's visitor is deciding walk in now or book later → a decision, two tiles.
- A florist's customer is sending a feeling to someone else → a deck of photos to swipe.
- A guesthouse's guest wants the host → a concierge desk with a greeting and a notice.
- A gift shop's customer is buying for someone else, in a hurry → two questions, three things.
- A property developer's visitor is choosing a city and a budget → a finder with a live strip.

Two businesses in the same category with different moments (a bakery counter vs a bakery that
delivers cakes for a date) get different homes. Two businesses in different categories with
the same moment (a florist and a cake shop, both "send something for an occasion on a day")
share a shape with a different skin.

## 2. The home is a question and its answers

Default order, top to bottom: the business line (small), the question, the answers as tappable
things, then at most one extra that is USEFUL today (a live "still open for delivery" line, a
"today at the house" notice, a coupon for the café down the hill, this week's offers), then a
hint that free text works ("Or just tell me who it is for and roughly how much").

- Question first, answers right under it, extras last. A card that is not an answer to the
  question goes to the bottom.
- The extra must be relevant, not decorative: a photo of the building is decoration; the
  breakfast hours are useful. If nothing useful exists, leave the extra out.
- The opening chat line is the business first, in its voice: "I'm Brandelia's AI florist. Tell
  me who the flowers are for and when they should arrive, and I'll take the whole order; the
  studio phones to confirm." Never "Welcome to our AI assistant".
- No two templates share a home pattern; when the moment is the same as a reference, reuse the
  PATTERN (a decision, a deck, a finder, a desk), not the tiles.

## 3. One screen, one job

Every answer is one designed element that does one job: a shelf, one item, one form, one
confirmation. The set that covers most businesses:

- the answer to the home question (a composed meal, a category of the price list, the rooms,
  the bouquets for an occasion, the shelf for one person),
- one item (a dish, a room, a bouquet, a product) with its facts and ONE primary action,
- one intake form carrying every field in its click query,
- one confirmation, rendered ONLY after the write succeeded, showing what was saved and the
  honest next step ("the shop calls to confirm"),
- the utility screens the data supports (hours, delivery windows, the local guide, a basket).

Switch the generic header / image / button / table elements off (`update_project_settings`
elementVisibility) so the live agent answers a tapped item with the designed element, never
with a header and a photo.

## 4. Every chip is a verified fixed screen

A tile, a chip, a pill or a custom page is a designed screen that replays with no model call
when its query equals a fixed screen's match query character for character. Store the query
in the element's props exactly as the fixed screen has it. Read the verification that
`set_home_screen` and `set_fixed_screens` return: a binding with zero rows means that screen
falls through to the live agent; `uncoveredQueries` lists the chips no screen answers. Bind
ALL rows and set the element's active chip instead of filtering when a filter could return
nothing. After publishing, probe: `POST /api/agent/serve {"query": "<the chip's query>",
"homeDecision": true}` on the site returns 200 when the designed screen replays and 204 when
the live agent answers.

## 5. Real data, honest numbers

- Seed the customer's real rows when you can obtain them (their menu, their price list, their
  rooms). When you cannot, seed clearly sample rows (`_demo: true`) and say so.
- Never show a live number nobody maintains (a minute-by-minute wait, live stock a shop does
  not track). Build the board from records a business really keeps (hours, who works today,
  a standing note) and let the copy say what the desk knows.
- Prices come from rows, as numbers, with the currency the business uses. A sold-out or
  unavailable item stays visible and disabled; hiding it reads as "closed".
- A request is a request: "the shop calls to confirm", never "confirmed", and never say it was
  sent unless the write returned success.

## 6. Art direction comes from the business

- Palette from the business (their site, their sign, their category), with a background and a
  secondary background (the site chrome) that differ from every other project you have built.
- Font stacks that exist locally on phones (a serif for a bistro, a condensed sans for a
  barber, the system sans for a shop); a web font that loads late swaps after paint, which
  reads as broken.
- A logo mark in the header (`update_brand_settings` iconUrl; an inline SVG data URL is fine
  when the business has none).
- One typographic system per build: a labels style (small caps), a numbers style (tabular),
  one heading voice. Details that carry the trade: a kitchen ticket, a price board with dotted
  leaders, a paper receipt, a guest book, a reservation slip.
- Direction-neutral layout (gap, logical props) so the same element serves RTL sites.

## 7. Copy

Short. The business's voice, not the platform's. No exclamation marks unless the brand shouts.
Field labels in the site's language: every intake entity property carries a `title` in that
language, which is what the visitor reads on the Confirm card. One language per line: a Hebrew
verb never pairs with an English object.

## 8. Verify on a phone before you say it is done

Open the published site at phone width, walk the home, tap one chip, tap one item, submit one
form, and look at the confirmation. Check the Data pane holds the row. What you did not look at
is not finished.

## Using the references

`list_templates` lists the five reference builds with the moment, the home pattern and the live
site. `get_template` returns one build's story (the moment, the home, every screen, the fixed
screens, the data, the skills, the art direction, the lessons) and its signature elements'
code. Read the one whose MOMENT is closest, then design for the customer: their moment, their
data, their voice, their palette. Copying a reference's tiles into a different business is the
one thing this doc asks you not to do.
