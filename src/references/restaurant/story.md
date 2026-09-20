# Brandoria, the Agentic Waiter (restaurant)

Read this as a worked example, not a kit. Everything below was decided FROM the moment; a
different restaurant (delivery-first, a bar, a food hall) has a different moment and gets a
different home. Nothing here is copied into a project; it shows what "designed for the moment"
looks like once, end to end.

## The moment
Guests scan a QR card at the table. One phone for the group, hungry, others waiting on them,
a waiter walking around. The job is to pick and send in under a minute, on a phone, with a
thumb. So: no website navigation, no reservations, no hours page. Those belong to a different
product (a restaurant website), not to the table.

## The home: a question and its answers
"What do you feel like tonight?" over six photo tiles (Sharing for the table, Meat, From the
sea, Vegetarian & vegan, For the kids, Dessert & coffee) and one hint line ("Or type what you
are in the mood for, how many you are, or anything you cannot eat"). The house line above the
question is small caps ("Brandoria · tonight's board"). The opening chat line is the business
first: "I'm Brandoria's AI waiter. Tell me what you feel like, ask what's in a dish, or order
for the table and I'll send it to the kitchen."

Every tile is a fixed screen: its query ("Something for the table to share", "I feel like
meat", "I feel like fish", "Vegetarian and vegan options", "Something for the kids", "Dessert
and coffee") is stored verbatim as a match query. A tap replays a designed screen with live
rows and no model call.

## One screen, one job
- meal (meal-suggestion): the waiter's composed meal for THIS table, two or three real dishes
  per course, a one-line note that says why, + steppers, a sticky "Order this for the table ·
  3 items · $58" bar. Three bindings per mood (starters, mains, to finish) filtered on the
  menu rows' own flags (sharing, vegan, kidFriendly, categoryKey), sorted by sortOrder.
- menu (menu-board): every dish as rows under sticky section tabs, one binding of all rows.
- dish (dish-detail): exactly one dish with allergens always shown, a stepper, "Order for the
  table". Rendered live by the agent when a dish is tapped or named.
- order (order-form): the kitchen ticket, prefilled from the conversation.
- order-done (order-confirmation): ONLY after create_orders succeeded, the saved lines, a warm
  line that the waiter comes over to confirm, two next steps (dessert, the full menu).

Generic header / image / button / table elements are switched off (elementVisibility) so the
live agent never describes a dish with a header and a photo.

## Fixed screens (exact match queries)
Six moods → meal, "Show me the full menu" → menu, "I want to order" → order. Custom pages:
Tonight / Menu / Order. Home "Show me the home page". Every binding returns rows in the
verification; a binding with zero rows would make its screen fall through to the live agent.

## Data
menu_items (40 rows, public-read: name, categoryKey, price as a number, tags, allergens,
available, popular, sharing, vegan, vegetarian, glutenFree, spicy, kidFriendly, imageUrl,
sortOrder), opening_hours, orders (end-user-scoped, open, add-only: tableNumber, guests,
items, notes, status). No phone or email is collected, so no marketing consent.

## Skills and persona
table-service (moods → meal-suggestion, tap → dish-detail, order → order-form → create_orders
+ escalate_to_owner → order-confirmation, never before an intent to order), menu-and-dietary
(allergens only from the row, the kitchen uses no dairy, kids' half portions). Persona: a good
waiter, warm, unhurried, brief, one question back at most, no exclamation marks, never invents
a dish or a price, an order is a request the waiter confirms.

## Art direction
A bistro: ivory #FAF6EF ground, burgundy #7B2D26 for prices, buttons and tabs, olive #4C5B45
for dietary marks, burnt orange accent; Palatino / Iowan Old Style (local stacks, nothing
swaps after load); italic headings, small caps labels, tabular numbers, a paper ticket with a
zigzag edge for the order. A "B" roundel as the logo mark (inline SVG data URL as iconUrl).

## Lessons that generalise
- Bound rows carry `_id`, not `id`: key and click templates on `id || _id`.
- Binding equality filter values are strings ("true"), range filters JSON numbers.
- Probe each fixed query on the published site: POST /api/agent/serve {query, homeDecision:
  true}; 200 = the designed screen replays, 204 = the live agent answers.
- The confirmation is the whole answer after a successful write, never a speculative next step.
