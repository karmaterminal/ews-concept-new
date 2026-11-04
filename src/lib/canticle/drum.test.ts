import { describe, expect, it } from "vitest";
import { DEMO_DRUM, beaconTicks, carrierRuns, isObserved, penIsLive, resolveStation, sanitizeDrum, traceRow } from "./drum";

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

// A producer-shaped day: a connection, a socket end, a rejoin 20 s later (two unobserved buckets), and beacon buckets
// on both sides of the gap that a 2-bucket join would bridge.  Bucket 0 of row 0 is start_ms.
function reconnectDrum(nowBucket = 60) {
	return sanitizeDrum({
		now_ms: nowBucket * 10000 + 5000,
		start_ms: 0,
		bucket_ms: 10000,
		row_ms: 900000,
		rows: 96,
		observed: [[0, 30], [32, 50]],
		streams: ["a"],
		stations: [
			{ name: "one", beacons: [27, 28, 29, 31, 32, 33, 49, 55], arrivals: [[29, 0, 2], [33, 0, 1]] },
			{ name: "two", beacons: [1], arrivals: [] },
		],
	});
}

describe("every drawn line breaks where a bucket is unobserved (🌫 on ews#7)", () => {
	it("no carrier run spans the reconnect gap, and none starts in an unobserved or future bucket", () => {
		const drum = reconnectDrum();
		expect(carrierRuns(drum, 0, 0)).toEqual([[27, 30], [32, 34], [49, 50]]);
	});

	it("walks every row: no trace point and no carrier bucket is unobserved", () => {
		for (const drum of [reconnectDrum(), sanitizeDrum(DEMO_DRUM(Date.UTC(2026, 10, 4, 18, 7, 25)))]) {
			for (let station = 0; station < drum.stations.length; station++) {
				for (let row = 0; row < drum.rows; row++) {
					const from = row * 90;
					for (const [x1, x2] of carrierRuns(drum, station, row)) {
						for (let x = x1; x < x2; x++) expect(isObserved(drum, from + x)).toBe(true);
					}
					for (const segment of traceRow(drum, station, row)) {
						for (const point of segment) expect(isObserved(drum, from + point.x)).toBe(true);
					}
				}
			}
		}
	});

	it("the pen is live only when the bucket holding now is observed", () => {
		expect(penIsLive(reconnectDrum(45))).toBe(true);
		expect(penIsLive(reconnectDrum(60))).toBe(false);
		expect(penIsLive(sanitizeDrum(null))).toBe(false);
	});
});

describe("resolveStation (🌫 on ews#7: the picker reverted on the next poll)", () => {
	it("keeps the station picked after the page loaded with another one in the URL", () => {
		const drum = reconnectDrum();
		let wanted: string | null = "one";                                  // ?station=one at load
		let index = resolveStation(drum, wanted, 0);
		expect(index).toBe(0);
		wanted = "two";                                                     // the reader picks two
		index = 1;
		for (let poll = 0; poll < 3; poll++) index = resolveStation(drum, wanted, index);
		expect(drum.stations[index].name).toBe("two");
	});

	it("falls back to the current index, then the first, when the wanted station is gone", () => {
		const drum = reconnectDrum();
		expect(resolveStation(drum, "gone", 1)).toBe(1);
		expect(resolveStation(drum, "gone", 5)).toBe(0);
		expect(resolveStation(drum, null, 1)).toBe(1);
	});
});
