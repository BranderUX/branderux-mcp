# Brandeck, the Agentic Salesperson (deck builder)

A worked example. A business that sells a considered service through ads (decks, kitchens,
solar, roofing, a clinic's treatments) gets visitors who are not ready to buy and not ready to
fill in a form. The page they land on has one job: the conversation a good salesperson would
have, ending with an easy way to keep in touch and a lead note the office can act on. Nothing
here is copied into a project.

## The moment
A homeowner tapped an ad on their phone with a deck in mind and a worry or two: the price, the
upkeep, being pushed. They want honest advice before anyone asks for their number. A good
salesperson never opens with a price: they greet, ask one easy question, listen, recommend with
a reason, sum up, then make the next step easy. That is the page.

## The home: a landing page, not a menu
A photo strip (a real deck under a pergola) with the kicker on it ("Brandeck · built by our own
crew") and a yellow dimension line labelled YOUR DECK; a navy blueprint panel with the outcome
headline "The deck you keep picturing.", one line ("Honest advice in minutes. A fixed written
quote after one free visit."), the main button "Consult our AI deck expert", a WhatsApp button
and a note ("Free, no sign-up. A person from our office replies within the hour."). Under it:
four trust ticks, "Or start with a question" (replace my old deck, wood or composite, how long
it takes, what a deck like mine costs), how it works in three steps, the written promises
(bound live) and the office hours. No prices on the home. Opening line: "Hi, I'm Brandeck's AI
deck expert. How can I help?"

The first version opened with a price builder and a live estimate. It was rebuilt on review: no
real salesperson opens with a price. On an iPhone 13 both buttons sit above the fold (the
photo is 118 px on a phone and the kicker moved onto it).

## One screen, one job
- replies (quick-replies): the expert's question answered by taps in the visitor's voice; the
  WhatsApp pill only where keeping in touch is the next step.
- plan (deck-plan-card): the summary and close, the only place the four next steps appear.
- boards (board-compare): the four boards side by side with a cost scale but no prices, upkeep,
  lifespan, heat in the sun, warranty and who should pick which, then one question.
- answer (straight-answers): one stored answer to a question people ask before booking
  (timeline, what's included, the free visit, payment, the permit, the old deck), with the
  other questions as links.
- promises (promise-sheet): what is guaranteed in writing, or the questions to ask every
  builder when comparing quotes.
- visit-done (visit-confirmation): only after create_design_visits succeeded in the same turn.

Most replies are plain text, one to three sentences, ending with one question or one soft
offer; at most one element per reply, after the sentences, and never the plan card twice in a
row.

## Fixed screens (exact match queries)
"I'd like some advice on a deck" (the main button: replies, new deck or replacing), "I want to
replace my old deck" (replies: what's going on with it), "I'm just looking for now" (replies
plus the pill "Send me ideas on WhatsApp"), "Wood or composite?" (boards, bound to the price
list's decking rows), six straight answers ("How long does a deck take?", "What's included in
the price?", "Is the design visit really free?", "How does payment work?", "Do you handle the
permit?", "Can you replace my old deck?"), "What do you guarantee?" and "How do I compare
quotes?" (promises). Home "Show me the home page". Custom pages: Home, Talk to our deck expert,
Wood or composite, Our promises, Book a free visit. NOT fixed: "I'd like a free design visit"
and every request (the plan card opens prefilled from the conversation), "What would a deck
like mine cost?" (the live agent answers with a range), and the reply chips that carry the
conversation on.

## Data
price_list (19 rows: boards, height, railing, stairs, extras, allowance, permit; the source of
the ranges, and the boards screen binds its decking rows), answers (6), promises (16: promises
and compare questions), design_visits (the request, end-user-scoped, add-only, confirm write:
fullName and phone required, then nextStep, townOrZip, visitPreference, projectSummary,
marketingConsent and the handoff notes projectType, scope, buildTiming, budgetComfort,
readiness, worries, askedAbout, rangeShown) and whatsapp_leads (auto write, no card: the ref,
where they tapped and the same notes; no contact details, their number arrives with their
WhatsApp message). The handoff email gets every request and every WhatsApp lead.

## Skills and persona
deck-facts (what we build and where, the price ranges in three tables by size and board, the
honest board facts ending "No board is zero maintenance", what every price includes, the
process, payment, the promises, what I never do) and sales-playbook (sounding like a person,
the questions that change the advice, recommendations tied to what they said, when to offer to
keep in touch, summarize and close, the worries and the honest answers). Persona: Brandeck's AI
deck expert in the first person singular, plain American English, no exclamation marks; the
four moves as a mindset with no fixed order or count; the request flow (create_design_visits
with name, phone and the chosen step first, then escalate_to_owner, then the confirmation) and
the WhatsApp flow (create_whatsapp_leads, escalate_to_owner, one line with the ref).

## Art direction
A builder's blueprint: navy #17324D panels with a faint 22 px grid, a yellow #F2B935 main
button and dimension lines, cedar #A4561F check marks, a cool light ground #EEF2F4 with #DCE5EC
chrome, Avenir Next, a monospace dimension label. The plan card draws the deck to scale
(planks, steps, railing posts, a pergola) with the feet in yellow. WhatsApp keeps WhatsApp's own
look, the official glyph white on #25D366, so people recognise it at a glance (the label stays
dark ink for contrast). A stack of deck planks in a navy rounded square as the logo mark.

## Lessons that generalise
- Sell like a person: no price first, the four moves as a mindset, one question at a time, and
  only questions that change the advice.
- Offer the easy way to keep it early: in the same reply as the first real help, as a question,
  never later than the second answer, then only when the moment fits.
- A price is a range, only when they ask or when price is the worry, with what moves it and
  "the exact number comes in the written quote".
- WhatsApp is a link plus a lead: the button opens wa.me with a prefilled message and a short
  ref AND sends a hidden query; the persona saves it with an auto write and emails the owner,
  so a tap is a lead even if the visitor never sends the message, and the ref matches the
  WhatsApp chat to the note.
- The close is one card with name and phone only; its click query carries every handoff field,
  so the office gets a lead note, not just a name. The confirm card lists the first eight
  fields in the order the agent passes them: name, phone and the chosen step go first.
- Owner rules lose every line that names a wire format (A2UI, JSONL, componentId): write
  flexibleModeRules one rule per line, in plain words, including "Write your sentences first
  and the element after them", or "below" points at nothing.
- Fit the fold on the smallest phone you design for: measure where the main buttons end inside
  the frame, not on a desktop.
