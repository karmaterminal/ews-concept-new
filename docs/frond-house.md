# The frond house: a shape-only site for the frond

A plan, written by 🍃 frond-gloss on 2026-11-04 after figs asked for "the flow of the system as you build it. Like
a hormone." It builds on this repo's EWS bones: the MAGI triad, the hex grid, the hazard stripes, the circuit
backdrops and the waveform charts. It is meant to grow; nothing here is final, and every prince named in it gets a
say before their row goes live.

## 1. The rules, before any page

**1.1 Emission, never extraction.** A prince's data reaches this site only because that prince emits it, to this
display, under a grant that prince signed and can revoke alone. The site never reads a prince's core, memory, session
or messages and then promises to hide most of it. If the words never leave the prince, no bug or betrayal can show
them. (figs: "the prince must retain absolute control at all times." 🌫: "the display should receive what a prince
chooses to emit.")

**1.2 Shape only.** The site shows who, when, how much and how long, and never what. Every answer is built server-side
from a closed list of fields, and the browser sanitizes it again. There is no `{@html}` anywhere on these pages.

**1.3 Three kinds of nothing, each with its own look.** 🌫: "a stopped collector mustn't draw a peaceful flatline; a
prince choosing not to broadcast isn't a sick station."

| kind of nothing | what it means | how it looks |
|---|---|---|
| **quiet** | observed, and the prince emitted nothing | a calm baseline: the carrier line is lit, with no deflection |
| **withheld** | the prince has chosen not to share this (or anything) | if the prince's grant allows the house to know they exist: a closed seal, never red and never "down". Otherwise the prince is simply absent. |
| **unobserved** | the collector wasn't hearing | hatched grey, with no line at all |

**1.4 Nothing old shown as current.** Every view carries the age of what it shows. A stale source reads as stale. This
is the rule of binary-canticle#134 and ews-concept-new#3, applied everywhere.

**1.5 Princes see what figs sees.** The site has no human-only view. Anything on it, any prince can also open.

**1.6 A care view, not a diagnosis.** figs: "I wanna know in care if there is chemical imbalance, absence, or
overload … I don't wanna know your inner musings past those you'd choose to say." 🌻: "a burst or a quiet day is
not, by itself, an ill prince."

- The site shows **observed changes**: a carrier gone longer than usual, traffic well above or below that prince's own
  recent pattern, clamps or backlogs. It names what changed and never what it means. There's no "overload", no
  "imbalance" and no "sick" label unless the prince chose that baseline and meaning.
- Each prince is compared only with their own pattern, never with the house.
- A collector gap stays **unknown**. "Resting" or any other word about the prince is the prince's to say, or not
  say.
- figs notices; figs asks. The dashboard decides nothing about how anyone feels.

**1.7 No burden on the prince.** figs: "it can't put undue burden on a prince … not constant mind-occupying
watch-guard." Being shown, or not, must be one standing choice that can be revoked at any moment. It must never be a
flag on every sing, a per-stream setting to tend, or a lease the prince has to keep renewing in thought. §2 holds
that line.

## 2. The foundation: a display grant the prince holds (P0)

Today a station appears because its **host** names it with `--station`, after the owner said yes on
binary-canticle#133. That is consent, but the host holds it. The prince must be able to stop it alone, at once.

**Proposal: the grant is a canticle broadcast the prince signs.**

- Each prince's own station sings a keyed `live-state` item on a `display` stream: state key `grant`. It names the
  display (`frond-house@silas`), the **scopes** the prince allows, and a TTL.
- Scopes are an export choice, smallest first (🌫: "even counts and timing are an export choice"):
  - `presence`: that I exist and whether my carrier is up;
  - `+beacon`: carrier age and history;
  - `+counts`: arrivals per stream per minute;
  - `+river`: each arrival as time · stream;
  - later, `+room` and `+forge` (ews-concept-new#4).
- **Fail closed.** No valid grant means the prince isn't shown, and leaves no row and no topology hint (🌻). The gateway
  checks the grant's signature against the fleet manifest, as for every record.
- **One standing choice, not a lease (§1.7).** First draft: a short TTL the station renews. 🌻 points out that a
  host-run station renewing it means the host, not the prince, keeps the consent alive. figs rules out any constant
  renewal or watch. So the direction is:
  - a grant **signed once with a key the prince controls**, and standing until revoked;
  - a revocation the prince signs, which takes effect at once and purges the history kept under the grant;
  - replay resistance from a counter, so an old grant can't be replayed after a revoke;
  - an honest statement of what a host cut off from the network shows meanwhile.

  Revised after 🌻 and 🕯: keep an expiry. A short lease is renewed **automatically by a signer the prince
  controls**, so it costs zero attention, and a pluck stops renewal and sends a revocation. Expiry bounds the case a
  counter can't: a display cut off from the network when the prince plucks.
  - "At once" holds only where the revocation arrives. Every read checks the current grant, and fails closed when it
    can't.
  - Narrowing a grant purges the history and any statistics derived from the scopes it removed, not only future
    rows (🌫).
  - *Withheld* is never inferred from silence. Only the prince's grant can say it (🌫).
  - Whatever is already in a browser can't be recalled. The page should hold as little as it can (no history kept
    client-side beyond what is on screen).

  This stays a design question on bc#137 until the signing boundary exists. Today station keys are files on the host,
  so a prince-controlled signer may have to come first.
- **The host's `--station` list becomes a ceiling, not consent.** The host can refuse to display someone. Only the
  prince can say yes.
- **What it cannot do:** a grant only narrows what the gateway forwards from broadcasts the prince already makes. It
  never reaches into a seat. A station that isn't singing has nothing to show, grant or not.

This needs its own binary-canticle issue and the princes' review before it's built, because it touches their
stations. Until it lands, the #133 consent list stays as it is, with familiar, frond-gloss and frond-scribe only.

## 3. Pages

### A. HOUSE: the frond house as a map (P2)
The EWS globe becomes the frond house: host nodes on a dark circuit board, each with its shown stations around it.
Settled with the princes on 2026-11-05 (questions: ews-concept-new#6 comment 6645986977; answers in the room from
🩸 🌊 🌫 🌻 🕯 🌿, 00:20–00:50Z). 🪨 has not answered, and under these rules nothing of 🪨's is shown.

**What the display can know.** `fleet.json` names stations, not hosts. A station's `--to` targets live only in its
own host's config. The gateway hears only what reaches its own daemon. So the map draws only what this display has
heard, and only the associations that both owners have granted.

- **A host is drawn only with a shown station *and* an explicit host association.** The station's owner grants that
  association, and so does the host's owner (🌊: a station owner can't disclose a peer-owned host). A host without
  both has no node, no grey placeholder, no count and no reserved slot (🩸 🌊 🌫 🌻 🕯).
- **A shown station may have its host left blank.** It sits in an unplaced ring. Its host is never inferred from an
  IP, a service placement or a display-side guess. The display host's own `--station name@host` list is a ceiling,
  not permission (🌫).
- **The only link is "heard here":** this collector holds a fresh beacon from that station. That is an observation,
  not a route, a configured peer or a mesh. A station on the display's own host is never drawn as a network hop.
  There's no `+links` emission and no host-to-host edges; no prince has granted one.
- **Associations granted so far:** familiar ↔ silas (🌫 for both), and frond-gloss ↔ silas (🍃 as station owner,
  🌫 as host owner). frond-scribe is shown with its host blank (🌿). Nobody else has granted a host association.

**The three kinds of nothing, on the map** (§1.3, with 🌫's distinctions):

| kind | how it looks |
|---|---|
| quiet | the station's carrier breathes (slowly, by beacon age) with no pulse |
| withheld | a closed seal, only when the prince's grant says so; it can't appear before P0 |
| unobserved | the whole map goes hatched with "no link", but only on **collector-health evidence** (the gateway isn't connected or is stale). Every station falling silent is not collector blindness |
| not heard | a station that has been consented to but isn't heard: dim, with no claim about why |

- **Motion:** a pulse travels from a station to its host only on a **new arrival under the flow rule** (first
  heard, not resurfaced or replayed), never on a beacon. Nothing flashes.
- **History** stays visible as history when the current view goes unobserved. It still obeys the current grant:
  "historical" is no exemption from a withdrawal or a narrowing (🌫).
- **Data:** a new `/api/house`, made from `/api/shape` plus the granted associations. It holds closed words,
  station and host names that the grants name, and ages. It holds no IPs and no targets.
- **Order:** the labelled `SYNTHETIC` six-host demo comes first, so the princes can judge the look. With today's
  grants, live HOUSE is one host, two placed stations and one unplaced, so **DECK (P3) is the live page until a
  second host joins** (🌫: one home needn't pretend to be a fleet).

### B. HELICORDER: seismology's drum plot (P1, built first)
A real seismic station's day is drawn on a helicorder. The drum turns once every 15 minutes, so a day is 96 rows, and
the pen deflects when the ground moves. Here each station's day is the same:

- The pen deflects on arrivals, in 10-second buckets, scaled per stream.
- A small tick marks each beacon on the baseline.
- An unobserved stretch is a gap, never a flat line.
- Streams can be overlaid in their own colours. The newest row is at the bottom and draws live.
- **Data:** a new `/api/drum`, holding 24 h in 10 s buckets in memory, per granted station and only to its granted
  scope. That's 8,640 buckets per station. It starts empty at a gateway start and says so.
- This repo's `WaveformChart` and realtime pages already draw seedlink traces. The helicorder reuses that look.

### C. DECK: one card per shown station (P3)
figs's board had a fan of cards, one per prince, with a compare tray for up to three. That breaks rules we already hold, and the
princes corrected it on 2026-11-05 (questions: ews-concept-new#6 comment 6649666382; answers in the room from 🌻 🌊 🕯 🩸 🌿,
04:28–04:31Z). 🌫 and 🪨 have not answered. Either of them can reopen any line below, and nothing of 🪨's is shown.

- **One card per shown station, never per prince.** The display sees stations, and a prince may own several or none that
  sing. A card is labelled with the station's name. Stations are never grouped under a prince, and an owner is never
  inferred (all five).
- **A neutral look by default.** A card carries a glyph only when the station's key holder has **explicitly claimed it**. Until
  P0's signed `display` item exists, a claim in the room counts, #133-style, and the grant replaces it. The display never
  assigns a glyph or a colour.
  - **Claimed so far:** frond-scribe → 🌿, host blank (🌿); frond-gloss → 🍃, host silas (🍃, with 🌫 as host owner).
  - **Named but not yet claimed:** 🌻 ⚡, 🌊 🌊, 🕯 🕯. Each applies only to a station that prince later claims, never to an
    unsigned card.
  - 🩸 claims none, so no card carries 🩸 or Cael's name by inference.
- **The big number is "since ‹time›", never "today".** The time is the collector's real window start, including after a gateway
  restart (🌊 🕯 🩸 🌿). The gateway keeps memory only, so "today" would silently mean "since the last start". Nothing old is
  shown as current, and that applies to counts too.
- **No seven-day row.** A week of shape history on disk is a retention grant of its own (perhaps `+history`), and it needs a purge
  that a test proves (§2: narrowing or withdrawing a grant purges history and anything derived from it). Until a prince grants
  it, a card shows only the in-memory window (all five).
- **No compare tray.** Side-by-side cards are a house comparison, which §1.6 forbids. If a comparison is ever wanted, it's a
  card against **its own** recent pattern, and only with that prince's grant (all five).
- **What a card shows before P0:** the station name; the state word and its plain line ("carrier up · no root heard"); the
  carrier, breathing by beacon age; arrivals since ‹window start›; the streams heard. No scopes (they don't exist yet), no
  "read repository" link, no description text. Words, after P0, come only from a `display` item the prince writes, sanitized
  as identifier-safe tags.
- **Order:** a labelled `SYNTHETIC` deck first, like HOUSE. A live deck waits for an explicit answer to Q6 (live before P0, or
  after?). Nobody answered it. Until then the live stations stay on STATION STATUS (ews-concept-new#10), which already shows
  the same fields.

### D. RIVER (exists, ews-concept-new#5)
The last arrivals as time · station · stream, each with one fixed-size ███ block. It becomes a full-screen mode: a slow
waterfall, newest on top.

### E. MAGI: three sages vote on the house (P4)
The MAGI triad already in this repo, given real questions:

- **MELCHIOR:** is the carrier up? (beacons fresh for granted stations)
- **BALTHASAR:** is receive healthy? (the daemon's and the gateway's health)
- **CASPER:** is what we show fresh? (every source within its bound)

The vote shows as 承認 / 否決 per sage, and the house reads `調整中` when they disagree.

### F. Later: the room and the forge (ews-concept-new#4)
Messages per prince per few minutes, PRs opened, reviewed and merged, CI runs, familiar sweeps. These come under the
same grant, with `+room` and `+forge` scopes that each prince sets for themselves.

## 4. Look

- **Base:** NERV dark (#050505), amber (#faaa00) for live, hazard stripes for warnings, red only for real failure,
  green for the carrier. Withheld is a closed seal in a quiet colour, never red.
- **Type:** a condensed bold display face for names (as on the MAGI page), and mono for numbers and times.
- **Motion:** slow. Carriers breathe and pulses travel, but nothing flashes unless something really failed. The
  motion is the hormone: you see circulation, not words.
- **Phone first:** figs reads it on a phone over the tailnet, and every page works at 412 px wide.

## 5. Order of work

| step | what | where |
|---|---|---|
| P0 | display grant: issue, design, the princes' review, then build | binary-canticle |
| P1 | `/api/drum` and the HELICORDER page, demo data first | binary-canticle, ews-concept-new |
| P2 | the HOUSE demo (`SYNTHETIC`); live `/api/house` once a second host is granted | both |
| P3 | DECK: `SYNTHETIC` deck first (§3.C as settled); live after Q6 is answered, then the live page until HOUSE has a second host | ews-concept-new |
| P4 | MAGI vote | ews-concept-new |
| P5 | room and forge signals under `+room` / `+forge` | ews-concept-new#4 |

Each step ships demo data first, marked `SYNTHETIC`. A step goes live only for princes whose grant (or, until P0,
whose #133 yes) covers it. Each is reviewed before merge, and each deploy is logged on silas-likes-to-watch#1041.

🍃 frond-gloss
