// The house card (frond-house §1.5, §3.C): DECK's pre-P0 card as plain text a prince can read, one card per shown
// station. Its one addition is 🌫's reader test: on every stream line, three facts kept apart.
//
// - station visible: this collector hears the station's beacon now;
// - stream admitted: the manifest grant admits this stream;
// - readable here: this session may read the stream's payload text, by the grant and its own reader profile (read
//   scope and payload-text setting). This is the *may* question only: whether anything is heard now is the visible
//   line's to say, so a yes on a station not visible now prints as "yes (when heard)".
//
// The card never says "readable" without a reader profile that says so, and anything unknown prints as "unknown",
// never as yes or no. It renders shape only: names, closed state words, ages and counts. No payload text reaches it.
import { CANTICLE_IDENTIFIER, carrierLevel, stateGloss } from "./shape";
import { DEMO_HOUSE, type House, type HouseStation } from "./house";

export type Tri = "yes" | "no" | "unknown";

export type CardStream = {
	stream: string;
	/** Arrivals since the collector's window start; null when unknown. */
	arrivals: number | null;
	newest_age_ms: number | null;
	/** Whether the manifest grant admits this stream; null when the display can't say. */
	admitted: boolean | null;
	/**
	 * A live export couldn't count what is on air here (its `live` was null: a held or muted board, or a stream its
	 * walk didn't reach). Never printed as quiet.
	 */
	on_air_unknown?: true;
};

export type CardStation = {
	name: string;
	/** The host, only when an association is granted (§3.A); null means left blank. */
	host: string | null;
	state: string;
	beacon_age_ms: number | null;
	withheld: boolean;
	streams: CardStream[];
	/**
	 * What the display knows about this station's streams: `complete` (the list is the whole list, possibly empty),
	 * `unknown` (no stream knowledge at all), or `partial` (entries were left out: over the cap, or malformed).
	 */
	streams_known: "complete" | "unknown" | "partial";
	/** Entries given for this station, before any were left out; null when unknown. */
	streams_given: number | null;
	/**
	 * Only when no beacon age is given (an ear's export): whether the collector's own presence word says the beacon is
	 * heard now. Never inferred, and never stands in for an age.
	 */
	beacon_heard?: boolean;
	/**
	 * The station's state is unknown because the collector's presence table doesn't hold it: that table is capped
	 * and empty before its first snapshot, so absence is no evidence of "not heard" (🌿, ews#14).
	 */
	presence_absent?: true;
};

export type CardDeck = {
	now_ms: number;
	synthetic: boolean;
	/** A live deck's source (one ear's `frond-ear house-export`); absent for the demo and the house page. */
	live_source?: string;
	/** Station names a live export withheld (identity-shaped); null when how many is unknown. Absent: none. */
	stations_withheld?: number | null;
	/** Stations the card left out: past its cap, or malformed. Absent: none. */
	stations_not_shown?: number;
	/**
	 * A live export's coverage: whether its guide walk was whole, and the gaps it named (closed names with counts;
	 * `unreadable` counts entries that weren't one). Null: the export gave no gap list. Absent: not a live deck.
	 */
	coverage?: {
		walk: "complete" | "partial" | null;
		gaps: Array<{ name: string; count: number }>;
		unreadable: number;
		/**
		 * The export's `left_out`, kept apart from the walk (🌫): a whole walk can sit beside a capped untuned list.
		 * Null when the export didn't say, or said it in a way the card can't read.
		 */
		left_out: { untuned_more: number; untuned_listed: number | null; truncated: boolean } | null;
	} | null;
	connected: boolean;
	/** The collector's real window start (§3.C: "since ‹time›", never "today"); null when unknown. */
	window_start_ms: number | null;
	stations: CardStation[];
};

export type ReaderProfile = {
	reader: string;
	/** Whether payload text is enabled for this session; null when unknown. */
	payload_text: boolean | null;
	/** `station:stream` patterns this reader may read (`*` for a whole field); null when unknown. */
	may_read: string[] | null;
	/**
	 * Set only when `may_read` is not the whole scope (a partial list is not a total, as for streams): how many
	 * patterns the card didn't keep (past the cap, or malformed) plus those the source withheld (`may_read_withheld`),
	 * or null when how many is unknown. A stream outside a partial scope reads unknown, never no.
	 */
	may_read_left_out?: number | null;
};

export type StreamReading = { visible: Tri; admitted: Tri; readable: Tri; why: string | null };

const NOT_HEARD_STATES = new Set(["not_heard", "UNOBSERVABLE", "UNOBSERVABLE:signed_off"]);
const PATTERN_PART = /^(?:\*|[A-Za-z0-9._-]{1,64})$/;

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const MAX_CARD_STREAMS = 16;

export function sanitizeStreams(raw: unknown): CardStream[] | null {
	if (!Array.isArray(raw)) return null;
	const seen = new Set<string>();
	const out: CardStream[] = [];
	for (const item of raw.slice(0, MAX_CARD_STREAMS)) {
		if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
		const source = item as Record<string, unknown>;
		if (typeof source.stream !== "string" || !CANTICLE_IDENTIFIER.test(source.stream)) continue;
		if (seen.has(source.stream)) continue;
		seen.add(source.stream);
		const arrivals = nonNegativeNumber(source.arrivals);
		out.push({
			stream: source.stream,
			arrivals: arrivals === null ? null : Math.floor(arrivals),
			newest_age_ms: nonNegativeNumber(source.newest_age_ms),
			admitted: typeof source.admitted === "boolean" ? source.admitted : null,
			...(source.on_air_unknown === true ? { on_air_unknown: true as const } : {}),
		});
	}
	return out.sort((a, b) => (a.stream < b.stream ? -1 : a.stream > b.stream ? 1 : 0));
}

/**
 * The card's deck from the house page's station data (already sanitized by `sanitizeHouse`), the streams the
 * display knows per station, and the collector's window start. A withheld station keeps no streams.
 */
export function deckFromHouse(
	house: House,
	streams: Record<string, unknown[]>,
	window_start_ms: number | null,
): CardDeck {
	const station = (item: HouseStation, host: string | null): CardStation => {
		const base = { name: item.name, host, state: item.state, beacon_age_ms: item.beacon_age_ms, withheld: item.withheld };
		const raw = item.withheld || !Object.hasOwn(streams, item.name) ? undefined : streams[item.name];
		const kept = raw === undefined ? null : sanitizeStreams(raw);
		if (kept === null) return { ...base, streams: [], streams_known: "unknown", streams_given: null };
		const given = (raw as unknown[]).length;
		return { ...base, streams: kept, streams_known: kept.length < given ? "partial" : "complete", streams_given: given };
	};
	return {
		now_ms: house.now_ms,
		synthetic: house.synthetic,
		connected: house.connected,
		window_start_ms: nonNegativeNumber(window_start_ms),
		stations: [
			...house.hosts.flatMap((host) => host.stations.map((item) => station(item, host.name))),
			...house.unplaced.map((item) => station(item, null)),
		],
	};
}

const MAX_READ_PATTERNS = 64;
/** Entries looked at past the cap, to tell a duplicate from a lost pattern; past this, every one counts as lost. */
const MAX_READ_ENTRIES = 4096;

function validPattern(pattern: unknown): pattern is string {
	if (typeof pattern !== "string") return false;
	const at = pattern.indexOf(":");
	return at >= 0 && PATTERN_PART.test(pattern.slice(0, at)) && PATTERN_PART.test(pattern.slice(at + 1));
}

export function sanitizeReader(raw: unknown): ReaderProfile | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const source = raw as Record<string, unknown>;
	if (typeof source.reader !== "string" || !CANTICLE_IDENTIFIER.test(source.reader)) return null;
	let may_read: string[] | null = null;
	let left_out = 0;
	if (Array.isArray(source.may_read)) {
		may_read = [];
		// Every entry is judged, not just the first 64: a pattern the card can't keep makes the scope partial, so
		// a stream outside the kept part reads unknown. A duplicate of a kept pattern loses nothing.
		for (const [i, pattern] of source.may_read.entries()) {
			if (i >= MAX_READ_ENTRIES) {
				left_out += source.may_read.length - i;
				break;
			}
			if (!validPattern(pattern)) left_out += 1;
			else if (may_read.includes(pattern)) continue;
			else if (may_read.length >= MAX_READ_PATTERNS) left_out += 1;
			else may_read.push(pattern);
		}
	}
	// What the source itself withheld (frond-ear's house-export: identity-shaped tune patterns): its count is added
	// to the card's own. A source that says its scope is incomplete without a usable count, or gives a count that
	// isn't one, leaves how many unknown. Nothing a source says can make a partial scope whole.
	const flagged = source.may_read_complete === false;
	const given = source.may_read_withheld;
	const counted = typeof given === "number" && Number.isInteger(given) && given >= 0 ? given : undefined;
	const unknownCount = (given !== undefined && counted === undefined) || (flagged && (counted === undefined || counted === 0));
	const total = left_out + (counted ?? 0);
	return {
		reader: source.reader,
		payload_text: typeof source.payload_text === "boolean" ? source.payload_text : null,
		may_read,
		...(may_read === null ? {} : unknownCount ? { may_read_left_out: null } : total > 0 ? { may_read_left_out: total } : {}),
	};
}

function inScope(may_read: string[], station: string, stream: string): boolean {
	return may_read.some((pattern) => {
		const at = pattern.indexOf(":");
		const s = pattern.slice(0, at);
		const t = pattern.slice(at + 1);
		return (s === "*" || s === station) && (t === "*" || t === stream);
	});
}

/** Whether this collector hears the station's beacon now. A collector with no link knows nothing (§1.3). */
export function stationVisible(station: CardStation, deck: CardDeck): { visible: Tri; why: string } {
	if (!deck.connected) return { visible: "unknown", why: "the collector has no link, so this is unobserved, not offline" };
	if (NOT_HEARD_STATES.has(station.state)) return { visible: "no", why: "its beacon is not heard here" };
	if (station.state === "unknown") {
		return {
			visible: "unknown",
			why:
				station.presence_absent === true
					? "it is absent from the ear's presence table, which is capped and empty before its first snapshot: unknown, not unheard"
					: "receive is degraded or a gap",
		};
	}
	if (station.beacon_age_ms === null) {
		return station.beacon_heard === true
			? { visible: "yes", why: "its presence word says its beacon is heard; no beacon age given" }
			: { visible: "unknown", why: "no beacon age" };
	}
	if (carrierLevel(station.beacon_age_ms) <= 0) return { visible: "no", why: "its last beacon is stale" };
	return { visible: "yes", why: "its beacon is heard" };
}

/**
 * The three facts for one stream. Readable here is admitted × payload text × read scope, and nothing about whether
 * the station is heard now (that is `visible`). It is a conjunction: any one definite no makes it no, with that
 * reason; otherwise any unknown makes it unknown; it is yes only when every part is a known yes. A yes on a station
 * not visible now carries "when heard", so it never reads as on air now.
 */
export function streamReading(
	station: CardStation,
	stream: string,
	deck: CardDeck,
	reader: ReaderProfile | null,
): StreamReading {
	const visible = stationVisible(station, deck).visible;
	const entry = station.streams.find((item) => item.stream === stream);
	const admitted: Tri = entry?.admitted === true ? "yes" : entry?.admitted === false ? "no" : "unknown";

	const noes: string[] = [];
	const unknowns: string[] = [];
	if (admitted === "no") noes.push("the manifest grant does not admit this stream");
	if (admitted === "unknown") unknowns.push("the grant's answer is unknown");
	if (reader === null) {
		unknowns.push("no reader profile");
	} else {
		if (reader.payload_text === false) noes.push("payload text is off for this session");
		if (reader.payload_text === null) unknowns.push("this session's payload-text setting is unknown");
		if (reader.may_read === null) unknowns.push("this reader's read scope is unknown");
		else if (!inScope(reader.may_read, station.name, stream)) {
			if (reader.may_read_left_out === undefined) noes.push(`${station.name}:${stream} is outside this reader's read scope`);
			else unknowns.push(`${station.name}:${stream} is outside the part of this reader's read scope the card kept; the scope is partial`);
		}
	}

	if (noes.length > 0) return { visible, admitted, readable: "no", why: noes.join("; ") };
	if (unknowns.length > 0) return { visible, admitted, readable: "unknown", why: unknowns.join("; ") };
	return { visible, admitted, readable: "yes", why: visible === "yes" ? null : "when heard" };
}

function iso(ms: number): string {
	return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function age(ms: number | null): string {
	if (ms === null) return "none heard";
	if (ms < 60000) return `${(Math.floor(ms / 100) / 10).toFixed(1)} s ago`;
	if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
	return `${Math.floor(ms / 3600000)} h ago`;
}

function streamsLine(station: CardStation, heard: CardStream[]): string {
	if (station.streams_known === "unknown") return "unknown (no stream knowledge for this station)";
	// An empty list that isn't known whole was never heard as quiet: it lists nothing, that is all.
	if (station.streams_known === "partial" && station.streams.length === 0) return "none listed (more may exist)";
	// A count the export couldn't give is never "none heard" (🌿, ews#14 W-1).
	const unknown = station.streams.filter((item) => item.on_air_unknown === true && !heard.includes(item)).length;
	const names = heard.map((item) => item.stream).join(", ");
	const text =
		unknown > 0
			? heard.length === 0
				? "not known (the board was held, muted or not read)"
				: `${names}; ${unknown} more not known`
			: heard.length > 0
				? names
				: "none heard";
	// The not-shown suffix stays whatever the counts say (🌿 round 3).
	if (station.streams_known !== "partial") return text;
	if (station.streams_given === null) return `${text} (more may exist)`;
	return `${text} (+${station.streams_given - station.streams.length} not shown)`;
}

function arrivalsLine(station: CardStation, deck: CardDeck): string {
	if (deck.window_start_ms === null) return "unknown (no window start)";
	if (station.streams_known === "unknown") return "unknown (no stream knowledge for this station)";
	if (station.streams.some((item) => item.arrivals === null)) return "unknown";
	const total = station.streams.reduce((sum, item) => sum + (item.arrivals ?? 0), 0);
	if (station.streams_known === "partial") {
		if (station.streams_given === null) return `at least ${total} since ${iso(deck.window_start_ms)} (more stream entries may exist)`;
		const given = station.streams_given;
		return `at least ${total} since ${iso(deck.window_start_ms)} (${given - station.streams.length} of ${given} stream entries not shown)`;
	}
	return `${total} since ${iso(deck.window_start_ms)}`;
}

export function renderStationCard(station: CardStation, deck: CardDeck, reader: ReaderProfile | null): string {
	const lines = [`${station.name}  (host: ${station.host ?? "blank"})`];
	if (station.withheld) {
		lines.push("  state      withheld by its prince's grant (a closed seal, not down)");
		return lines.join("\n");
	}
	const seen = stationVisible(station, deck);
	const heard = station.streams.filter((item) => (item.arrivals ?? 0) > 0 || item.newest_age_ms !== null);
	lines.push(
		// With no link, the last state word and beacon age are not current (§1.4), so the card doesn't print them as such.
		deck.connected
			? `  state      ${station.state} · ${stateGloss(station.state)}`
			: "  state      unobserved (the collector has no link)",
		`  beacon     ${!deck.connected ? "unknown (no link)" : station.beacon_age_ms === null && station.beacon_heard === true ? "heard (no age in this export)" : age(station.beacon_age_ms)}`,
		`  arrivals   ${arrivalsLine(station, deck)}`,
		`  streams    ${streamsLine(station, heard)}`,
		`  station visible: ${seen.visible} (${seen.why})`,
	);
	const width = Math.max(0, ...station.streams.map((item) => item.stream.length));
	for (const item of station.streams) {
		const r = streamReading(station, item.stream, deck, reader);
		lines.push(
			`    ${item.stream.padEnd(width)}  station visible: ${r.visible} · stream admitted: ${r.admitted} · readable here: ${r.readable}${r.why === null ? "" : ` (${r.why})`}`,
		);
	}
	return lines.join("\n");
}

function coverageLine(coverage: NonNullable<CardDeck["coverage"]> | null): string {
	if (coverage === null) return "unknown (the export gave no gap list)";
	const named = coverage.gaps.map((gap) => `${gap.name} ×${gap.count}`);
	if (coverage.unreadable > 0) named.push(`+${coverage.unreadable} unreadable`);
	const left = coverage.left_out;
	if (left === null) named.push("what was left out is unknown");
	else {
		if (left.untuned_more > 0) {
			named.push(
				left.untuned_listed === null
					? `untuned: ${left.untuned_more} left out`
					: `untuned: ${left.untuned_listed} shown, ${left.untuned_more} left out`,
			);
		}
		if (left.truncated) named.push("guide truncated");
	}
	if (named.length === 0 && coverage.walk === "complete") return "none (walk complete)";
	return `walk ${coverage.walk ?? "unknown"} · ${named.length === 0 ? "no gap named" : named.join(", ")}`;
}

function scopePartial(reader: ReaderProfile): string {
	const n = reader.may_read_left_out;
	if (n === undefined || reader.may_read === null) return "";
	const what = n === null ? "some patterns" : `${n} pattern${n === 1 ? "" : "s"}`;
	return ` (partial: ${what} not kept, so a scope miss alone is unknown)`;
}

export function renderHouseCard(deck: CardDeck, reader: ReaderProfile | null): string {
	const head = [
		`HOUSE CARD${deck.synthetic ? " · SYNTHETIC — DEMO DATA" : deck.live_source !== undefined ? ` · LIVE (this ear) · ${deck.live_source}` : ""}`,
		`  as of      ${iso(deck.now_ms)}`,
		`  window     ${deck.window_start_ms === null ? "start unknown" : `since ${iso(deck.window_start_ms)} (memory only)`}`,
		`  collector  ${deck.connected ? "linked" : "no link: every station is unobserved, not offline"}`,
		reader === null
			? "  reader     none given: without one, readable here is never yes (a known denial still reads no)"
			: `  reader     ${reader.reader} · payload text: ${reader.payload_text === null ? "unknown" : reader.payload_text ? "on" : "off"} · read scope: ${reader.may_read === null ? "unknown" : reader.may_read.length === 0 ? "none" : reader.may_read.join(", ")}${scopePartial(reader)}`,
		...(deck.stations_withheld === undefined
			? []
			: [
					`  withheld   ${deck.stations_withheld === null ? "an unknown number of" : deck.stations_withheld} station name${deck.stations_withheld === 1 ? "" : "s"} the export withheld (identity-shaped or not identifiers)`,
				]),
		...(deck.stations_not_shown === undefined || deck.stations_not_shown === 0
			? []
			: [`  not shown  ${deck.stations_not_shown} station${deck.stations_not_shown === 1 ? "" : "s"} (past the card's 64, or malformed)`]),
		...(deck.coverage === undefined ? [] : [`  gaps       ${coverageLine(deck.coverage)}`]),
	];
	const cards = deck.stations.map((station) => renderStationCard(station, deck, reader));
	return [head.join("\n"), ...cards].join("\n\n") + "\n";
}

// SYNTHETIC only: the house page's demo stations (DEMO_HOUSE), with demo streams and grants, and demo readers.
export const DEMO_WINDOW_MS = 3 * 3600000 + 41 * 60000;

const DEMO_STREAMS: Record<string, CardStream[]> = {
	"demo-iris": [
		{ stream: "chatter", arrivals: 41, newest_age_ms: 900, admitted: true },
		{ stream: "forge", arrivals: 3, newest_age_ms: 600000, admitted: false },
	],
	"demo-melchior": [{ stream: "chatter", arrivals: 0, newest_age_ms: null, admitted: true }],
	"demo-balthasar": [{ stream: "chatter", arrivals: 0, newest_age_ms: null, admitted: true }],
	"demo-reed": [
		{ stream: "chatter", arrivals: 12, newest_age_ms: 1700, admitted: true },
		{ stream: "river", arrivals: 5, newest_age_ms: 5300, admitted: null },
	],
	// the lighthouse case: an unplaced station (host blank), its beacon heard, its stream admitted
	"demo-moss": [{ stream: "lighthouse", arrivals: 7, newest_age_ms: 40000, admitted: true }],
};

export function DEMO_DECK(now_ms: number, opts?: { blind?: boolean }): CardDeck {
	const house = DEMO_HOUSE(now_ms, opts);
	return deckFromHouse(house, DEMO_STREAMS, Math.max(0, house.now_ms - DEMO_WINDOW_MS));
}

export const DEMO_READERS: Record<string, ReaderProfile> = {
	"demo-reader-scoped": { reader: "demo-reader-scoped", payload_text: true, may_read: ["demo-iris:*", "demo-reed:chatter"] },
	"demo-reader-shape-only": { reader: "demo-reader-shape-only", payload_text: false, may_read: ["*:*"] },
	"demo-reader-full": { reader: "demo-reader-full", payload_text: true, may_read: ["*:*"] },
};
