# Barbrander, the Agentic Receptionist (barbershop)

A worked example. A barbershop's moment is a decision (walk in now, or book), so the home is
built as a decision, not as a list of services. A hair salon with stylists on a diary, a nail
bar, a tattoo studio have different moments; read this for how the moment shaped the screens.

## The moment
"Can I come now?" versus "I need a slot on Thursday". The desk cannot see the floor, so
there is no live wait number to promise. What a shop really keeps: opening hours, which
barbers work which days, a price list with real durations, a standing note about walk-ins at
peak. Everything on the home comes from those records, computed on the phone.

## The home: a decision
Status line from today's row of opening_hours ("Open now · until 21:00", "Opens at 09:00",
"Sunday · closed"), the question "Walk in or book?", two tiles: Walk in (→ "How long is the
wait right now", a TODAY board: hours, who is in, the walk-in note, Book a chair) and Book a
chair (→ "I want to book an appointment", the ticket). Under them the barbers in today as a
portrait row (a tap starts a live booking with that barber), then the services as chips with
"from $16", and the hint "Or just tell me what is going on with your hair". Opening line:
"I'm Barbrander's front-desk AI. Ask me the wait right now, the prices, who cuts what, or
book a chair and the shop calls you to confirm."

## One screen, one job
- wait (wait-now): the TODAY board computed from opening_hours + barbers. No invented number.
- recommend-and-book (service-price-list + barber-roster): one category of the price list and
  the barbers who do that work; a row tap opens the ticket with the service pre-selected.
- price-list (service-price-list): categories with a rule, dotted leaders, "45 min" mono, a
  brass star for popular.
- barbers (barber-roster): brass-ringed portrait, "Master Barber · 14 yrs", specialties,
  italic bio, "In Mon-Fri".
- product-shelf: 2-column squares, "On the shelf / Sold out" dot.
- book-appointment (booking-request-form) and booking-confirmed (booking-confirmation).

## Fixed screens (exact match queries)
"I need a haircut", "I need beard work", "I want a hot towel shave", "Cut and beard", "A cut
for my kid" → recommend-and-book (services bound by category, barbers bound); "How long is the
wait right now" → wait; "I want to book an appointment" → book-appointment (services + barbers
bound); "Show me the price list", "Who are the barbers?", "What products do you sell?". Home
bound to opening_hours and barbers.

## Data
services (11: name, category, price number, durationMinutes, popular, description, sortOrder,
imageUrl), barbers (4: name, title, bio, specialties[], daysAvailable, yearsExperience,
imageUrl), opening_hours (7 rows: day, opens, closes, closed, note, dayOrder), products (7,
inStock), bookings (end-user-scoped, open, add-only, marketingConsent with the checkbox
wording "Happy to get news and offers from Barbrander by text or email").

## Skills and persona
booking-flow (check the shop is open that day and the barber is in, create_bookings with
status requested, escalate to the owner in the same turn, then booking-confirmation; never a
confirmed slot, the shop calls), shop-facts (hours, prices, who does what), the walk-in note.
Persona: the desk's voice, warm, short, a little dry, no exclamation marks, never invents a
price, a duration, a barber's day, stock or the wait.

## Art direction
The dark room: brass #C9973F on #131110, secondary surface #241D14, a red accent for errors,
brass hairlines at 35%, uppercase condensed headings (Avenir Next Condensed / Arial Narrow,
local stacks), mono tabular numbers, a double-ruled board. A barber-pole mark as the logo.

## Lessons that generalise
- A live minute-by-minute number that no one updates is a lie; build the board from records
  a shop actually keeps and say what the desk knows.
- The decision the visitor is making is the home; the catalogue comes after it.
- Set generic header/image/button off so a tapped service opens the ticket, not a header.
