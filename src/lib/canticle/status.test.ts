import { describe, expect, it } from "vitest";
import { DEMO_SHAPE, sanitizeShape, type ShapeStation } from "./shape";
import { DEMO_DRUM, sanitizeDrum } from "./drum";
import { DEMO_FLOW, sanitizeFlow } from "./flow";
import { barLook, linked, logFor, streamsFor, waveform } from "./status";

function station(overrides: Partial<ShapeStation> = {}): ShapeStation {
	return {
		name: "safe",
		state: "EQUIPPED_QUIET",
		beacon_age_ms: 1000,
		streams: [],
		...overrides,
	};
}

describe("canticle status helpers", () => {
	it("quiet is up and not_heard is dim", () => {
		const shape = sanitizeShape({ now_ms: 1, connected: true, stations: [] });
		expect(barLook(station(), shape)).toBe("up");
		expect(barLook(station({ state: "not_heard", beacon_age_ms: 1000 }), shape)).toBe("dim");
	});

	it("connected=false makes every bar unobserved", () => {
		const shape = sanitizeShape({ now_ms: 1, connected: false, stations: [] });
		expect(barLook(station({ state: "EQUIPPED_SPEAKING" }), shape)).toBe("unobserved");
		expect(barLook(station({ state: "not_heard" }), shape)).toBe("unobserved");
		expect(barLook(station({ state: "unknown" }), shape)).toBe("unobserved");
	});

	it("never returns red or down", () => {
		const shape = sanitizeShape({ now_ms: 1, connected: true, stations: [] });
		for (const item of [
			station(),
			station({ state: "not_heard" }),
			station({ state: "unknown", beacon_age_ms: null }),
			station({ state: "UNOBSERVABLE" }),
		]) {
			expect(["up", "dim", "unobserved"]).toContain(barLook(item, shape));
		}
	});

	it("streamsFor is sorted, unique, and identifier-safe", () => {
		const drum = sanitizeDrum({
			now_ms: 100,
			start_ms: 0,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			observed: [],
			streams: ["chatter", "telemetry", "<bad>"],
			stations: [{ name: "safe", beacons: [], arrivals: [[1, 0, 2], [2, 1, 1], [3, 2, 1]] }],
		});
		expect(streamsFor(drum, "safe", station({ streams: [
			{ stream: "facts", live: 1, newest_age_ms: 1 },
			{ stream: "<bad>", live: 1, newest_age_ms: 1 },
		] }))).toEqual(["chatter", "facts", "telemetry"]);
		expect(streamsFor(drum, "<bad>", station())).toEqual([]);
	});

	it("waveform breaks at an unobserved bucket and draws nothing after now", () => {
		const drum = sanitizeDrum({
			now_ms: 60000,
			start_ms: 0,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			observed: [[0, 2], [4, 8]],
			streams: ["a", "b"],
			stations: [{ name: "safe", beacons: [], arrivals: [[1, 0, 3], [5, 1, 4], [7, 0, 2]] }],
		});
		const segments = waveform(drum, "safe", null, 8);
		expect(segments).toHaveLength(2);
		expect(segments[0].map((point) => [point.x, point.y])).toEqual([[0, 0], [1, 3]]);
		expect(segments.flat().every((point) => point.x < 8)).toBe(true);
		expect(segments.flat().some((point) => point.x === 2)).toBe(false);
		expect(segments.flat().every((point) => point.x <= 6)).toBe(true);
	});

	it("logFor returns only at_ms and stream, filtered and newest first", () => {
		const flow = sanitizeFlow({
			now_ms: 100,
			since_ms: 0,
			minute_ms: 60000,
			river: [
				{ at_ms: 20, station: "safe", stream: "a", hidden: "no" },
				{ at_ms: 50, station: "safe", stream: "b", hidden: "no" },
				{ at_ms: 40, station: "safe", stream: "a", hidden: "no" },
				{ at_ms: 80, station: "other", stream: "a" },
			],
		});
		expect(logFor(flow, "safe", "a", 50)).toEqual([
			{ at_ms: 40, stream: "a" },
			{ at_ms: 20, stream: "a" },
		]);
		expect(logFor(flow, "safe", null, 1)).toEqual([{ at_ms: 50, stream: "b" }]);
	});

	it("demo data works", () => {
		const shape = sanitizeShape(DEMO_SHAPE(100000));
		const drum = sanitizeDrum(DEMO_DRUM(100000));
		const flow = sanitizeFlow(DEMO_FLOW(100000));
		expect(barLook(shape.stations[0], shape)).toBe("up");   // synthetic: drawn as heard (see linked)
		expect(streamsFor(drum, "demo-melchior").length).toBeGreaterThan(0);
		expect(waveform(drum, "demo-melchior", null).length).toBeGreaterThan(0);
		expect(logFor(flow, "demo-melchior", null).length).toBeGreaterThan(0);
	});
});

describe("linked (synthetic demo vs live)", () => {
	it("draws the synthetic demo as heard, and a non-synthetic disconnected shape as unobserved", () => {
		const demo = sanitizeShape(DEMO_SHAPE(100000));
		expect(demo.connected).toBe(false);
		expect(linked(demo)).toBe(true);
		expect(demo.stations.some((station) => barLook(station, demo) === "up")).toBe(true);
		const blind = { ...demo, synthetic: false };
		expect(linked(blind)).toBe(false);
		expect(demo.stations.every((station) => barLook(station, blind) === "unobserved")).toBe(true);
	});
});
