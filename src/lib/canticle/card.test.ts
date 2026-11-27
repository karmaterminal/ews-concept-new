import { describe, expect, it } from "vitest";
import {
	DEMO_DECK,
	DEMO_READERS,
	DEMO_WINDOW_MS,
	deckFromHouse,
	renderHouseCard,
	renderStationCard,
	sanitizeReader,
	streamReading,
	type CardDeck,
	type ReaderProfile,
} from "./card";
import { DEMO_HOUSE } from "./house";

// A fixed instant, so every age and time on a card is the same on every run.
const NOW = Date.UTC(2026, 10, 27, 9, 0, 0);

function card(deck: CardDeck, name: string, reader: ReaderProfile | null = DEMO_READERS["demo-reader-full"]): string {
	const station = deck.stations.find((item) => item.name === name);
	if (!station) throw new Error(`no ${name} in the demo deck`);
	return renderStationCard(station, deck, reader);
}

function streamLine(text: string, stream: string): string {
	const line = text.split("\n").find((item) => item.trimStart().startsWith(`${stream} `));
	if (!line) throw new Error(`no line for stream ${stream} in:\n${text}`);
	return line;
}

describe("the lighthouse case: station visible, stream admitted, not readable here", () => {
	it("says all three, with the reader's read scope as the reason", () => {
		const deck = DEMO_DECK(NOW);
		const text = card(deck, "demo-moss", DEMO_READERS["demo-reader-scoped"]);
		expect(text).toContain("station visible: yes");
		const line = streamLine(text, "lighthouse");
		expect(line).toContain("station visible: yes");
		expect(line).toContain("stream admitted: yes");
		expect(line).toContain("readable here: no");
		expect(line).toContain("outside this reader's read scope");
		expect(line).not.toContain("readable here: yes");
	});

	it("says payload text is off when that is the reason", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-moss", DEMO_READERS["demo-reader-shape-only"]), "lighthouse");
		expect(line).toContain("station visible: yes · stream admitted: yes · readable here: no");
		expect(line).toContain("payload text is off for this session");
	});

	it("still carries the DECK fields: name, host, state line, beacon age, arrivals since window start, streams", () => {
		const deck = DEMO_DECK(NOW);
		const text = card(deck, "demo-moss", DEMO_READERS["demo-reader-scoped"]);
		const windowStart = new Date(NOW - DEMO_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
		expect(text.split("\n")[0]).toBe("demo-moss  (host: blank)");
		expect(text).toContain("EQUIPPED_QUIET · carrier up · root heard · no stream lately");
		expect(text).toContain("beacon     3.3 s ago");
		expect(text).toContain(`arrivals   7 since ${windowStart}`);
		expect(text).toContain("streams    lighthouse");
		expect(text).not.toMatch(/today/i);
	});
});

describe("a station not visible", () => {
	it("says its beacon is not heard, and keeps the permission answer apart: readable when heard", () => {
		const deck = DEMO_DECK(NOW);
		const text = card(deck, "demo-balthasar");
		expect(text).toContain("station visible: no");
		expect(text).toContain("beacon     none heard");
		const line = streamLine(text, "chatter");
		expect(line).toContain("station visible: no · stream admitted: yes · readable here: yes (when heard)");
		expect(line).not.toContain("nothing from this station is heard here now");
	});

	it("when not visible and outside the reader's scope, says no with only the scope reason", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-balthasar", DEMO_READERS["demo-reader-scoped"]), "chatter");
		expect(line).toContain(
			"station visible: no · stream admitted: yes · readable here: no (demo-balthasar:chatter is outside this reader's read scope)",
		);
		expect(line.endsWith("outside this reader's read scope)")).toBe(true);
	});

	it("is no when its last beacon is stale, even with a heard state word", () => {
		const house = DEMO_HOUSE(NOW);
		house.hosts[0].stations[0].beacon_age_ms = 45000;
		const deck = deckFromHouse(house, { "demo-iris": [{ stream: "chatter", arrivals: 1, newest_age_ms: 45000, admitted: true }] }, NOW - 1000);
		const text = card(deck, "demo-iris");
		expect(text).toContain("station visible: no (its last beacon is stale)");
		expect(streamLine(text, "chatter")).toContain("station visible: no · stream admitted: yes · readable here: yes (when heard)");
	});

	it("is unknown, not no, when the collector itself has no link (§1.3 unobserved)", () => {
		const deck = DEMO_DECK(NOW, { blind: true });
		const text = card(deck, "demo-iris");
		expect(text).toContain("station visible: unknown");
		expect(text).not.toContain("station visible: yes");
		expect(text).not.toContain("station visible: no");
		expect(streamLine(text, "chatter")).toContain("station visible: unknown · stream admitted: yes · readable here: yes (when heard)");
		// without a reader profile, still unknown: no link never turns into a permission answer
		expect(streamLine(renderStationCard(deck.stations[0], deck, null), "chatter")).toContain("readable here: unknown (no reader profile)");
		// the last state word and beacon age aren't printed as current (§1.4)
		expect(text).toContain("state      unobserved (the collector has no link)");
		expect(text).toContain("beacon     unknown (no link)");
		expect(text).not.toContain("EQUIPPED_SPEAKING");
	});
});

describe("a stream not admitted", () => {
	it("is not readable here, even for a reader whose profile would read everything", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-iris", DEMO_READERS["demo-reader-full"]), "forge");
		expect(line).toContain("station visible: yes · stream admitted: no · readable here: no");
		expect(line).toContain("the manifest grant does not admit this stream");
	});

	it("stays unknown when the grant's answer is unknown, whatever the reader says", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-reed", DEMO_READERS["demo-reader-full"]), "river");
		expect(line).toContain("stream admitted: unknown · readable here: unknown");
	});
});

describe("a fully readable stream", () => {
	it("says readable here only when visible, admitted, payload text on and the scope covers it", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-iris", DEMO_READERS["demo-reader-full"]), "chatter");
		expect(line).toContain("station visible: yes · stream admitted: yes · readable here: yes");
		expect(streamReading(deck.stations.find((s) => s.name === "demo-iris")!, "chatter", deck, DEMO_READERS["demo-reader-full"]))
			.toEqual({ visible: "yes", admitted: "yes", readable: "yes", why: null });
	});

	it("a scoped reader reads what its scope names", () => {
		const deck = DEMO_DECK(NOW);
		const line = streamLine(card(deck, "demo-iris", DEMO_READERS["demo-reader-scoped"]), "chatter");
		expect(line).toContain("readable here: yes");
	});
});

describe("honesty: readable only on the reader profile's word, unknown stays unknown", () => {
	it("without a reader profile no stream reads as readable, and the header says why", () => {
		const text = renderHouseCard(DEMO_DECK(NOW), null);
		expect(text).not.toContain("readable here: yes");
		expect(text).toContain("reader     none given: readable here stays unknown");
		expect(streamLine(text, "lighthouse")).toContain("readable here: unknown (no reader profile)");
		// a definite no from the station or the grant still holds without a reader
		expect(streamLine(text, "forge")).toContain("readable here: no");
	});

	it("a reader whose payload-text setting is unknown reads nothing as readable", () => {
		const reader = sanitizeReader({ reader: "half-known", payload_text: "yes", may_read: ["*:*"] });
		expect(reader).toEqual({ reader: "half-known", payload_text: null, may_read: ["*:*"] });
		const line = streamLine(card(DEMO_DECK(NOW), "demo-iris", reader), "chatter");
		expect(line).toContain("readable here: unknown (this session's payload-text setting is unknown)");
	});

	it("a reader whose read scope is unknown reads nothing as readable", () => {
		const reader = sanitizeReader({ reader: "no-scope", payload_text: true });
		expect(reader?.may_read).toBeNull();
		const line = streamLine(card(DEMO_DECK(NOW), "demo-iris", reader), "chatter");
		expect(line).toContain("readable here: unknown (this reader's read scope is unknown)");
	});

	it("drops hostile reader input: bad names, bad patterns, extra keys", () => {
		expect(sanitizeReader("nope")).toBeNull();
		expect(sanitizeReader({ reader: "bad\nname", payload_text: true, may_read: [] })).toBeNull();
		const reader = sanitizeReader({
			reader: "ok",
			payload_text: true,
			may_read: ["demo-iris:chatter", "bad pattern", "no-colon", "*:*\nevil", 5],
			hidden: "no",
		});
		expect(reader).toEqual({ reader: "ok", payload_text: true, may_read: ["demo-iris:chatter"] });
	});

	it("a withheld station shows a closed seal and no stream lines at all", () => {
		const text = card(DEMO_DECK(NOW), "demo-casper");
		expect(text).toContain("withheld by its prince's grant");
		expect(text).not.toContain("readable here");
		expect(text).not.toContain("stream admitted");
	});

	it("arrivals stay unknown when the window start or a stream's count is unknown", () => {
		const house = DEMO_HOUSE(NOW);
		const noWindow = deckFromHouse(house, { "demo-iris": [{ stream: "chatter", arrivals: 4, newest_age_ms: 100, admitted: true }] }, null);
		expect(card(noWindow, "demo-iris")).toContain("arrivals   unknown (no window start)");
		const noCount = deckFromHouse(house, { "demo-iris": [{ stream: "chatter", arrivals: null, newest_age_ms: null, admitted: true }] }, NOW - 1000);
		expect(card(noCount, "demo-iris")).toContain("arrivals   unknown");
	});

	it("labels synthetic data, and never carries anything but the closed fields", () => {
		const text = renderHouseCard(DEMO_DECK(NOW), DEMO_READERS["demo-reader-scoped"]);
		expect(text.split("\n")[0]).toBe("HOUSE CARD · SYNTHETIC — DEMO DATA");
		expect(text).toContain("reader     demo-reader-scoped · payload text: on · read scope: demo-iris:*, demo-reed:chatter");
		const deck = deckFromHouse(DEMO_HOUSE(NOW), {
			"demo-iris": [
				{ stream: "chatter", arrivals: 1, newest_age_ms: 1, admitted: true, text: "secret" } as never,
				{ stream: "bad\nstream", arrivals: 1, newest_age_ms: 1, admitted: true },
			],
		}, NOW - 1000);
		const out = renderHouseCard(deck, null);
		expect(out).not.toContain("secret");
		expect(out).not.toContain("bad\nstream");
	});
});
