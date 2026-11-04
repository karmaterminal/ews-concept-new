import { describe, expect, it } from "vitest";
import { DEMO_DRUM, beaconTicks, sanitizeDrum, traceRow } from "./drum";

describe("sanitizeDrum", () => {
	it("drops extra keys and hostile names", () => {
		const output = sanitizeDrum({
			now_ms: 123,
			since_ms: 12,
			synthetic: true,
			start_ms: 5,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			hidden: "no",
			observed: [[0, 10], [20, 15], [-5, 5], [8639, 9000]],
			streams: ["ok.stream", "<bad>", "two:ch"],
			stations: [{
				name: "<bad>",
				beacons: [1],
				arrivals: [[1, 0, 2]],
				hidden: "no",
			}, {
				name: "safe.station",
				beacons: [1, -1, 8640, 2.5],
				arrivals: [[1, 0, 2], [2, 2, 3], [3, 1, 1001], [4, 0, 1.5]],
			}],
		});
		expect(JSON.stringify(output)).not.toContain("hidden");
		expect(output.observed).toEqual([[0, 10], [0, 5], [8639, 8640]]);
		expect(output.streams).toEqual(["ok.stream", "two:ch"]);
		expect(output.stations).toEqual([{
			name: "safe.station",
			beacons: [1],
			arrivals: [[1, 0, 2]],
		}]);
	});

	it("drops bad indices and caps data", () => {
		const streams = Array.from({ length: 20 }, (_, i) => `stream-${i}`);
		const stations = Array.from({ length: 40 }, (_, i) => ({
			name: `station-${i}`,
			beacons: Array.from({ length: 8650 }, (_, j) => j),
			arrivals: Array.from({ length: 20010 }, (_, j) => [j % 8640, j % 20, j % 1001]),
		}));
		const output = sanitizeDrum({
			now_ms: 1,
			start_ms: 0,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			observed: Array.from({ length: 2100 }, (_, i) => [i, i + 1]),
			streams,
			stations,
		});
		expect(output.observed).toHaveLength(2000);
		expect(output.streams).toHaveLength(16);
		expect(output.stations).toHaveLength(32);
		expect(output.stations[0].beacons).toHaveLength(8640);
		expect(output.stations[0].arrivals.length).toBeLessThanOrEqual(20000);
	});

	it("returns empty drum for non-object input or wrong constants", () => {
		for (const input of [null, undefined, 42, "drum", []]) expect(sanitizeDrum(input).stations).toEqual([]);
		for (const wrong of [
			{ bucket_ms: 1000, row_ms: 900000, rows: 96 },
			{ bucket_ms: 10000, row_ms: 1000, rows: 96 },
			{ bucket_ms: 10000, row_ms: 900000, rows: 90 },
		]) expect(sanitizeDrum(wrong).stations).toEqual([]);
	});
});

describe("drum tracing", () => {
	it("creates segments at observed ranges and breaks at gaps and future buckets", () => {
		const drum = sanitizeDrum({
			now_ms: 100000,
			start_ms: 0,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			observed: [[0, 3], [5, 90]],
			streams: ["a"],
			stations: [{ name: "station", beacons: [2, 92], arrivals: [[2, 0, 9]] }],
		});
		const segments = traceRow(drum, 0, 0);
		expect(segments).toHaveLength(2);
		expect(segments[0].map((point) => point.x)).toEqual([0, 1, 2]);
		expect(segments[1][0].x).toBe(5);
		expect(segments.flat().every((point) => point.x <= 89)).toBe(true);
		expect(beaconTicks(drum, 0, 0)).toEqual([2]);
	});

	it("does not draw future buckets and draws ring-down shape", () => {
		const drum = sanitizeDrum({
			now_ms: 40000,
			start_ms: 0,
			bucket_ms: 10000,
			row_ms: 900000,
			rows: 96,
			observed: [[0, 90]],
			streams: ["a"],
			stations: [{ name: "station", beacons: [], arrivals: [[1, 0, 9]] }],
		});
		const segment = traceRow(drum, 0, 0)[0];
		expect(segment.map((point) => point.x)).toEqual([0, 1, 2, 3, 4]);
		expect(segment[1].y).toBeCloseTo(1);
		expect(segment[2].y).toBeCloseTo(-0.55);
		expect(segment[3].y).toBeCloseTo(0.3);
		expect(segment[4].y).toBeCloseTo(-0.15);
	});

	it("demo rows start on quarter hours and its unobserved stretch is a gap, not a line", () => {
		const now = Date.UTC(2026, 10, 4, 18, 7, 25);
		const demo = sanitizeDrum(DEMO_DRUM(now));
		expect(demo.synthetic).toBe(true);
		expect(demo.start_ms % 900000).toBe(0);
		expect(demo.start_ms + 95 * 900000).toBeLessThanOrEqual(now);
		expect(demo.start_ms + 96 * 900000).toBeGreaterThan(now);
		const gapRow = Math.floor(3100 / 90);
		const segments = traceRow(demo, 0, gapRow);
		expect(segments.every((seg) => seg.every((p) => {
			const bucket = gapRow * 90 + p.x;
			return bucket < 3000 || bucket >= 3400;
		}))).toBe(true);
	});

	it("creates demo data", () => {
		expect(DEMO_DRUM(1000000).synthetic).toBe(true);
		expect(DEMO_DRUM(1000000).stations).toHaveLength(3);
	});
});
