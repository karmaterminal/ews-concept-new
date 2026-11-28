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
		// Four patterns were dropped, so the scope is partial: a miss can't be a definite no.
		expect(reader).toEqual({ reader: "ok", payload_text: true, may_read: ["demo-iris:chatter"], may_read_left_out: 4 });
		const line = streamLine(card(DEMO_DECK(NOW), "demo-iris", reader), "forge");
		expect(line).not.toContain("readable here: yes");
		expect(card(DEMO_DECK(NOW), "demo-moss", reader)).toContain("readable here: unknown (demo-moss:lighthouse is outside the part of this reader's read scope the card kept; the scope is partial)");
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

describe("stream knowledge: unknown is not empty, and a partial list is not a total (🌻, #13 review)", () => {
	const START = NOW - 3600000;
	it("a station the display has no stream knowledge for prints unknown, never 0 or none heard", () => {
		const deck = deckFromHouse(DEMO_HOUSE(NOW), {}, START);
		const text = card(deck, "demo-moss");
		expect(text).toContain("arrivals   unknown (no stream knowledge for this station)");
		expect(text).toContain("streams    unknown (no stream knowledge for this station)");
		expect(text).not.toMatch(/arrivals {3}0 /);
	});
	it("a known-empty stream list still prints 0 and none heard", () => {
		const deck = deckFromHouse(DEMO_HOUSE(NOW), { "demo-moss": [] }, START);
		const text = card(deck, "demo-moss");
		expect(text).toMatch(/arrivals {3}0 since /);
		expect(text).toContain("streams    none heard");
	});
	it("more entries than the card keeps prints at least, with how many were left out", () => {
		const many = Array.from({ length: 17 }, (_, i) => ({ stream: `s${String(i).padStart(2, "0")}`, arrivals: 1, newest_age_ms: 1000, admitted: true }));
		const deck = deckFromHouse(DEMO_HOUSE(NOW), { "demo-moss": many }, START);
		const text = card(deck, "demo-moss");
		expect(text).toMatch(/arrivals {3}at least 16 since .* \(1 of 17 stream entries not shown\)/);
		expect(text).toContain("(+1 not shown)");
		expect(text).not.toMatch(/arrivals {3}16 since/);
	});
	it("an entry dropped as malformed also makes the count partial", () => {
		const deck = deckFromHouse(DEMO_HOUSE(NOW), { "demo-moss": [{ stream: "ok", arrivals: 2, newest_age_ms: 1, admitted: true }, { stream: "bad name!", arrivals: 5 }] }, START);
		expect(card(deck, "demo-moss")).toMatch(/arrivals {3}at least 2 since .* \(1 of 2 stream entries not shown\)/);
	});
});

describe("a partial read scope is not a total (🌫, ews#14 review): a pattern the card didn't keep never makes a no", () => {
	const fillers = Array.from({ length: 64 }, (_, i) => `z${i}:other`);
	const reader = (may_read: string[]) => sanitizeReader({ reader: "many", payload_text: true, may_read });
	const line = (r: ReaderProfile | null) => streamLine(card(DEMO_DECK(NOW), "demo-moss", r), "lighthouse");

	it("the 65th pattern, past the cap: unknown and says the scope is partial, never no", () => {
		const r = reader([...fillers, "demo-moss:lighthouse"]);
		expect(r?.may_read).toHaveLength(64);
		expect(r?.may_read_left_out).toBe(1);
		expect(line(r)).toContain("readable here: unknown");
		expect(line(r)).toContain("the scope is partial");
		expect(line(r)).not.toContain("readable here: no");
	});

	it("the same pattern moved first: yes", () => {
		const r = reader(["demo-moss:lighthouse", ...fillers]);
		expect(r?.may_read_left_out).toBe(1);
		expect(line(r)).toContain("readable here: yes");
	});

	it("control: exactly 64 patterns, none for the stream, is a whole scope and a definite no", () => {
		const r = reader(fillers);
		expect(r?.may_read_left_out).toBeUndefined();
		expect(line(r)).toContain("readable here: no (demo-moss:lighthouse is outside this reader's read scope)");
	});

	it("a duplicate past the cap is not a lost pattern", () => {
		expect(reader([...fillers, "z0:other"])?.may_read_left_out).toBeUndefined();
	});

	it("a source that says its scope is incomplete keeps it partial, count unknown", () => {
		const r = sanitizeReader({ reader: "src", payload_text: true, may_read: ["demo-iris:*"], may_read_complete: false });
		expect(r?.may_read_left_out).toBeNull();
		expect(line(r)).toContain("readable here: unknown");
		expect(streamLine(card(DEMO_DECK(NOW), "demo-iris", r), "chatter")).toContain("readable here: yes");
	});

	it("a source's withheld count is carried and added to the card's own drops; a bad count is unknown", () => {
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b", "bad"], may_read_complete: false, may_read_withheld: 2 })?.may_read_left_out).toBe(3);
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b"], may_read_complete: false, may_read_withheld: -1 })?.may_read_left_out).toBeNull();
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b"], may_read_complete: false })?.may_read_left_out).toBeNull();
		// A count that isn't one makes how many unknown, flag or no flag.
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b"], may_read_withheld: "1" })?.may_read_left_out).toBeNull();
		// A count with no flag, or the flag saying complete, still can't make the scope whole.
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b"], may_read_complete: true, may_read_withheld: 1 })?.may_read_left_out).toBe(1);
		expect(sanitizeReader({ reader: "src", payload_text: true, may_read: ["a:b"], may_read_withheld: 0 })?.may_read_left_out).toBeUndefined();
	});

	it("an independently known denial stays no under a partial scope: the grant, or payload text off", () => {
		const partial = reader([...fillers, "demo-iris:chatter"]);
		expect(streamLine(card(DEMO_DECK(NOW), "demo-iris", partial), "forge")).toContain("readable here: no (the manifest grant does not admit this stream)");
		const off = sanitizeReader({ reader: "off", payload_text: false, may_read: [...fillers, "x:y"] });
		expect(line(off)).toContain("readable here: no (payload text is off for this session)");
		expect(line(off)).not.toContain("outside");
	});

	it("the header says the scope is partial and how much was left out", () => {
		const text = renderHouseCard(DEMO_DECK(NOW), reader([...fillers, "demo-moss:lighthouse"]));
		expect(text).toContain("(partial: 1 pattern not kept, so a stream outside it reads unknown)");
		const unknown = renderHouseCard(DEMO_DECK(NOW), sanitizeReader({ reader: "src", payload_text: true, may_read: [], may_read_complete: false }));
		expect(unknown).toContain("read scope: none (partial: some patterns not kept, so a stream outside it reads unknown)");
	});
});
