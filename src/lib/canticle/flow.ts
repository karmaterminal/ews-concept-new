import { CANTICLE_IDENTIFIER, CANTICLE_STATES } from "./shape";

export type FlowArrival = {
	stream: string;
	n: number;
};

export type FlowMinute = {
	beacon: boolean;
	state: string | null;
	arrivals: FlowArrival[];
};

export type FlowStation = {
	name: string;
	minutes: FlowMinute[];
};

export type FlowTopMinute = {
	t: number;
	observed: boolean;
};

export type FlowRiverItem = {
	at_ms: number;
	station: string;
	stream: string;
};

export type Flow = {
	now_ms: number;
	since_ms: number;
	minute_ms: number;
	synthetic: boolean;
	minutes: FlowTopMinute[];
	stations: FlowStation[];
	river: FlowRiverItem[];
};

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

export function sanitizeFlow(raw: unknown): Flow {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return {
			now_ms: Date.now(),
			since_ms: 0,
			minute_ms: 60000,
			synthetic: false,
			minutes: [],
			stations: [],
			river: [],
		};
	}

	const source = raw as Record<string, unknown>;
	const minutes: FlowTopMinute[] = [];
	if (Array.isArray(source.minutes)) {
		for (const rawMinute of source.minutes.slice(0, 60)) {
			if (typeof rawMinute !== "object" || rawMinute === null || Array.isArray(rawMinute)) continue;
			const minute = rawMinute as Record<string, unknown>;
			const t = nonNegativeNumber(minute.t);
			if (t === null) continue;
			minutes.push({ t, observed: typeof minute.observed === "boolean" ? minute.observed : false });
		}
	}

	const stations: FlowStation[] = [];
	if (Array.isArray(source.stations)) {
		for (const rawStation of source.stations.slice(0, 32)) {
			if (typeof rawStation !== "object" || rawStation === null || Array.isArray(rawStation)) continue;
			const station = rawStation as Record<string, unknown>;
			if (typeof station.name !== "string" || !CANTICLE_IDENTIFIER.test(station.name)) continue;

			const stationMinutes: FlowMinute[] = [];
			if (Array.isArray(station.minutes)) {
				for (const rawMinute of station.minutes.slice(0, minutes.length)) {
					if (typeof rawMinute !== "object" || rawMinute === null || Array.isArray(rawMinute)) {
						stationMinutes.push({ beacon: false, state: null, arrivals: [] });
						continue;
					}
					const minute = rawMinute as Record<string, unknown>;
					const state = typeof minute.state === "string" && CANTICLE_STATES.has(minute.state)
						? minute.state
						: minute.state === null
							? null
							: "unknown";
					const arrivals: FlowArrival[] = [];
					if (Array.isArray(minute.arrivals)) {
						for (const rawArrival of minute.arrivals.slice(0, 16)) {
							if (typeof rawArrival !== "object" || rawArrival === null || Array.isArray(rawArrival)) continue;
							const arrival = rawArrival as Record<string, unknown>;
							if (typeof arrival.stream !== "string" || !CANTICLE_IDENTIFIER.test(arrival.stream)) continue;
							const nValue = nonNegativeNumber(arrival.n);
							if (nValue === null) continue;
							arrivals.push({ stream: arrival.stream, n: Math.floor(nValue) });
						}
					}
					stationMinutes.push({
						beacon: typeof minute.beacon === "boolean" ? minute.beacon : false,
						state,
						arrivals,
					});
				}
			}
			while (stationMinutes.length < minutes.length) {
				stationMinutes.push({ beacon: false, state: null, arrivals: [] });
			}
			stations.push({ name: station.name, minutes: stationMinutes });
		}
	}

	const river: FlowRiverItem[] = [];
	if (Array.isArray(source.river)) {
		for (const rawItem of source.river.slice(0, 50)) {
			if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
			const item = rawItem as Record<string, unknown>;
			if (typeof item.station !== "string" || !CANTICLE_IDENTIFIER.test(item.station)) continue;
			if (typeof item.stream !== "string" || !CANTICLE_IDENTIFIER.test(item.stream)) continue;
			const at = nonNegativeNumber(item.at_ms);
			if (at === null) continue;
			river.push({ at_ms: at, station: item.station, stream: item.stream });
		}
	}

	return {
		now_ms: nonNegativeNumber(source.now_ms) ?? 0,
		since_ms: nonNegativeNumber(source.since_ms) ?? 0,
		minute_ms: nonNegativeNumber(source.minute_ms) ?? 60000,
		synthetic: typeof source.synthetic === "boolean" ? source.synthetic : false,
		minutes,
		stations,
		river,
	};
}

export function DEMO_FLOW(now: number): Flow {
	const safeNow = typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : 0;
	const minuteMs = 60000;
	const since = safeNow - 59 * minuteMs;
	const minutes = Array.from({ length: 60 }, (_, i) => ({
		t: since + i * minuteMs,
		observed: i >= 3,
	}));
	const makeMinutes = (offset: number): FlowMinute[] =>
		minutes.map((minute, i) => ({
			beacon: i >= 20 && i % 7 === offset,
			state: i < 6 ? null : i % 9 === 0 ? "unknown" : i % 3 === 0 ? "EQUIPPED_SPEAKING" : "EQUIPPED_QUIET",
			arrivals: i % (offset + 5) === 0
				? [{ stream: ["chatter", "chatter", "telemetry"][offset], n: 1 + (i % 4) }]
				: [],
		}));
	const stations: FlowStation[] = [
		{ name: "demo-melchior", minutes: makeMinutes(0) },
		{ name: "demo-balthasar", minutes: makeMinutes(1) },
		{ name: "demo-casper", minutes: makeMinutes(2) },
	];
	const river: FlowRiverItem[] = [
		{ at_ms: safeNow - 8000, station: "demo-melchior", stream: "chatter" },
		{ at_ms: safeNow - 22000, station: "demo-balthasar", stream: "telemetry" },
		{ at_ms: safeNow - 41000, station: "demo-casper", stream: "chatter" },
	];
	return { now_ms: safeNow, since_ms: since, minute_ms: minuteMs, synthetic: true, minutes, stations, river };
}

export function minuteIntensity(arrivals: FlowArrival[]): number {
	if (!Array.isArray(arrivals)) return 0;
	const sum = arrivals.reduce((total, arrival) => total + (Number.isFinite(arrival.n) && arrival.n >= 0 ? arrival.n : 0), 0);
	return Math.min(sum, 10) / 10;
}
