import { CANTICLE_IDENTIFIER } from "./shape";

export type Drum = {
	now_ms: number;
	since_ms: number;
	synthetic: boolean;
	start_ms: number;
	bucket_ms: number;
	row_ms: number;
	rows: number;
	observed: [number, number][];
	streams: string[];
	stations: DrumStation[];
};

export type DrumStation = {
	name: string;
	beacons: number[];
	arrivals: [number, number, number][];
};

export type DrumPoint = { x: number; y: number };
export type TraceSegment = DrumPoint[];

const BUCKET_MS = 10000;
const ROW_MS = 900000;
const ROWS = 96;
const BUCKETS_PER_ROW = 90;
const BUCKET_COUNT = 8640;

function nonNegativeNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

function emptyDrum(now = Date.now(), synthetic = false): Drum {
	return {
		now_ms: now,
		since_ms: 0,
		synthetic,
		start_ms: 0,
		bucket_ms: BUCKET_MS,
		row_ms: ROW_MS,
		rows: ROWS,
		observed: [],
		streams: [],
		stations: [],
	};
}

export function sanitizeDrum(raw: unknown): Drum {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return emptyDrum();
	}

	const source = raw as Record<string, unknown>;
	if (
		source.bucket_ms !== BUCKET_MS ||
		source.row_ms !== ROW_MS ||
		source.rows !== ROWS
	) {
		return emptyDrum(nonNegativeNumber(source.now_ms) ?? Date.now());
	}

	const now = nonNegativeNumber(source.now_ms) ?? 0;
	const since = nonNegativeNumber(source.since_ms) ?? 0;
	const start = nonNegativeNumber(source.start_ms) ?? 0;

	const observed: [number, number][] = [];
	if (Array.isArray(source.observed)) {
		for (const rawRange of source.observed.slice(0, 2000)) {
			if (!Array.isArray(rawRange) || rawRange.length !== 2) continue;
			if (!Number.isInteger(rawRange[0]) || !Number.isInteger(rawRange[1])) continue;
			const from = Math.max(0, Math.min(BUCKET_COUNT, rawRange[0]));
			const to = Math.max(0, Math.min(BUCKET_COUNT, rawRange[1]));
			if (from < to) observed.push([from, to]);
		}
	}

	const streams: string[] = [];
	if (Array.isArray(source.streams)) {
		for (const stream of source.streams.slice(0, 16)) {
			if (typeof stream === "string" && CANTICLE_IDENTIFIER.test(stream)) streams.push(stream);
		}
	}

	const stations: DrumStation[] = [];
	if (Array.isArray(source.stations)) {
		for (const rawStation of source.stations.slice(0, 32)) {
			if (typeof rawStation !== "object" || rawStation === null || Array.isArray(rawStation)) continue;
			const station = rawStation as Record<string, unknown>;
			if (typeof station.name !== "string" || !CANTICLE_IDENTIFIER.test(station.name)) continue;

			const beacons: number[] = [];
			if (Array.isArray(station.beacons)) {
				for (const rawIndex of station.beacons.slice(0, 8640)) {
					if (Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < BUCKET_COUNT) {
						beacons.push(rawIndex);
					}
				}
			}

			const arrivals: [number, number, number][] = [];
			if (Array.isArray(station.arrivals)) {
				for (const rawArrival of station.arrivals.slice(0, 20000)) {
					if (!Array.isArray(rawArrival) || rawArrival.length !== 3) continue;
					const [i, streamIndex, count] = rawArrival;
					if (
						!Number.isInteger(i) ||
						i < 0 ||
						i >= BUCKET_COUNT ||
						!Number.isInteger(streamIndex) ||
						streamIndex < 0 ||
						streamIndex >= streams.length ||
						!Number.isInteger(count) ||
						count < 1 ||
						count > 1000
					) continue;
					arrivals.push([i, streamIndex, count]);
				}
			}

			stations.push({ name: station.name, beacons, arrivals });
		}
	}

	return {
		now_ms: now,
		since_ms: since,
		synthetic: typeof source.synthetic === "boolean" ? source.synthetic : false,
		start_ms: start,
		bucket_ms: BUCKET_MS,
		row_ms: ROW_MS,
		rows: ROWS,
		observed,
		streams,
		stations,
	};
}

export function DEMO_DRUM(now: number): Drum {
	const safeNow = typeof now === "number" && Number.isFinite(now) && now >= 0 ? now : 0;
	// rows start on quarter hours, as the gateway's do; the last row holds now
	const start = (Math.floor(safeNow / ROW_MS) - ROWS + 1) * ROW_MS;
	const upto = Math.min(BUCKET_COUNT, Math.floor((safeNow - start) / BUCKET_MS) + 1);
	const gap: [number, number] = [3000, 3400]; // an unobserved stretch, drawn as a gap, never a flat line
	const inGap = (i: number) => i >= gap[0] && i < gap[1];
	const station = (name: string, period: number, burst: number, stream: number, beaconEvery: number): DrumStation => {
		const beacons: number[] = [];
		const arrivals: [number, number, number][] = [];
		for (let i = 0; i < upto; i++) {
			if (inGap(i)) continue;
			if (beaconEvery > 0 && i % beaconEvery === 0) beacons.push(i);
			if (period > 0 && i % period === 0) arrivals.push([i, stream, 1 + (Math.floor(i / period) % 3)]);
			if (burst >= 0 && i >= burst && i < burst + 30 && (i - burst) % 3 === 0) arrivals.push([i, stream, 6]);
		}
		return { name, beacons, arrivals };
	};
	return {
		now_ms: safeNow,
		since_ms: start,
		synthetic: true,
		start_ms: start,
		bucket_ms: BUCKET_MS,
		row_ms: ROW_MS,
		rows: ROWS,
		observed: [[0, gap[0]], [gap[1], upto]],
		streams: ["chatter", "facts"],
		stations: [
			station("demo-melchior", 37, 5200, 0, 1),
			station("demo-balthasar", 181, 7000, 1, 1),
			station("demo-casper", 0, -1, 0, 0),
		],
	};
}

export function isObserved(drum: Drum, bucket: number): boolean {
	return drum.observed.some(([from, to]) => bucket >= from && bucket < to);
}

export function traceRow(drum: Drum, stationIndex: number, row: number): TraceSegment[] {
	if (
		!Number.isInteger(stationIndex) ||
		stationIndex < 0 ||
		stationIndex >= drum.stations.length ||
		!Number.isInteger(row) ||
		row < 0 ||
		row >= drum.rows
	) return [];

	const station = drum.stations[stationIndex];
	const counts = new Map<number, number>();
	for (const [bucket, _streamIndex, count] of station.arrivals) counts.set(bucket, (counts.get(bucket) ?? 0) + count);

	const latestBucket = Math.floor((drum.now_ms - drum.start_ms) / drum.bucket_ms);
	const segments: TraceSegment[] = [];
	let segment: TraceSegment = [];

	for (let x = 0; x < BUCKETS_PER_ROW; x++) {
		const bucket = row * BUCKETS_PER_ROW + x;
		if (bucket > latestBucket || !isObserved(drum, bucket)) {
			if (segment.length > 0) segments.push(segment);
			segment = [];
			continue;
		}

		let amplitude = 0;
		for (let offset = 0; offset <= 3; offset++) {
			const source = bucket - offset;
			if (source < 0) continue;
			const total = counts.get(source) ?? 0;
			if (total === 0) continue;
			const sourceAmplitude = Math.min(1, Math.sqrt(total) / 3);
			const factor = offset === 0 ? 1 : offset === 1 ? -0.55 : offset === 2 ? 0.3 : -0.15;
			amplitude += factor * sourceAmplitude;
		}
		segment.push({ x, y: amplitude });
	}
	if (segment.length > 0) segments.push(segment);
	return segments;
}

export function beaconTicks(drum: Drum, stationIndex: number, row: number): number[] {
	if (
		!Number.isInteger(stationIndex) ||
		stationIndex < 0 ||
		stationIndex >= drum.stations.length ||
		!Number.isInteger(row) ||
		row < 0 ||
		row >= drum.rows
	) return [];
	const from = row * BUCKETS_PER_ROW;
	const to = from + BUCKETS_PER_ROW;
	return drum.stations[stationIndex].beacons
		.filter((bucket) => bucket >= from && bucket < to)
		.map((bucket) => bucket - from);
}
