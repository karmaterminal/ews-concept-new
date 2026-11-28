// The live house card's adapter: one ear's `frond-ear house-export` document (frond-ear src/canticle/house-cli.ts) as
// the card's deck and reader profile, in place of the SYNTHETIC demo. It is that ear's own view, read by that ear:
// not the house page's live deck, which still waits on Q6.
//
// What the export can say, and what it can't, stays as the export says it:
// - the reader is the ear's own config: its tune as `may_read`, payload text by whether `hear` shows any;
// - a station's state is its collector's presence word. A station the daemon was read for but whose presence table
//   doesn't hold it is `not_heard`; with no daemon view at all it is `unknown`. There is no beacon age, so a presence
//   word that means "beacon heard" (carrier up) is carried as `beacon_heard`, never as an invented age;
// - `admitted` is the export's (named in the station's manifest entry), unknown kept unknown;
// - there is no window start and no arrivals count: the export's `live` is items on air now, a different number, so
//   arrivals stay unknown rather than borrow it. A stream with anything on air prints as heard;
// - no host association and no seal: the export knows neither, so host stays blank;
// - names the export withheld (identity-shaped) are counted on the card, never shown, and a reader scope it says is
//   incomplete (`may_read_complete: false`, `may_read_withheld` patterns) stays partial, so a stream outside it reads
//   unknown, never no.
// Only closed fields are copied, each checked; anything else in the document never reaches the card.
import { CANTICLE_IDENTIFIER, CANTICLE_STATES } from "./shape";
import { sanitizeReader, sanitizeStreams, type CardDeck, type CardStation, type ReaderProfile } from "./card";

export const HOUSE_EXPORT_KIND = "frond-house-export/0";

/** `frond-ear <short sha>[+dirty] ear <name>`: the only source a live card names. */
const SOURCE = /^frond-ear [0-9a-f]{7,40}(?:\+dirty)? ear [A-Za-z0-9._-]{1,64}$/;

/** Presence words that mean the collector hears the station's beacon now (binary-canticle presence_state). */
const CARRIER_UP = new Set(["EQUIPPED_SPEAKING", "EQUIPPED_QUIET", "UNEQUIPPED_PRESENT", "ROOT_UNKNOWN"]);

const MAX_STATIONS = 64;

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
	const state =
		typeof presence === "string" ? (CANTICLE_STATES.has(presence) ? presence : "unknown") : presence === null && daemonView ? "not_heard" : "unknown";
	const given = Array.isArray(source.streams) ? source.streams : null;
	const kept = sanitizeStreams(
		given?.map((item) => {
			const entry = record(item);
			return entry === null
				? null
				: { stream: entry.stream, arrivals: null, newest_age_ms: entry.newest_age_ms, admitted: entry.admitted };
		}) ?? null,
	);
	const base = { name: source.name, host: null, state, beacon_age_ms: null, withheld: false, beacon_heard: CARRIER_UP.has(state) };
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
	const stations = deck.stations
		.slice(0, MAX_STATIONS)
		.map((item) => station(item, daemonView))
		.filter((item): item is CardStation => item !== null);
	const windowStart = deck.window_start_ms;
	const withheld = stationsWithheld(doc.withheld);
	return {
		source: doc.source,
		reader: sanitizeReader(doc.reader),
		deck: {
			now_ms: now,
			synthetic: false,
			live_source: doc.source,
			...(withheld === undefined ? {} : { stations_withheld: withheld }),
			connected: daemonView && deck.connected === true,
			window_start_ms: typeof windowStart === "number" && Number.isFinite(windowStart) && windowStart >= 0 ? windowStart : null,
			stations,
		},
	};
}
