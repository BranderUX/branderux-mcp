# Brand & Breakfast, the Agentic Concierge (bed and breakfast)

A worked example. A guest wants a host, so the home is a desk with a person behind it, not a
photo of the house. Small hotels, guesthouses, holiday rentals and retreats share the shape:
rooms before the stay, the house and the area during it, one request form for everything.

## The moment
Before arrival: which room, for which dates, and a request (early check-in, a dinner table, a
pickup). During the stay: breakfast hours, the house rules, what to do around here, a rainy
day. No payment in the chat: a booking is a request the host confirms by phone or email.

## The home: a concierge desk
Centred house line, "Good afternoon, Mara here." (computed from the hour), the question "What
can I do for you?", a 2x3 grid of paper tiles with a round sepia photo (A room, Around here,
Breakfast, The house, Ask the host, A rainy day), then the pinned "Today at the house" notice
(breakfast 07:30 to 10:00 in the garden room, check-out by 11:00, bikes in the lane, a line
from Mara about the weather) and a dashed "A guest perk" ticket (one coffee on us at the
Harbour Café, code BNB-COFFEE). Opening line: "I'm Mara's AI concierge at Brand & Breakfast.
Ask me about rooms, breakfast, what's around here, or anything you'd ask the host; every
request reaches her."

The house photo that used to sit on the home was removed: a guest already knows what the
house looks like; a notice and a perk are useful, a photo is decoration.

## One screen, one job
- rooms (room-grid): mounted 3:2 photos with a paper rate tag, small caps facts, italic
  availability in honey.
- room-detail: one room with the reservation slip.
- around (local-guide): small caps category tabs (eat, drink, walk, see, with kids, rainy
  day), a route list with a circled minutes badge and the walk / bike / drive icon, "Mara's
  tip:" in italic, photo plates.
- house (info-board): a pinned notice with small caps titles and the text; breakfast items as
  mounted square photos with italic captions. One generic info-board element covers rules,
  services and breakfast through a `kind` filter binding.
- request (stay-request-form) and request-done (request-confirmation: "Entered in the guest
  book", a ruled page, "Thank you, Sam.", a Mara signature).

## Fixed screens (exact match queries)
"Show me the rooms" → rooms; "What's around here?" plus "Where should we eat?", "A walk from the
house", "Something with the kids", "A rainy day" → around (all rows bound, activeCategory set);
"What's for breakfast?", "What are the house rules?", "What can the host arrange?" → house
(house_info filtered by kind). Custom pages Home / Rooms / Around here / The house. NOT a fixed
screen: "I have a request for the host" → request stays live, so the agent opens the form with
the room, the dates and the guest's name already filled in from the conversation; a fixed
screen would open it blank.

## Data
rooms (6: name, sleeps, bedType, view, floor, sizeSqm, amenities[], pricePerNight number,
available, availabilityNote, imageUrl, description), local_guide (14: name, category,
distanceMinutes, how, blurb, tip, priceLevel, openNote, imageUrl), house_info (kind: rule |
service | breakfast; title, text, imageUrl), stay_requests (end-user-scoped, open, add-only:
kind, room, dates, guests, estimatedTotal, guest details, marketingConsent with the wording
"Happy to hear about seasonal offers and events at Brand & Breakfast by email or text").

## Skills and persona
house-knowledge, request-flow (a booking carries room, dates, guests and the indicative total;
create_stay_requests + escalate to the host in the same turn, then request-confirmation; never
say the host has it unless the write succeeded), local-guide. Persona: Mara's voice, warm,
unhurried, practical; availability is indicative, the host confirms.

## Art direction
The guest book: ink #2E2A25, caramel #8A6A4F, honey #B8862B, paper #F7F1E6, chrome #EADCC4,
Georgia (local), radius 4, elevation 0; mounted photos with a paper matte and an offset
shadow, small caps labels in honey, dotted-leader ledgers, italic notes in the host's voice.
A roof mark as the logo.

## Lessons that generalise
- Make the home carry something a guest uses today (a notice, a perk), not a hero photo.
- A greeting computed from the clock is cheap and makes the desk feel staffed.
- One generic board element plus a `kind` filter binding beats three near-identical elements.
- The request form is never a fixed screen: a fixed screen cannot prefill it, the agent can.
