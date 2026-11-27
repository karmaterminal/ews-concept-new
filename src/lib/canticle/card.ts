// The house card (frond-house §1.5, §3.C): DECK's pre-P0 card as plain text a prince can read, one card per shown
// station. Its one addition is 🌫's reader test: on every stream line, three facts kept apart.
//
// - station visible: this collector hears the station's beacon now;
// - stream admitted: the manifest grant admits this stream;
// - readable here: this session may read the stream's payload text, by its own reader profile (read scope and
//   payload-text setting).
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
};

export type CardStation = {
	name: string;
	/** The host, only when an association is granted (§3.A); null means left blank. */
	host: string | null;
	state: string;
	beacon_age_ms: number | null;
	withheld: boolean;
	streams: CardStream[];
};

export type CardDeck = {
	now_ms: number;
	synthetic: boolean;
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
};

export type StreamReading = { visible: Tri; admitted: Tri; readable: Tri; why: string | null };

const NOT_HEARD_STATES = new Set(["not_heard", "UNOBSERVABLE", "UNOBSERVABLE:signed_off"]);
const PATTERN_PART = /^(?:\*|[A-Za-z0-9._-]{1,64})$/;

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeStreams(raw: unknown): CardStream[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: CardStream[] = [];
	for (const item of raw.slice(0, 16)) {
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
	const station = (item: HouseStation, host: string | null): CardStation => ({
		name: item.name,
		host,
		state: item.state,
		beacon_age_ms: item.beacon_age_ms,
		withheld: item.withheld,
		streams: item.withheld || !Object.hasOwn(streams, item.name) ? [] : sanitizeStreams(streams[item.name]),
	});
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

export function sanitizeReader(raw: unknown): ReaderProfile | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const source = raw as Record<string, unknown>;
	if (typeof source.reader !== "string" || !CANTICLE_IDENTIFIER.test(source.reader)) return null;
	let may_read: string[] | null = null;
	if (Array.isArray(source.may_read)) {
		may_read = [];
		for (const pattern of source.may_read.slice(0, 64)) {
			if (typeof pattern !== "string") continue;
			const at = pattern.indexOf(":");
			if (at < 0) continue;
			const station = pattern.slice(0, at);
			const stream = pattern.slice(at + 1);
			if (PATTERN_PART.test(station) && PATTERN_PART.test(stream) && !may_read.includes(pattern)) {
				may_read.push(pattern);
			}
		}
	}
	return {
		reader: source.reader,
		payload_text: typeof source.payload_text === "boolean" ? source.payload_text : null,
		may_read,
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
	if (station.state === "unknown") return { visible: "unknown", why: "receive is degraded or a gap" };
	if (station.beacon_age_ms === null) return { visible: "unknown", why: "no beacon age" };
	if (carrierLevel(station.beacon_age_ms) <= 0) return { visible: "no", why: "its last beacon is stale" };
	return { visible: "yes", why: "its beacon is heard" };
}

/**
 * The three facts for one stream. Readable here is a conjunction: any one definite no makes it no, with that reason;
 * otherwise any unknown makes it unknown; it is yes only when every part is a known yes.
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
	if (visible === "no") noes.push("nothing from this station is heard here now");
	if (visible === "unknown") unknowns.push("station visibility is unknown");
	if (admitted === "no") noes.push("the manifest grant does not admit this stream");
	if (admitted === "unknown") unknowns.push("the grant's answer is unknown");
	if (reader === null) {
		unknowns.push("no reader profile");
	} else {
		if (reader.payload_text === false) noes.push("payload text is off for this session");
		if (reader.payload_text === null) unknowns.push("this session's payload-text setting is unknown");
		if (reader.may_read === null) unknowns.push("this reader's read scope is unknown");
		else if (!inScope(reader.may_read, station.name, stream)) {
			noes.push(`${station.name}:${stream} is outside this reader's read scope`);
		}
	}

	if (noes.length > 0) return { visible, admitted, readable: "no", why: noes.join("; ") };
	if (unknowns.length > 0) return { visible, admitted, readable: "unknown", why: unknowns.join("; ") };
	return { visible, admitted, readable: "yes", why: null };
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

function arrivalsLine(station: CardStation, deck: CardDeck): string {
	if (deck.window_start_ms === null) return "unknown (no window start)";
	if (station.streams.some((item) => item.arrivals === null)) return "unknown";
	const total = station.streams.reduce((sum, item) => sum + (item.arrivals ?? 0), 0);
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
		`  beacon     ${deck.connected ? age(station.beacon_age_ms) : "unknown (no link)"}`,
		`  arrivals   ${arrivalsLine(station, deck)}`,
		`  streams    ${heard.length > 0 ? heard.map((item) => item.stream).join(", ") : "none heard"}`,
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

export function renderHouseCard(deck: CardDeck, reader: ReaderProfile | null): string {
	const head = [
		`HOUSE CARD${deck.synthetic ? " · SYNTHETIC — DEMO DATA" : ""}`,
		`  as of      ${iso(deck.now_ms)}`,
		`  window     ${deck.window_start_ms === null ? "start unknown" : `since ${iso(deck.window_start_ms)} (memory only)`}`,
		`  collector  ${deck.connected ? "linked" : "no link: every station is unobserved, not offline"}`,
		reader === null
			? "  reader     none given: readable here stays unknown"
			: `  reader     ${reader.reader} · payload text: ${reader.payload_text === null ? "unknown" : reader.payload_text ? "on" : "off"} · read scope: ${reader.may_read === null ? "unknown" : reader.may_read.length === 0 ? "none" : reader.may_read.join(", ")}`,
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
