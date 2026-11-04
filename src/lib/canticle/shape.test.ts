import { describe, expect, it } from "vitest";
import {
	DEMO_SHAPE,
	carrierLevel,
	sanitizeShape,
	CANTICLE_STATES,
	stateGloss,
	stateTone,
} from "./shape";

describe("sanitizeShape", () => {
	it("drops extra keys and hostile station names", () => {
		const output = sanitizeShape({
			now_ms: 123,
			synthetic: true,
			connected: true,
			daemon: "ok",
			receive: "degraded",
			text: "must-not-appear",
			purpose: "must-not-appear",
			body: "must-not-appear",
			stations: [
				{
					name: "<script>",
					state: "EQUIPPED_SPEAKING",
					beacon_age_ms: 100,
					text: "hidden",
					streams: [{ stream: "a", live: 1, newest_age_ms: 2, body: "hidden" }],
				},
				{
					name: "safe.station-1",
					state: "hostile-state",
					beacon_age_ms: 500,
					streams: [{ stream: "<bad>", live: 2, newest_age_ms: 3 }],
				},
			],
		});
		const json = JSON.stringify(output);
		expect(json).not.toContain("must-not-appear");
		expect(json).not.toContain("hidden");
		expect(output.stations).toHaveLength(1);
		expect(output.stations[0].name).toBe("safe.station-1");
		expect(output.stations[0].state).toBe("unknown");
	});

	it("handles invalid enums and non-finite or negative numbers", () => {
		const output = sanitizeShape({
			now_ms: -1,
			synthetic: "yes",
			connected: 1,
			daemon: "broken",
			receive: "broken",
			stations: [{
				name: "A",
				state: "<bad>",
				beacon_age_ms: Number.NaN,
				streams: [{
					stream: "S",
					live: -4,
					newest_age_ms: Number.POSITIVE_INFINITY,
				}, {
					stream: "T",
					live: 4.9,
					newest_age_ms: -10,
				}],
			}],
		});
		expect(output.now_ms).toBe(0);
		expect(output.synthetic).toBe(false);
		expect(output.connected).toBe(false);
		expect(output.daemon).toBe("unknown");
		expect(output.receive).toBe("unknown");
		expect(output.stations[0].state).toBe("unknown");
		expect(output.stations[0].beacon_age_ms).toBeNull();
		expect(output.stations[0].streams[0].live).toBe(0);
		expect(output.stations[0].streams[0].newest_age_ms).toBeNull();
		expect(output.stations[0].streams[1].live).toBe(4);
		expect(output.stations[0].streams[1].newest_age_ms).toBeNull();
	});

	it("caps stations and streams", () => {
		const stations = Array.from({ length: 40 }, (_, i) => ({
			name: `station-${i}`,
			state: "unknown",
			beacon_age_ms: 1,
			streams: Array.from({ length: 20 }, (_, j) => ({
				stream: `stream-${j}`,
				live: 1,
				newest_age_ms: 1,
			})),
		}));
		const output = sanitizeShape({ now_ms: 1, stations });
		expect(output.stations).toHaveLength(32);
		expect(output.stations[0].streams).toHaveLength(16);
	});

	it("returns a disconnected shape for non-object input", () => {
		for (const input of [null, undefined, 42, "shape", []]) {
			const output = sanitizeShape(input);
			expect(output.synthetic).toBe(false);
			expect(output.connected).toBe(false);
			expect(output.daemon).toBe("unknown");
			expect(output.receive).toBe("unknown");
			expect(output.stations).toEqual([]);
		}
	});
});

describe("canticle shape helpers", () => {
	it("creates the three-station demo shape", () => {
		expect(DEMO_SHAPE(9876)).toEqual({
			now_ms: 9876,
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
		});
	});

	it("calculates carrier level", () => {
		expect(carrierLevel(null)).toBe(0);
		expect(carrierLevel(-1)).toBe(0);
		expect(carrierLevel(2000)).toBe(1);
		expect(carrierLevel(16000)).toBeCloseTo(0.5);
		expect(carrierLevel(30000)).toBe(0);
		expect(carrierLevel(50000)).toBe(0);
	});

	it("maps station states to tones", () => {
		expect(stateTone("EQUIPPED_SPEAKING")).toBe("speaking");
		expect(stateTone("EQUIPPED_QUIET")).toBe("quiet");
		expect(stateTone("ROOT_UNKNOWN")).toBe("quiet");
		expect(stateTone("UNEQUIPPED_PRESENT")).toBe("present");
		expect(stateTone("UNOBSERVABLE")).toBe("dark");
		expect(stateTone("hostile")).toBe("dark");
	});
});

describe("stateGloss", () => {
	it("says what was heard for every closed word, and nothing else", () => {
		for (const state of CANTICLE_STATES) expect(stateGloss(state)).toMatch(/^[a-z :·]+$/);
		expect(stateGloss("ROOT_UNKNOWN")).toBe("carrier up · no root heard");
		expect(stateGloss("<script>")).toBe(stateGloss("unknown"));
		for (const state of CANTICLE_STATES) expect(stateGloss(state)).not.toContain("withheld");
	});
});
