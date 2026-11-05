export type ShapeDaemon = "ok" | "degraded" | "unknown";
export type ShapeReceive = "ok" | "degraded" | "unknown";

export type ShapeStream = {
	stream: string;
	live: number;
	newest_age_ms: number | null;
};

export type ShapeStation = {
	name: string;
	state: string;
	beacon_age_ms: number | null;
	streams: ShapeStream[];
};

export type Shape = {
	now_ms: number;
	synthetic: boolean;
	connected: boolean;
	daemon: ShapeDaemon;
	receive: ShapeReceive;
	stations: ShapeStation[];
};

export const CANTICLE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;
export const CANTICLE_STATES = new Set([
	"EQUIPPED_SPEAKING",
	"EQUIPPED_QUIET",
	"UNEQUIPPED_PRESENT",
	"ROOT_UNKNOWN",
	"UNOBSERVABLE",
	"UNOBSERVABLE:signed_off",
	"unknown",
	"not_heard",
]);

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

export function sanitizeShape(raw: unknown): Shape {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return {
			now_ms: Date.now(),
			synthetic: false,
			connected: false,
			daemon: "unknown",
			receive: "unknown",
			stations: [],
		};
	}

	const source = raw as Record<string, unknown>;
	const now = nonNegativeNumber(source.now_ms);
	const daemon =
		source.daemon === "ok" || source.daemon === "degraded" || source.daemon === "unknown"
			? source.daemon
			: "unknown";
	const receive =
		source.receive === "ok" || source.receive === "degraded" || source.receive === "unknown"
			? source.receive
			: "unknown";

	const stations: ShapeStation[] = [];
	if (Array.isArray(source.stations)) {
		for (const rawStation of source.stations.slice(0, 32)) {
			if (typeof rawStation !== "object" || rawStation === null || Array.isArray(rawStation)) continue;
			const station = rawStation as Record<string, unknown>;
			if (typeof station.name !== "string" || !CANTICLE_IDENTIFIER.test(station.name)) continue;

			const streams: ShapeStream[] = [];
			if (Array.isArray(station.streams)) {
				for (const rawStream of station.streams.slice(0, 16)) {
					if (typeof rawStream !== "object" || rawStream === null || Array.isArray(rawStream)) continue;
					const stream = rawStream as Record<string, unknown>;
					if (typeof stream.stream !== "string" || !CANTICLE_IDENTIFIER.test(stream.stream)) continue;
					const liveValue = nonNegativeNumber(stream.live);
					const live = liveValue === null ? 0 : Math.floor(liveValue);
					streams.push({
						stream: stream.stream,
						live,
						newest_age_ms: nonNegativeNumber(stream.newest_age_ms),
					});
				}
			}

			stations.push({
				name: station.name,
				state: typeof station.state === "string" && CANTICLE_STATES.has(station.state)
					? station.state
					: "unknown",
				beacon_age_ms: nonNegativeNumber(station.beacon_age_ms),
				streams,
			});
		}
	}

	return {
		now_ms: now ?? 0,
		synthetic: typeof source.synthetic === "boolean" ? source.synthetic : false,
		connected: typeof source.connected === "boolean" ? source.connected : false,
		daemon,
		receive,
		stations,
	};
}

export function DEMO_SHAPE(now: number): Shape {
	const safeNow = typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : 0;
	return {
		now_ms: safeNow,
		synthetic: true,
		connected: false,
		daemon: "ok",
		receive: "ok",
		stations: [
			{
				name: "demo-melchior",
				state: "EQUIPPED_SPEAKING",
				beacon_age_ms: 1200,
				streams: [{ stream: "chatter", live: 2, newest_age_ms: 8000 }],
			},
			{
				name: "demo-balthasar",
				state: "EQUIPPED_QUIET",
				beacon_age_ms: 4100,
				streams: [],
			},
			{
				name: "demo-casper",
				state: "not_heard",
				beacon_age_ms: null,
				streams: [],
			},
		],
	};
}

export function carrierLevel(beacon_age_ms: number | null): number {
	if (beacon_age_ms === null || !Number.isFinite(beacon_age_ms) || beacon_age_ms < 0) return 0;
	if (beacon_age_ms <= 2000) return 1;
	if (beacon_age_ms >= 30000) return 0;
	return (30000 - beacon_age_ms) / 28000;
}

// One plain line per closed state word, from binary-canticle's listener.presence_state and the gateway's own words.
// It says what was heard, never why, and never "withheld": that is only a prince's grant to say.
const STATE_GLOSS: Record<string, string> = {
	EQUIPPED_SPEAKING: "carrier up · root heard · a stream sang lately",
	EQUIPPED_QUIET: "carrier up · root heard · no stream lately",
	UNEQUIPPED_PRESENT: "carrier up · root heard · no equipment",
	ROOT_UNKNOWN: "carrier up · no root heard",
	UNOBSERVABLE: "no fresh carrier",
	"UNOBSERVABLE:signed_off": "signed off",
	unknown: "not known: receive degraded or a gap",
	not_heard: "not heard on this link",
};

export function stateGloss(state: string): string {
	return Object.hasOwn(STATE_GLOSS, state) ? STATE_GLOSS[state] : STATE_GLOSS.unknown;
}

export function stateTone(state: string): "speaking" | "quiet" | "present" | "dark" {
	if (state === "EQUIPPED_SPEAKING") return "speaking";
	if (state === "EQUIPPED_QUIET" || state === "ROOT_UNKNOWN") return "quiet";
	if (state === "UNEQUIPPED_PRESENT") return "present";
	return "dark";
}
