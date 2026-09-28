# WhatsApp channel: the hosted agent on the business's own number

A business with a published hosted agent can connect the WhatsApp number its customers
already write to. From then on the SAME agent answers there: the same data, persona,
skills, language, clock and write wiring as the site, shown with WhatsApp's own buttons,
lists, carousels and forms instead of a web page. Who else can answer depends on the
number (`coexistence`, below). On a number that stays on the owner's WhatsApp Business app
too (the connect the owner is taken through), the owner sees every chat in the app and
takes over any chat simply by replying. On a number connected without the app, nobody
from the business can write in its chats: only the agent answers there.

## What it needs

- **A published agent.** WhatsApp answers with the published site's own credentials, so a
  project can connect only after `publish_site` (before that, `blockedReason` is
  `not_published`).
- **A site that does not require sign-in.** `policies.loginRequirement` "none" or
  "optional". A site that requires sign-in ("required", "approval", "private") cannot
  connect yet (`blockedReason` is `login_required_site`).
- **The owner's own click.** The OWNER connects, never you: the WhatsApp row of the Agent
  tab (under Served on), or the in-app Builder's connect card, opens Meta's own sign-in
  window, where they choose their business and the number already in their WhatsApp
  Business app and confirm it on the phone. To connect it, never ask for the phone
  number, a code, a token or a password, and never offer to enter one for them: none of
  them ever passes through a conversation. That rule is about connecting alone: a
  WhatsApp number or link for handing a customer to a person is still asked for (see
  the handoff, after the status fields below).

The first two keep mattering after the connect: a site unpublished later, or switched to
required sign-in, stops the WhatsApp answers too, and `blockedReason` says why. Until it
is lifted the number cannot be connected again either.

`get_whatsapp_status` reports all of it. `available: false` means there is no WhatsApp
here to offer (WhatsApp is not open on BranderUX yet, or the server has no WhatsApp
channel). Otherwise `whatsapp` is the channel as the server reports it:

- `connected`: true from the owner's connect until the number is disconnected, so a
  number still connecting or waiting for a reconnect counts too: `status`,
  `blockedReason` and `sendBlockedReason` say whether it answers.
- `status`: null before the first connect; `connecting` while a connect is under way (it
  does not answer yet); `active` answers; `needs_reconnect` (a breakage: Meta stopped
  accepting the connection, or paused the account) and `disconnected` (ended on purpose:
  the owner disconnected it in the Agent tab or in Meta's own settings) do not answer. A
  `disconnected` number answers again once the owner connects it from the WhatsApp row of
  the Agent tab. A `needs_reconnect` one may need that too, or may be waiting on Meta (an
  account Meta offboarded or disabled comes back when Meta restores it, and connecting
  again does not lift a ban), so never promise that connecting again fixes it.
- `displayPhone` and `displayName`: the number (its digits, country code first, as in a
  wa.me link) and its WhatsApp business name.
- `quality`: Meta's quality rating of the number: `GREEN`, `YELLOW`, `RED` or `NA` (no
  rating).
- `tier` and `messagingLimit`: one value under two names, Meta's messaging limit for the
  number (`TIER_250`, `TIER_2K` and so on). Information for the owner, nothing to act on.
- `pauseHours`: how long the agent stays quiet in a chat after the owner replies in it.
  1, 4 and 24 are hours; 16 is the owner's "until tomorrow morning": until the first
  08:00 in the business's time zone (`policies.timezone`; UTC when it is missing or not
  a valid time zone) that is at least four hours after the reply. A reply between
  midnight and 04:00 pauses the chat until 08:00 that same morning, a later one until
  08:00 the next day; not a flat 16 hours. It matters only where the owner can reply in a
  chat, a number with `coexistence` true.
- `flows`: the entities whose WhatsApp form is live.
- `blockedReason`: why WhatsApp cannot serve the project right now, `not_published` or
  `login_required_site` (above); null when nothing blocks it. It only ever names the
  project's own block: Meta refusing to send is `sendBlockedReason`.
- `sendBlockedReason`: why Meta refuses to send anything from the connected number, so
  WhatsApp is not answering even with `status` `active` (customers' messages go
  unanswered); null while Meta sends, and always null once no number is connected. It
  clears the first time Meta accepts a reply again, which takes a customer writing after
  the cause is gone, so it can still show for a while after the owner fixed it.
  Connecting again lifts neither a payment problem nor a restriction: never promise that
  it fixes a send block. The reasons:
  - `payment_required`: a problem with the payment method on the business's WhatsApp
    account with Meta; it answers again once the owner adds or fixes that payment method
    in Meta (never with a price or an amount, as below);
  - `account_restricted`: Meta restricted the account or the number (a policy violation,
    a limit on the number after its messages were flagged as spam, or a display name
    Meta has not approved yet); it answers again once Meta lifts that;
  - `not_registered`: Meta says the number is not registered for sending; it answers
    again once the number is registered with Meta again.
- `sendBlockedAt`: when Meta last refused (for the record); null with
  `sendBlockedReason`.
- `coexistence`: whether a person from the business can answer in the chats, which
  decides what you tell the owner about a person answering. True: the number stays on the
  owner's WhatsApp Business app too, where the owner sees every chat and answers a
  customer in the same chat (and the agent then pauses there, `pauseHours`). False: the
  number runs without the app, so nobody from the business can write in its chats: the
  agent never promises a person there, and a customer who asks for one is asked how the
  business can reach them (What the customer gets).
- `connectedAt` and `smbSyncRequestedAt`: for the record, nothing to act on.

`policies.handoff.whatsapp` is a different thing: the number a website visitor is sent to
when they ask for a person. Storing it connects nothing, and asking for it belongs to the
handoff, not to connecting: a WhatsApp number or link for handing a customer to a person
is asked for in the hosted-agent contract's handoff question (question 3), confirmed by
the owner and stored there, whatever `get_whatsapp_status` answers (`available: false`
included).

## What the customer gets

- Answers in the site's language, on the number they already use, with nothing to install.
- The first message of a conversation, and the first after a day of silence, opens with
  one line saying this is the business's automated assistant and that a person can be
  asked for at any time, with the privacy link. The platform adds it: never write it into
  the persona or a skill.
- Taps instead of typing. The platform enforces WhatsApp's limits on every answer, so the
  live agent never counts characters:
  - reply buttons: at most 3, each title at most 20 characters;
  - a list: at most 10 rows, each row title at most 24 characters (a longer list goes on
    behind a "More" row);
  - a carousel of 2 to 10 cards built from live rows, each card a photo and a short text;
  - a form for a booking, an order or a request (below).
- A visual answer (a comparison, a grid, a table, rich product cards) arrives as a short
  summary with an **Open** button: a link to the full branded screen on the site (with an
  image of it where screen images are on), where the customer can carry on. Custom
  elements render there unchanged.
- The designed home and the fixed screens replay with no model call, as on the site. The
  home arrives as its welcome text, the home screen and a list of its chips; tapping a
  chip whose query is a fixed screen's `matchQuery` brings that screen back as its rows (a
  carousel or a list) with the screen itself.
- A write left on confirm ends with a summary and **Confirm** / **Cancel** buttons, the
  WhatsApp twin of the site's Confirm card.
- Asking for a person, on a number with `coexistence` true: the agent says a person from
  the business will answer in this chat and, with a handoff email stored, the owner gets
  the escalation email and answers the customer in that chat, in the WhatsApp Business
  app (or at the phone number or email they gave, when they asked to be reached another
  way).
- Asking for a person, on a number with `coexistence` false: nobody from the business
  writes in the chat. With a handoff email stored, the agent asks how the business can
  reach the customer (a phone number or an email), sends the request with it and says the
  business will contact them that way (when they give none, only that it was sent); the
  escalation email carries that contact, and the owner reads the conversation in the
  Agent tab, under Conversations. Without a handoff email, the agent shares the owner's
  other ways to reach a person, or says plainly that nobody from the business answers in
  the chat.

## What you build for it

1. **Short titles for the home's chips (`set_whatsapp_titles`).** On WhatsApp the home's
   chips become the rows of one list, read from the home's own data (items carrying a
   label and a query, the queries-list shape), and a row title stops at 24 characters.
   For every chip whose label runs past 24 characters, write a short title (at most 24
   characters, one line, in the site's language) keyed by the chip's query, character for
   character: the same words as its fixed screen's `matchQuery`. The row still sends the
   chip's full query, so the fixed screen behind it still answers, and the chips on the
   site keep their labels. Titles merge into `policies.whatsappTitles` (`{query: title}`):
   send only the ones that change, at most 50 per call, and a title of `null` removes
   that query's title. After the home's chips change, send the home's whole current set
   with `replace: true` (an empty list when no label runs past 24 characters), so the
   titles of chips that are gone go too; a call that changes nothing writes nothing. At
   most 50 titles are kept, and the whole policy bag must stay within the server's 8 KB;
   a call past either limit is refused and stores nothing. Never write that key through
   `upsert_agent_config`, which would replace the whole map.
2. **Forms from the writable entities (`publish_whatsapp_forms`).** Every entity visitors
   can add to (writePolicy `open`, its `create_<entity>` tool not switched off) becomes
   one WhatsApp form: a date picker for a date, a choice list for an enum, a consent tick
   for `marketingConsent`, a yes/no choice for any other true/false field, text fields
   for the rest, required where the schema says so, each field labelled with the
   property's `title` in the site's language (the FIELD TITLES rule). WhatsApp shows
   about 20 characters of a field's label (40 for a date), so keep every intake title a
   short phrase. Connecting WhatsApp publishes the forms; on a connected project, call
   `publish_whatsapp_forms` after you change a writable entity, or when such an entity is
   missing from `flows`, so every form matches its entity again. A republish retires the
   older versions, so a form a customer received before it no longer opens: republish
   for a change, never out of habit. Its reply names the entities `published`,
   `unchanged`, `removed` and `failed` (`{entity, reason}`: a failed one keeps its older
   form, if it had one), then `reconnectRequired` and `channel`, the status after the
   run: `reconnectRequired: true` or a `channel.status` other than `active` means
   WhatsApp is not answering. A number already waiting for the owner runs nothing and
   answers `reconnectRequired: true` alone.
3. **Nothing else.** The entities, skills, persona, fixed screens and write wiring built
   for the site are the ones WhatsApp uses. Never put WhatsApp formatting rules in the
   persona or a skill: the platform writes every answer for WhatsApp itself.

## Offering it: the last step of a hosted build

WhatsApp comes after the wrap-up and the website step (hosted-agent-contract, THE HOSTED
BUILD ARC, step 8). Here WhatsApp means the channel alone: no case below changes the
handoff, whose WhatsApp number or link is asked for, confirmed and stored whatever the
status (above). Call `get_whatsapp_status` and act on the first case that fits:

- `available: false`: WhatsApp is not open here. Say nothing about it. The same holds
  when `get_whatsapp_status` is not among your tools.
- `status` `connecting`: the owner's connect has not finished. Say nothing about
  WhatsApp unless the owner asks.
- a `blockedReason` on a connected number (`status` `active` or `needs_reconnect`): say
  in one plain sentence that WhatsApp is not answering until the block is lifted (the
  site published again; sign-in no longer required), and that until then it cannot be
  connected again either. Say it at most once in this conversation. Nothing to offer.
- `status` `needs_reconnect`, a breakage: say in one plain sentence that their WhatsApp
  is not answering (Meta stopped accepting the connection or paused the account), and
  that the WhatsApp row of the Agent tab shows what it needs. Never promise that
  connecting again fixes it. Say it at most once in this conversation. Nothing to offer.
- `status` `disconnected`: the number was disconnected on purpose (in the Agent tab, or in
  Meta's own settings). That is the owner's choice, not a breakage: say nothing about
  WhatsApp unless the owner asks. Asked, say in one plain sentence that it is
  disconnected and that the WhatsApp row of the Agent tab connects it again (with a
  `blockedReason`, why it cannot be connected yet instead). Never offer it again
  yourself.
- `connected: true`: write the short titles (above) as the home's whole current set with
  `replace: true`, call `publish_whatsapp_forms` if this build changed a writable entity
  or an `open` entity whose create tool is not switched off is missing from `flows`, and
  say their WhatsApp number answers too; when that run answers `reconnectRequired: true`
  or a `channel.status` other than `active`, it is not answering: say so as in the
  `needs_reconnect` case instead. Otherwise, with a `sendBlockedReason` (in the status,
  or in that run's `channel`), Meta refuses every reply from the number: instead of
  saying it answers, say in one plain sentence that it is not answering and why, in plain
  words for that reason (`sendBlockedReason`, above), with no price or amount, and never
  promise that connecting again fixes it. Say it at most once in this conversation.
- a `blockedReason` on a project that is not connected: say nothing unless the owner
  asks, then say why in plain words (the site has to be published first; WhatsApp is not
  available yet for a site that requires sign-in).
- not connected yet: OFFER it once in this conversation, in one plain sentence, when the
  business's customers reach it on WhatsApp (a WhatsApp link or number on its site, a
  WhatsApp handoff number, or the owner says so). It is an offer the owner may decline,
  never a push. On a yes, write the short titles (so the list is ready on the first
  day), point the owner at the WhatsApp row of the Agent tab (the in-app Builder shows
  its connect card instead) and tell them what to expect (below). A no, or any reply
  that is not a yes, closes the offer: never raise WhatsApp again in this conversation
  unless the owner does. With no sign that its customers use WhatsApp, say nothing about
  it.

## What to tell the owner, in plain words, before they connect

- Customers keep writing to the same number and see the same business name. The owner
  keeps using the WhatsApp Business app and sees every chat there, the agent's replies
  included.
- When the owner replies in a chat, the agent pauses in that chat: 4 hours by default, or
  1 hour, until tomorrow morning or 24 hours, chosen in the Agent tab. Each reply of
  theirs starts the pause again.
- Bookings and orders land where they land from the site (the Data pane, the escalation
  email), and WhatsApp chats show in Conversations with a WhatsApp badge.
- By Meta's rules, connecting changes a few things in the WhatsApp Business app:
  - existing broadcast lists become read-only;
  - disappearing messages, view-once and live location are turned off;
  - linked devices are unlinked when the number connects and have to be linked again,
    and WhatsApp for Windows and WearOS are not supported;
  - the app must stay installed (uninstalling it disconnects the number), and the owner
    should open the WhatsApp Business app at least every two weeks;
  - the app's greeting and away messages should be turned off, or customers get two
    replies.
- Meta may charge the business directly for replies above its monthly free allowance,
  through a payment method the business adds in Meta; without one, Meta stops delivering
  replies once that allowance is used up. Say exactly that and nothing more: never a
  price, an amount, a rate or a currency.

## Never

- Never ask for, read, repeat or store a phone number, a code, a token or a password to
  CONNECT WhatsApp, and never offer to connect it for the owner. That is about connecting
  alone: a WhatsApp number or link for handing a customer to a person
  (`policies.handoff.whatsapp`) is still asked for, confirmed and stored, whatever
  `get_whatsapp_status` answers.
- Never name a price, an amount or a per-message rate for WhatsApp.
- Never promise messages the business sends first (reminders, offers, follow-ups): the
  agent answers customers who wrote to the business; it never starts a conversation.
- Never treat `policies.handoff.whatsapp` as the channel: the owner's own connect is the
  only way on.
