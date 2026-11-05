import { CANTICLE_IDENTIFIER, CANTICLE_STATES } from "./shape";

export type House = {
	now_ms: number;
	synthetic: boolean;
	connected: boolean;
	hosts: HouseHost[];
	unplaced: HouseStation[];
};

export type HouseHost = {
	name: string;
	stations: HouseStation[];
};

export type HouseStation = {
	name: string;
	state: string;
	beacon_age_ms: number | null;
	withheld: boolean;
	arrivals_ago_ms: number[];
};

// A pulse travels from its station to the host over PULSE_MS: slower than the 10 s poll, so every new arrival is seen
// on its way, and slow on purpose (frond-house §4: nothing flashes).
export const PULSE_MS = 12000;

export type HouseStationLook = "unobserved" | "withheld" | "not_heard" | "speaking" | "quiet";

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

function looksLikeIpAddress(name: string): boolean {
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(name)) {
		return name.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
	}
	return name.includes(":") && /^[0-9A-Fa-f:.]+$/.test(name);
}

function safeName(value: unknown): string | null {
	if (typeof value !== "string" || !CANTICLE_IDENTIFIER.test(value)) return null;
	if (looksLikeIpAddress(value)) return null;
	return value;
}

function sanitizeStation(raw: unknown): HouseStation | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const source = raw as Record<string, unknown>;
	const name = safeName(source.name);
	if (!name) return null;
	const state = typeof source.state === "string" && CANTICLE_STATES.has(source.state)
		? source.state
		: "unknown";
	const beacon = nonNegativeNumber(source.beacon_age_ms);
	const arrivals: number[] = [];
	if (Array.isArray(source.arrivals_ago_ms)) {
		for (const rawAge of source.arrivals_ago_ms.slice(0, 50)) {
			const age = nonNegativeNumber(rawAge);
			if (age !== null && age <= 60000) arrivals.push(Math.floor(age));
		}
	}
	return {
		name,
		state,
		beacon_age_ms: beacon,
		withheld: source.withheld === true,
		arrivals_ago_ms: arrivals,
	};
}

export function sanitizeHouse(raw: unknown): House {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { now_ms: 0, synthetic: false, connected: false, hosts: [], unplaced: [] };
	}
	const source = raw as Record<string, unknown>;
	const now = nonNegativeNumber(source.now_ms) ?? 0;
	const seen = new Set<string>();
	const hosts: HouseHost[] = [];

	if (Array.isArray(source.hosts)) {
		for (const rawHost of source.hosts.slice(0, 12)) {
			if (typeof rawHost !== "object" || rawHost === null || Array.isArray(rawHost)) continue;
			const host = rawHost as Record<string, unknown>;
			const name = safeName(host.name);
			if (!name || !Array.isArray(host.stations)) continue;
			const stations: HouseStation[] = [];
			for (const rawStation of host.stations.slice(0, 12)) {
				const station = sanitizeStation(rawStation);
				if (!station || seen.has(station.name)) continue;
				seen.add(station.name);
				stations.push(station);
			}
			if (stations.length > 0) hosts.push({ name, stations });
		}
	}

	const unplaced: HouseStation[] = [];
	if (Array.isArray(source.unplaced)) {
		for (const rawStation of source.unplaced.slice(0, 24)) {
			const station = sanitizeStation(rawStation);
			if (!station || seen.has(station.name)) continue;
			seen.add(station.name);
			unplaced.push(station);
		}
	}

	return {
		now_ms: now,
		synthetic: source.synthetic === true,
		connected: source.connected === true,
		hosts,
		unplaced,
	};
}

export function DEMO_HOUSE(now_ms: number, opts?: { blind?: boolean }): House {
	const safeNow = typeof now_ms === "number" && Number.isFinite(now_ms) && now_ms >= 0 ? now_ms : 0;
	const station = (
		name: string,
		state: string,
		beaconAge: number | null,
		arrivals: number[] = [],
		withheld = false,
	): HouseStation => ({
		name,
		state,
		beacon_age_ms: beaconAge,
		withheld,
		arrivals_ago_ms: arrivals,
	});

	// a speaking demo station "arrives" every ``period`` ms of wall time, so successive polls agree and pulses keep coming
	const every = (period: number, offset: number): number[] => {
		const ages: number[] = [];
		for (let age = (safeNow + offset) % period; age < PULSE_MS + 10000 && ages.length < 8; age += period) ages.push(age);
		return ages;
	};

	return {
		now_ms: safeNow,
		synthetic: true,
		connected: opts?.blind !== true,
		hosts: [
			{ name: "demo-host-a", stations: [
				station("demo-iris", "EQUIPPED_SPEAKING", 900, every(3100, 0)),
			] },
			{ name: "demo-host-b", stations: [
				station("demo-melchior", "EQUIPPED_QUIET", 1400),
			] },
			{ name: "demo-host-c", stations: [
				station("demo-balthasar", "not_heard", null),
			] },
			{ name: "demo-host-d", stations: [
				station("demo-casper", "EQUIPPED_QUIET", 5200, [], true),
			] },
			{ name: "demo-host-e", stations: [
				station("demo-fern", "UNEQUIPPED_PRESENT", 2800),
			] },
			{ name: "demo-host-f", stations: [
				station("demo-reed", "EQUIPPED_SPEAKING", 1100, every(5300, 1700)),
			] },
		],
		unplaced: [
			station("demo-moss", "EQUIPPED_QUIET", 3300),
		],
	};
}

export function hostPositions(count: number, width: number, height: number): { x: number; y: number }[] {
	const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
	if (safeCount === 0) return [];
	const cx = width / 2;
	const cy = height / 2;
	const radius = Math.max(0, Math.min(width, height) * 0.32);
	return Array.from({ length: safeCount }, (_, i) => {
		const angle = -Math.PI / 2 + (i / safeCount) * Math.PI * 2;
		return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
	});
}

// Where each of a station's new arrivals is on its spoke, 0 at the station to 1 at the host, ``elapsed_ms`` after the
// answer was received.  Built only from arrivals (new under the flow rule), never from a beacon.
export function pulses(station: HouseStation, elapsed_ms: number): number[] {
	const elapsed = Number.isFinite(elapsed_ms) && elapsed_ms > 0 ? elapsed_ms : 0;
	return station.arrivals_ago_ms
		.map((age) => age + elapsed)
		.filter((age) => Number.isFinite(age) && age >= 0 && age < PULSE_MS)
		.map((age) => age / PULSE_MS);
}

export function stationLook(station: HouseStation, connected: boolean): HouseStationLook {
	if (!connected) return "unobserved";
	if (station.withheld) return "withheld";
	if (
		station.state === "not_heard" ||
		station.state === "UNOBSERVABLE" ||
		station.state === "UNOBSERVABLE:signed_off" ||
		station.state === "unknown" ||
		station.beacon_age_ms === null
	) return "not_heard";
	if (station.arrivals_ago_ms.length > 0) return "speaking";
	return "quiet";
}
