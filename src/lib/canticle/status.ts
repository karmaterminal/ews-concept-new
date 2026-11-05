import { CANTICLE_IDENTIFIER, carrierLevel, type Shape, type ShapeStation } from "./shape";
import type { Drum } from "./drum";
import { isObserved } from "./drum";
import type { Flow } from "./flow";

// Whether the page may draw a station as heard: a live gateway link, or synthetic demo data (labelled SYNTHETIC, and
// with no collector to be blind).  DEMO_SHAPE is connected:false by design (no live link), so the demo needs this.
export function linked(shape: Shape): boolean {
	return shape.connected || shape.synthetic;
}

export function barLook(station: ShapeStation, shape: Shape): "up" | "dim" | "unobserved" {
	if (!linked(shape)) return "unobserved";
	if (
		carrierLevel(station.beacon_age_ms) > 0 &&
		!["not_heard", "UNOBSERVABLE", "UNOBSERVABLE:signed_off", "unknown"].includes(station.state)
	) return "up";
	return "dim";
}

export function streamsFor(drum: Drum, stationName: string, shapeStation?: ShapeStation): string[] {
	if (!CANTICLE_IDENTIFIER.test(stationName)) return [];
	const names = new Set<string>();

	if (shapeStation) {
		for (const stream of shapeStation.streams) {
			if (CANTICLE_IDENTIFIER.test(stream.stream)) names.add(stream.stream);
		}
	}

	const station = drum.stations.find((item) => item.name === stationName);
	if (station) {
		for (const [, streamIndex] of station.arrivals) {
			const stream = drum.streams[streamIndex];
			if (typeof stream === "string" && CANTICLE_IDENTIFIER.test(stream)) names.add(stream);
		}
	}

	return Array.from(names).sort();
}

export function waveform(
	drum: Drum,
	stationName: string,
	stream: string | null,
	buckets = 360,
): { x: number; y: number }[][] {
	if (
		!CANTICLE_IDENTIFIER.test(stationName) ||
		(stream !== null && !CANTICLE_IDENTIFIER.test(stream)) ||
		!Number.isInteger(buckets) ||
		buckets < 1
	) return [];

	const station = drum.stations.find((item) => item.name === stationName);
	if (!station) return [];

	const latestBucket = Math.floor((drum.now_ms - drum.start_ms) / drum.bucket_ms);
	const firstBucket = Math.max(0, latestBucket - buckets + 1);
	const segments: { x: number; y: number }[][] = [];
	let segment: { x: number; y: number }[] = [];

	for (let x = 0; x < buckets; x++) {
		const bucket = firstBucket + x;
		if (bucket > latestBucket || !isObserved(drum, bucket)) {
			if (segment.length > 0) segments.push(segment);
			segment = [];
			continue;
		}

		let y = 0;
		for (const [arrivalBucket, streamIndex, count] of station.arrivals) {
			if (arrivalBucket !== bucket) continue;
			if (stream === null) {
				y += count;
			} else if (drum.streams[streamIndex] === stream) {
				y += count;
			}
		}
		segment.push({ x, y });
	}
	if (segment.length > 0) segments.push(segment);
	return segments;
}

export function logFor(
	flow: Flow,
	stationName: string,
	stream: string | null,
	limit = 50,
): { at_ms: number; stream: string }[] {
	if (
		!CANTICLE_IDENTIFIER.test(stationName) ||
		(stream !== null && !CANTICLE_IDENTIFIER.test(stream))
	) return [];

	const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
	if (safeLimit === 0) return [];

	return flow.river
		.filter((item) =>
			item.station === stationName &&
			CANTICLE_IDENTIFIER.test(item.stream) &&
			(stream === null || item.stream === stream)
		)
		.sort((a, b) => b.at_ms - a.at_ms)
		.slice(0, safeLimit)
		.map((item) => ({ at_ms: item.at_ms, stream: item.stream }));
}
