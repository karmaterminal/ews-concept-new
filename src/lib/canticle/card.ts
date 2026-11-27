// RED stub: the house card's shape, before its renderer.
import type { House } from "./house";

export type Tri = "yes" | "no" | "unknown";
export type CardStream = { stream: string; arrivals: number | null; newest_age_ms: number | null; admitted: boolean | null };
export type CardStation = { name: string; host: string | null; state: string; beacon_age_ms: number | null; withheld: boolean; streams: CardStream[] };
export type CardDeck = { now_ms: number; synthetic: boolean; connected: boolean; window_start_ms: number | null; stations: CardStation[] };
export type ReaderProfile = { reader: string; payload_text: boolean | null; may_read: string[] | null };
export type StreamReading = { visible: Tri; admitted: Tri; readable: Tri; why: string | null };

export const DEMO_WINDOW_MS = 0;
export const DEMO_READERS: Record<string, ReaderProfile> = {};
export function deckFromHouse(house: House, _streams: Record<string, unknown[]>, window_start_ms: number | null): CardDeck {
	return { now_ms: house.now_ms, synthetic: house.synthetic, connected: house.connected, window_start_ms, stations: [] };
}
export function DEMO_DECK(_now: number, _opts?: { blind?: boolean }): CardDeck {
	return { now_ms: 0, synthetic: true, connected: true, window_start_ms: null, stations: [] };
}
export function sanitizeReader(_raw: unknown): ReaderProfile | null { return null; }
export function streamReading(_s: CardStation, _stream: string, _d: CardDeck, _r: ReaderProfile | null): StreamReading {
	return { visible: "unknown", admitted: "unknown", readable: "unknown", why: null };
}
export function renderStationCard(_s: CardStation, _d: CardDeck, _r: ReaderProfile | null): string { return ""; }
export function renderHouseCard(_d: CardDeck, _r: ReaderProfile | null): string { return ""; }
