// The live house card's adapter: one ear's `frond-ear house-export` document (frond-ear src/canticle/house-cli.ts) as
// the card's deck and reader profile, in place of the SYNTHETIC demo. It is that ear's own view, read by that ear:
// not the house page's live deck, which still waits on Q6.
//
// What the export can say, and what it can't, stays as the export says it:
// - the reader is the ear's own config: its tune as `may_read`, payload text by whether `hear` shows any;
// - a station's state is its collector's presence word, and only an observed word gives heard or not heard. A
//   station the presence table doesn't hold is `unknown`, said as absent from the table (it is capped and empty
//   before its first snapshot). There is no beacon age, so a presence word that means "beacon heard" (carrier up)
//   is carried as `beacon_heard`, never as an invented age;
// - `admitted` is the export's (named in the station's manifest entry), unknown kept unknown;
// - there is no window start and no arrivals count: the export's `live` is items on air now, a different number, so
//   arrivals stay unknown rather than borrow it. A stream with anything on air prints as heard;
// - no host association and no seal: the export knows neither, so host stays blank;
// - names the export withheld (identity-shaped) are counted on the card, never shown, and a reader scope it says is
//   incomplete (`may_read_complete: false`, `may_read_withheld` patterns) stays partial, so a stream outside it reads
//   unknown, never no. A scope without `may_read_complete: true` is partial too;
// - the export's guide gaps are carried as names and counts, each with its plain line (./gaps); a name the card
//   doesn't know is counted as unreadable, never printed; stations the card can't show are counted.
// Only closed fields are copied, each checked; anything else in the document never reaches the card.
import { CANTICLE_IDENTIFIER, CANTICLE_STATES } from "./shape";
import { sanitizeReader, sanitizeStreams, type CardDeck, type CardStation, type ReaderProfile } from "./card";
import { knownGap } from "./gaps";

export const HOUSE_EXPORT_KIND = "frond-house-export/0";

/** `frond-ear <short sha>[+dirty] ear <name>`: the only source a live card names. */
const SOURCE = /^frond-ear [0-9a-f]{7,40}(?:\+dirty)? ear [A-Za-z0-9._-]{1,64}$/;

/** Presence words that mean the collector hears the station's beacon now (binary-canticle presence_state). */
const CARRIER_UP = new Set(["EQUIPPED_SPEAKING", "EQUIPPED_QUIET", "UNEQUIPPED_PRESENT", "ROOT_UNKNOWN"]);

const MAX_STATIONS = 64;
/** Station entries judged at all; past this, every one counts as not shown. */
const MAX_ENTRIES = 4096;
/**
 * The producer's own gap names (frond-ear house-cli.ts) are the card's gap table (./gaps): no other name prints
 * (🌫's nit). Room for every name it can emit; past this, an entry counts as unreadable.
 */
const MAX_GAPS = 64;

export type LiveCard = { deck: CardDeck; reader: ReaderProfile | null; source: string };

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function station(raw: unknown, daemonView: boolean): CardStation | null {
	const source = record(raw);
	if (source === null || typeof source.name !== "string" || !CANTICLE_IDENTIFIER.test(source.name)) return null;
	// A Discord id or a key id is never a station name here, even when it fits the identifier pattern.
	if (/^[0-9]{17,20}$/.test(source.name) || /^[0-9a-f]{16}$/i.test(source.name)) return null;
	const presence = source.presence;
	// Only an observed presence word says heard or not heard. Absent from the presence table is unknown: the table
	// is capped and empty before its first snapshot (🌿, ews#14).
	const state = typeof presence === "string" && CANTICLE_STATES.has(presence) ? presence : "unknown";
	const absent = presence === null && daemonView;
	const given = Array.isArray(source.streams) ? source.streams : null;
	const kept = sanitizeStreams(
		given?.map((item) => {
			const entry = record(item);
			// A live count the export couldn't give (null, or not a count) is carried as unknown, never as 0.
			const counted = entry !== null && typeof entry.live === "number" && Number.isInteger(entry.live) && entry.live >= 0;
			return entry === null
				? null
				: {
						stream: entry.stream,
						arrivals: null,
						newest_age_ms: entry.newest_age_ms,
						admitted: entry.admitted,
						...(counted ? {} : { on_air_unknown: true }),
					};
		}) ?? null,
	);
	const base = {
		name: source.name,
		host: null,
		state,
		beacon_age_ms: null,
		withheld: false,
		beacon_heard: CARRIER_UP.has(state),
		...(absent ? { presence_absent: true as const } : {}),
	};
	if (kept === null || given === null) return { ...base, streams: [], streams_known: "unknown", streams_given: null };
	if (source.streams_known !== "complete") return { ...base, streams: kept, streams_known: "partial", streams_given: null };
	return { ...base, streams: kept, streams_known: kept.length < given.length ? "partial" : "complete", streams_given: given.length };
}

/**
 * How many station names the export withheld (frond-ear's `withheld`, field `deck.stations`): undefined for none,
 * null when the list can't be read, so a malformed or missing list never reads as none withheld.
 */
function stationsWithheld(raw: unknown): number | null | undefined {
	if (!Array.isArray(raw)) return null;
	let total = 0;
	for (const item of raw) {
		const entry = record(item);
		if (entry === null) return null;
		if (entry.field !== "deck.stations") continue;
		if (typeof entry.count !== "number" || !Number.isInteger(entry.count) || entry.count < 0) return null;
		total += entry.count;
	}
	return total === 0 ? undefined : total;
}

/**
 * The reader profile as frond-ear means it. Its scope is complete only when the export says `may_read_complete:
 * true`; absent or not a boolean is incomplete (🌿 E-F2). A `*` stream matches nothing in frond-ear's tune matcher
 * (tune.ts), so it can't make anything readable: it is dropped and counted as left out (🌿 E-F4).
 */
function readerInput(raw: unknown): unknown {
	const source = record(raw);
	if (source === null) return raw;
	const patterns = Array.isArray(source.may_read) ? source.may_read : null;
	const star = patterns?.filter((p) => typeof p === "string" && p.endsWith(":*")).length ?? 0;
	const given = source.may_read_withheld;
	const valid = typeof given === "number" && Number.isInteger(given) && given >= 0;
	return {
		reader: source.reader,
		payload_text: source.payload_text,
		...(patterns === null ? {} : { may_read: patterns.filter((p) => !(typeof p === "string" && p.endsWith(":*"))) }),
		// A dropped star pattern is counted below, so the scope reads partial however the flag reads.
		may_read_complete: source.may_read_complete === true,
		...(star === 0
			? given === undefined
				? {}
				: { may_read_withheld: given }
			: { may_read_withheld: valid ? given + star : given === undefined ? star : given }),
	};
}

const nonNegativeInteger = (value: unknown): number | null =>
	typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/** frond-ear's `deck.left_out`, or null when it is missing or can't be read: never read as nothing left out. */
function leftOutOf(raw: unknown): NonNullable<CardDeck["coverage"]>["left_out"] {
	const left = record(raw);
	if (left === null) return null;
	const more = nonNegativeInteger(left.untuned_more);
	if (more === null || typeof left.truncated !== "boolean") return null;
	return { untuned_more: more, untuned_listed: nonNegativeInteger(left.untuned_listed), truncated: left.truncated };
}

/** The export's coverage (frond-ear's `deck.walk` and `deck.gaps`), as closed names and counts only. */
function coverageOf(deck: Record<string, unknown>): CardDeck["coverage"] {
	if (!Array.isArray(deck.gaps)) return null;
	const gaps: Array<{ name: string; count: number }> = [];
	let unreadable = 0;
	for (const item of deck.gaps) {
		const entry = record(item);
		if (
			entry === null ||
			typeof entry.name !== "string" ||
			!knownGap(entry.name) ||
			typeof entry.count !== "number" ||
			!Number.isInteger(entry.count) ||
			entry.count < 0 ||
			gaps.length >= MAX_GAPS
		)
			unreadable += 1;
		else gaps.push({ name: entry.name, count: entry.count });
	}
	return {
		walk: deck.walk === "complete" || deck.walk === "partial" ? deck.walk : null,
		gaps,
		unreadable,
		left_out: leftOutOf(deck.left_out),
	};
}

/** The card's deck and reader from a house export, or null when the document isn't one. */
export function cardFromExport(raw: unknown): LiveCard | null {
	const doc = record(raw);
	if (doc === null || doc.kind !== HOUSE_EXPORT_KIND) return null;
	if (typeof doc.source !== "string" || !SOURCE.test(doc.source)) return null;
	const now = doc.now_ms;
	if (typeof now !== "number" || !Number.isFinite(now) || now < 0) return null;
	const deck = record(doc.deck);
	if (deck === null || !Array.isArray(deck.stations)) return null;
	const daemonView = deck.view === "daemon";
	// Every entry is judged before the cap, so a malformed one never costs a good one its place; whatever the card
	// leaves out is counted on it (🌿, ews#14 E-F3).
	const stations: CardStation[] = [];
	let notShown = 0;
	for (const [i, item] of deck.stations.entries()) {
		if (i >= MAX_ENTRIES) {
			notShown += deck.stations.length - i;
			break;
		}
		const kept = station(item, daemonView);
		if (kept === null || stations.length >= MAX_STATIONS) notShown += 1;
		else stations.push(kept);
	}
	const windowStart = deck.window_start_ms;
	const withheld = stationsWithheld(doc.withheld);
	return {
		source: doc.source,
		reader: sanitizeReader(readerInput(doc.reader)),
		deck: {
			now_ms: now,
			synthetic: false,
			live_source: doc.source,
			...(withheld === undefined ? {} : { stations_withheld: withheld }),
			...(notShown > 0 ? { stations_not_shown: notShown } : {}),
			coverage: coverageOf(deck),
			connected: daemonView && deck.connected === true,
			window_start_ms: typeof windowStart === "number" && Number.isFinite(windowStart) && windowStart >= 0 ? windowStart : null,
			stations,
		},
	};
}
