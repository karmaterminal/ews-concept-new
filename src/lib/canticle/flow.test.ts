import { describe, expect, it } from "vitest";
import { DEMO_FLOW, minuteIntensity, sanitizeFlow } from "./flow";

describe("sanitizeFlow", () => {
	it("drops extra keys and hostile identifiers/state", () => {
		const output = sanitizeFlow({
			now_ms: 123,
			since_ms: 12,
			minute_ms: 60000,
			synthetic: true,
			text: "hidden",
			purpose: "hidden",
			body: "hidden",
			idem: "hidden",
			minutes: [{ t: 100, observed: true }],
			stations: [{
				name: "<bad>",
				minutes: [{ beacon: true, state: "bad", arrivals: [{ stream: "ok", n: 2, text: "hidden" }] }],
			}, {
				name: "safe.station",
				minutes: [{ beacon: "yes", state: "<bad>", arrivals: [{ stream: "<bad>", n: 3 }] }],
			}],
			river: [{ at_ms: 110, station: "safe.station", stream: "ok", idem: "hidden" }],
		});
		const json = JSON.stringify(output);
		expect(json).not.toContain("hidden");
		expect(output.stations).toHaveLength(1);
		expect(output.stations[0].name).toBe("safe.station");
		expect(output.stations[0].minutes[0].state).toBe("unknown");
		expect(output.river).toHaveLength(1);
	});

	it("pads and truncates station minutes and applies caps", () => {
		const stations = Array.from({ length: 40 }, (_, i) => ({
			name: `station-${i}`,
			minutes: Array.from({ length: 70 }, (_, j) => ({
				beacon: true,
				state: "EQUIPPED_QUIET",
				arrivals: Array.from({ length: 20 }, (_, k) => ({ stream: `stream-${k}`, n: k })),
			})),
		}));
		const output = sanitizeFlow({
			now_ms: 1,
			minutes: Array.from({ length: 60 }, (_, i) => ({ t: i, observed: i % 2 === 0 })),
			stations,
			river: [],
		});
		expect(output.minutes).toHaveLength(60);
		expect(output.stations).toHaveLength(32);
		expect(output.stations[0].minutes).toHaveLength(60);
		expect(output.stations[0].minutes[0].arrivals).toHaveLength(16);
	});

	it("returns an empty flow for non-object input", () => {
		for (const input of [null, undefined, 42, "flow", []]) {
			const output = sanitizeFlow(input);
			expect(output.synthetic).toBe(false);
			expect(output.minutes).toEqual([]);
			expect(output.stations).toEqual([]);
			expect(output.river).toEqual([]);
		}
	});

	it("drops malformed river items and caps river", () => {
		const output = sanitizeFlow({
			river: [
				...Array.from({ length: 60 }, (_, i) => ({ at_ms: i + 10, station: "station", stream: "stream" })),
				{ at_ms: -1, station: "station", stream: "stream" },
				{ at_ms: 2, station: "<bad>", stream: "stream" },
			],
		});
		expect(output.river).toHaveLength(50);
		expect(output.river[0]).toEqual({ at_ms: 10, station: "station", stream: "stream" });
	});

	it("creates demo and calculates intensity", () => {
		expect(DEMO_FLOW(60000).synthetic).toBe(true);
		expect(DEMO_FLOW(60000).stations.map((station) => station.name)).toEqual([
			"demo-melchior",
			"demo-balthasar",
			"demo-casper",
		]);
		expect(minuteIntensity([{ stream: "a", n: 7 }, { stream: "b", n: 8 }])).toBe(1);
		expect(minuteIntensity([{ stream: "a", n: 3 }])).toBe(0.3);
	});
});
