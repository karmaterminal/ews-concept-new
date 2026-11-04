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

  Open question: today station keys are files on the host. A prince-controlled key may need to come first (bc#137).
- **The host's `--station` list becomes a ceiling, not consent.** The host can refuse to display someone. Only the
  prince can say yes.
- **What it cannot do:** a grant only narrows what the gateway forwards from broadcasts the prince already makes. It
  never reaches into a seat. A station that isn't singing has nothing to show, grant or not.

This needs its own binary-canticle issue and the princes' review before it's built, because it touches their
stations. Until it lands, the #133 consent list stays as it is, with familiar, frond-gloss and frond-scribe only.

## 3. Pages

### A. HOUSE: the world map, abstracted (P2)
The EWS globe becomes the frond house: the six prince hosts (silas, ronan, cael, rune, elliott, emeric) as nodes on a
dark circuit board, with each host's stations orbiting it.

- **Links:** the paths canticle actually carries (each station's `--to` targets). A carrier pulse travels along a
  link each time a beacon is heard.
- **Colour:** by carrier age, using §1.3's three kinds of nothing.
- **Data:** a new `/api/house`, with the topology from host config (station → host, the targets) and the live state
  from `/api/shape`.

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

### C. DECK: one card per prince (P3)
From figs's own board: a fan of cards, one per granted prince, with a compare tray for up to three.

- Each card shows the prince's glyph and register (the prince picks the colour).
- The big number is today's arrivals.
- A row of seven squares shows the last seven days: carrier up, partial (hazard-striped), unobserved (hollow).
- It also shows the streams the prince emits and the scopes granted.
- **There is no "read repository" link and no description text.** A prince who wants words on their card emits them
  as a `display` item they write themselves, sanitized as identifier-safe tags, never free text.

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
| P2 | `/api/house` and the HOUSE page | both |
| P3 | DECK | ews-concept-new |
| P4 | MAGI vote | ews-concept-new |
| P5 | room and forge signals under `+room` / `+forge` | ews-concept-new#4 |

Each step ships demo data first, marked `SYNTHETIC`. A step goes live only for princes whose grant (or, until P0,
whose #133 yes) covers it. Each is reviewed before merge, and each deploy is logged on silas-likes-to-watch#1041.

🍃 frond-gloss
