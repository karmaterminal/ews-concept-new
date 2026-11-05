import { describe, expect, it } from "vitest";
import {
	DEMO_HOUSE,
	hostPositions,
	pulses,
	PULSE_MS,
	sanitizeHouse,
	stationLook,
} from "./house";

describe("sanitizeHouse", () => {
	it("drops extra keys, hostile names, IP names, empty hosts, and duplicate stations", () => {
		const output = sanitizeHouse({
			now_ms: 100000,
			synthetic: true,
			connected: true,
			hidden: "no",
			hosts: [
				{ name: "ok-host", hidden: "no", stations: [
					{ name: "safe.station", state: "EQUIPPED_QUIET", beacon_age_ms: 4, withheld: false, arrivals_ago_ms: [100], hidden: "no" },
					{ name: "<bad>", state: "EQUIPPED_QUIET", beacon_age_ms: 4, arrivals_ago_ms: [] },
					{ name: "192.168.1.2", state: "EQUIPPED_QUIET", beacon_age_ms: 4, arrivals_ago_ms: [] },
					{ name: "2001:db8::1", state: "EQUIPPED_QUIET", beacon_age_ms: 4, arrivals_ago_ms: [] },
				] },
				{ name: "empty-host", stations: [] },
			],
			unplaced: [
				{ name: "safe.station", state: "EQUIPPED_SPEAKING", beacon_age_ms: 1, arrivals_ago_ms: [20] },
				{ name: "second", state: "unknown", beacon_age_ms: null, arrivals_ago_ms: [70000] },
			],
		});
		expect(JSON.stringify(output)).not.toContain("hidden");
		expect(output.hosts).toEqual([{
			name: "ok-host",
			stations: [{ name: "safe.station", state: "EQUIPPED_QUIET", beacon_age_ms: 4, withheld: false, arrivals_ago_ms: [100] }],
		}]);
		expect(output.unplaced).toEqual([
			{ name: "second", state: "unknown", beacon_age_ms: null, withheld: false, arrivals_ago_ms: [] },
		]);
	});

	it("caps hosts, stations, unplaced stations, and arrivals", () => {
		const hosts = Array.from({ length: 20 }, (_, h) => ({
			name: `host-${h}`,
			stations: Array.from({ length: 20 }, (_, s) => ({
				name: `station-${h}-${s}`,
				state: "EQUIPPED_QUIET",
				beacon_age_ms: 1,
				withheld: false,
				arrivals_ago_ms: Array.from({ length: 60 }, (_, i) => i),
			})),
		}));
		const output = sanitizeHouse({
			now_ms: 100000,
			hosts,
			unplaced: Array.from({ length: 30 }, (_, i) => ({
				name: `unplaced-${i}`,
				state: "EQUIPPED_QUIET",
				beacon_age_ms: 1,
				arrivals_ago_ms: [],
			})),
		});
		expect(output.hosts).toHaveLength(12);
		expect(output.hosts[0].stations).toHaveLength(12);
		expect(output.hosts[0].stations[0].arrivals_ago_ms).toHaveLength(50);
		expect(output.unplaced).toHaveLength(24);
	});
});

describe("HOUSE demo", () => {
	it("is synthetic, demo-named, and has required station kinds and one unplaced", () => {
		const house = sanitizeHouse(DEMO_HOUSE(100000));
		expect(house.synthetic).toBe(true);
		expect(house.hosts).toHaveLength(6);
		expect(house.unplaced).toHaveLength(1);
		const stations = [...house.hosts.flatMap((host) => host.stations), ...house.unplaced];
		expect(stations.every((station) => station.name.startsWith("demo-"))).toBe(true);
		expect(stations.some((station) => stationLook(station, true) === "speaking")).toBe(true);
		expect(stations.some((station) => stationLook(station, true) === "quiet")).toBe(true);
		expect(stations.some((station) => stationLook(station, true) === "not_heard")).toBe(true);
		expect(stations.some((station) => station.withheld)).toBe(true);
	});

	it("makes every station unobserved when the collector is blind", () => {
		const house = DEMO_HOUSE(100000, { blind: true });
		expect(house.connected).toBe(false);
		for (const station of [...house.hosts.flatMap((host) => host.stations), ...house.unplaced]) {
			expect(stationLook(station, house.connected)).toBe("unobserved");
		}
	});

	it("gets pulses only from arrivals and leaves a fresh quiet beacon flat", () => {
		const now = 100000;
		const speaking = DEMO_HOUSE(now).hosts[0].stations[0];
		expect(pulses(speaking, 0).length).toBeGreaterThan(0);
		expect(pulses(speaking, 0).every((value) => value >= 0 && value < 1)).toBe(true);
		const quiet = DEMO_HOUSE(now).hosts[1].stations[0];
		expect(pulses(quiet, 0)).toEqual([]);
		expect(pulses({ ...quiet, beacon_age_ms: 100 }, 0)).toEqual([]);
	});

	it("starts a new arrival at its station and moves it toward the host as time passes", () => {
		const station = { name: "demo-x", state: "EQUIPPED_SPEAKING", beacon_age_ms: 500, withheld: false, arrivals_ago_ms: [0] };
		expect(pulses(station, 0)).toEqual([0]);
		expect(pulses(station, PULSE_MS / 2)).toEqual([0.5]);
		expect(pulses(station, PULSE_MS)).toEqual([]);
	});

	it("sees every demo arrival on its way: the pulse outlasts the 10 s poll, and polls agree", () => {
		expect(PULSE_MS).toBeGreaterThan(10000);
		const first = DEMO_HOUSE(200000).hosts[0].stations[0].arrivals_ago_ms;
		const later = DEMO_HOUSE(210000).hosts[0].stations[0].arrivals_ago_ms;
		expect(first.length).toBeGreaterThan(0);
		// an arrival seen at the first poll is still there, 10 s older, at the next
		expect(later).toContain(first[0] + 10000);
	});

	it("places hosts deterministically and inside the box", () => {
		const a = hostPositions(6, 412, 520);
		const b = hostPositions(6, 412, 520);
		expect(a).toEqual(b);
		expect(a).toHaveLength(6);
		for (const point of a) {
			expect(point.x).toBeGreaterThanOrEqual(0);
			expect(point.x).toBeLessThanOrEqual(412);
			expect(point.y).toBeGreaterThanOrEqual(0);
			expect(point.y).toBeLessThanOrEqual(520);
		}
	});
});
