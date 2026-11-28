import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_DECK, renderHouseCard, renderStationCard, streamReading } from "./card";
import { cardFromExport } from "./house-export";

// A frond-ear `house-export` document (frond-ear src/canticle/house-cli.ts) as fixture: names and state words only.
const FIXTURE_PATH = join(import.meta.dirname, "fixtures", "house-export.sample.json");
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, unknown>;

function live(raw: unknown = FIXTURE) {
	const card = cardFromExport(raw);
	if (card === null) throw new Error("the fixture is not a house export");
	return card;
}

function stationText(name: string, raw: unknown = FIXTURE): string {
	const { deck, reader } = live(raw);
	const station = deck.stations.find((item) => item.name === name);
	if (!station) throw new Error(`no ${name}`);
	return renderStationCard(station, deck, reader);
}

function streamLine(text: string, stream: string): string {
	const line = text.split("\n").find((item) => item.trimStart().startsWith(`${stream} `));
	if (!line) throw new Error(`no line for stream ${stream} in:\n${text}`);
	return line;
}

/** The fixture with `edit` applied to a deep copy. */
function edited(edit: (doc: any) => void): unknown {
	const doc = structuredClone(FIXTURE);
	edit(doc);
	return doc;
}

describe("the live card: one ear's export, said as LIVE and by its source", () => {
	it("heads LIVE (this ear) with the export's source, never SYNTHETIC", () => {
		const { deck, reader } = live();
		const text = renderHouseCard(deck, reader);
		expect(text.split("\n")[0]).toBe("HOUSE CARD · LIVE (this ear) · frond-ear abc1234 ear fixture-ear");
		expect(text).not.toContain("SYNTHETIC");
		expect(text).toContain("as of      2026-11-27T09:00:00Z");
		expect(text).toContain("window     start unknown");
		expect(text).toContain("collector  linked");
		expect(text).toContain(
			"reader     fixture-ear · payload text: on · read scope: fixture-scribe:chatter, fixture-scribe:facts, *:ops.fleet, fixture-dark:chatter",
		);
	});

	it("the demo stays the default and stays labelled", () => {
		expect(renderHouseCard(DEMO_DECK(Date.UTC(2026, 10, 27, 9)), null).split("\n")[0]).toBe("HOUSE CARD · SYNTHETIC — DEMO DATA");
	});

	it("the lighthouse case from a real export: visible, admitted, not readable here (untuned)", () => {
		const line = streamLine(stationText("fixture-lighthouse"), "lighthouse");
		expect(line).toContain("station visible: yes · stream admitted: yes · readable here: no");
		expect(line).toContain("fixture-lighthouse:lighthouse is outside this reader's read scope");
	});

	it("a presence word that says the beacon is heard makes the station visible, without inventing an age", () => {
		const text = stationText("fixture-scribe");
		expect(text).toContain("state      EQUIPPED_SPEAKING · carrier up · root heard · a stream sang lately");
		expect(text).toContain("beacon     heard (no age in this export)");
		expect(text).toContain("station visible: yes (its presence word says its beacon is heard; no beacon age given)");
		expect(text).not.toMatch(/beacon {5}none heard/);
		expect(streamLine(text, "chatter")).toContain("station visible: yes · stream admitted: yes · readable here: yes");
		expect(streamLine(text, "display")).toContain("readable here: no (fixture-scribe:display is outside this reader's read scope)");
	});

	it("a station the daemon read but whose beacon its presence table doesn't hold is not heard; its tuned stream reads when heard", () => {
		const text = stationText("fixture-dark");
		expect(text).toContain("state      not_heard");
		expect(text).toContain("station visible: no (its beacon is not heard here)");
		expect(streamLine(text, "chatter")).toContain("readable here: yes (when heard)");
	});

	it("a stream the manifest doesn't name keeps admission unknown, so readable here stays unknown", () => {
		const line = streamLine(stationText("fixture-root"), "ops.fleet");
		expect(line).toContain("stream admitted: unknown · readable here: unknown (the grant's answer is unknown)");
	});

	it("arrivals stay unknown with no window start; on-air streams still print as heard", () => {
		const text = stationText("fixture-scribe");
		expect(text).toContain("arrivals   unknown (no window start)");
		expect(text).toContain("streams    chatter");
		expect(text).not.toMatch(/arrivals {3}\d/);
	});

	it("every stream the export marks tuned is in the reader's scope, and every untuned one is out of it", () => {
		const { deck, reader } = live();
		const raw = (FIXTURE.deck as { stations: Array<{ name: string; streams: Array<{ stream: string; tuned: boolean; admitted: boolean | null }> }> }).stations;
		let checked = 0;
		for (const station of raw) {
			const card = deck.stations.find((item) => item.name === station.name)!;
			for (const stream of station.streams) {
				if (stream.admitted !== true) continue; // only admitted × payload text on leaves scope as the deciding part
				const r = streamReading(card, stream.stream, deck, reader);
				expect(r.readable === "no", `${station.name}:${stream.stream}`).toBe(!stream.tuned);
				checked += 1;
			}
		}
		expect(checked).toBe(5);
	});
});

describe("the adapter takes only a house export, and only its closed fields", () => {
	it("refuses a document that isn't one: wrong kind, a SYNTHETIC or malformed source, no time", () => {
		expect(cardFromExport(null)).toBeNull();
		expect(cardFromExport([])).toBeNull();
		expect(cardFromExport(edited((d) => (d.kind = "frond-house-export/9")))).toBeNull();
		expect(cardFromExport(edited((d) => (d.source = "SYNTHETIC")))).toBeNull();
		expect(cardFromExport(edited((d) => (d.source = "frond-ear abc1234 ear fixture-ear SYNTHETIC")))).toBeNull();
		expect(cardFromExport(edited((d) => (d.source = "frond-ear abc1234 ear fixture-ear\nHOUSE CARD")))).toBeNull();
		expect(cardFromExport(edited((d) => delete d.now_ms))).toBeNull();
		expect(cardFromExport(edited((d) => delete d.deck))).toBeNull();
	});

	it("never prints a payload, a key, an id or a word it doesn't know", () => {
		const raw = edited((d) => {
			d.text = "secret-payload";
			d.deck.stations[1].text = "secret-payload";
			d.deck.stations[1].key_id = "0123456789abcdef";
			d.deck.stations[1].streams[0].text = "secret-payload";
			d.deck.stations[1].streams[0].body = { text: "secret-payload" };
			d.deck.stations[2].presence = "EVIL\nWORD";
			d.deck.stations.push({ name: "bad name!", presence: "EQUIPPED_QUIET", streams: [] });
			d.deck.stations.push({ name: "1122611838010535946", presence: "EQUIPPED_QUIET", streams: [] });
			d.reader.may_read.push("bad pattern");
		});
		const { deck, reader } = live(raw);
		const text = renderHouseCard(deck, reader);
		expect(text).not.toContain("secret");
		expect(text).not.toContain("0123456789abcdef");
		expect(text).not.toContain("EVIL");
		expect(text).not.toContain("bad name!");
		expect(text).not.toContain("bad pattern");
		expect(text).not.toMatch(/[0-9]{17,20}/);
		expect(text).toContain("fixture-root  (host: blank)\n  state      unknown");
	});

	it("a config-only export (daemon not reached) reads unobserved, never offline or not heard", () => {
		const raw = edited((d) => {
			d.deck.view = "config";
			d.deck.listener = "not reached";
			d.deck.connected = false;
			for (const s of d.deck.stations) {
				s.presence = null;
				s.streams_known = "partial";
				for (const x of s.streams) [x.live, x.newest_age_ms] = [null, null];
			}
		});
		const { deck, reader } = live(raw);
		const text = renderHouseCard(deck, reader);
		expect(text).toContain("collector  no link: every station is unobserved, not offline");
		expect(text).not.toContain("not_heard");
		expect(stationText("fixture-dark", raw)).toContain("station visible: unknown (the collector has no link");
		// With no daemon view a missing presence word is unknown, not "not heard".
		expect(deck.stations.find((item) => item.name === "fixture-dark")?.state).toBe("unknown");
	});

	it("a config-only export that claims a link still reads unobserved: only a daemon view links", () => {
		const raw = edited((d) => (d.deck.view = "config"));
		const { deck, reader } = live(raw);
		expect(deck.connected).toBe(false);
		expect(renderHouseCard(deck, reader)).toContain("collector  no link: every station is unobserved, not offline");
	});

	it("never borrows the guide's live count as arrivals, even with a window start", () => {
		const raw = edited((d) => (d.deck.window_start_ms = 1795766400000));
		const { deck } = live(raw);
		expect(deck.stations.flatMap((item) => item.streams).every((item) => item.arrivals === null)).toBe(true);
		expect(stationText("fixture-scribe", raw)).toContain("arrivals   unknown");
	});

	it("a partial stream list with no count says more may exist, never +0", () => {
		const raw = edited((d) => (d.deck.stations[3].streams_known = "partial"));
		const text = stationText("fixture-scribe", raw);
		expect(text).toContain("streams    chatter (more may exist)");
		expect(text).not.toContain("+0");
	});
});

describe("the export's partial scope and withheld names (🌫, #147 and ews#14 reviews)", () => {
	it("🌫's case end to end: 64 patterns, then the readable one, never reads as a definite no", () => {
		const fillers = Array.from({ length: 64 }, (_, i) => `z${i}:other`);
		const last = edited((d) => (d.reader.may_read = [...fillers, "fixture-lighthouse:lighthouse"]));
		const first = edited((d) => (d.reader.may_read = ["fixture-lighthouse:lighthouse", ...fillers]));
		const lastLine = streamLine(stationText("fixture-lighthouse", last), "lighthouse");
		expect(lastLine).toContain("readable here: unknown");
		expect(lastLine).not.toContain("readable here: no");
		expect(streamLine(stationText("fixture-lighthouse", first), "lighthouse")).toContain("readable here: yes");
	});

	it("an export whose scope lost a withheld pattern reads a miss as unknown, a hit as yes", () => {
		const raw = edited((d) => (d.reader.may_read_complete = false));
		expect(streamLine(stationText("fixture-lighthouse", raw), "lighthouse")).toContain("readable here: unknown");
		expect(streamLine(stationText("fixture-scribe", raw), "chatter")).toContain("readable here: yes");
	});

	it("says how many station names the export withheld, never which", () => {
		const raw = edited((d) => {
			d.withheld = [
				{ field: "deck.stations", reason: "discord-id shape", count: 2 },
				{ field: "deck.stations", reason: "key-id shape", count: 1 },
				{ field: "reader.may_read", reason: "key-id shape", count: 1 },
			];
		});
		const { deck, reader } = live(raw);
		expect(renderHouseCard(deck, reader)).toContain("  withheld   3 station names the export withheld (identity-shaped or not identifiers)");
		const none = live();
		expect(renderHouseCard(none.deck, none.reader)).not.toContain("withheld   ");
	});

	it("a malformed withheld list can't be read as none withheld", () => {
		const { deck } = live(edited((d) => (d.withheld = [{ field: "deck.stations", reason: "x", count: -1 }])));
		expect(renderHouseCard(deck, null)).toContain("  withheld   an unknown number of station names the export withheld");
		// An export with no withheld list at all (an older producer) can't say none were withheld either.
		const missing = live(edited((d) => delete d.withheld));
		expect(renderHouseCard(missing.deck, null)).toContain("  withheld   an unknown number of station names the export withheld");
	});
});

describe("end to end: a config with an id-shaped tune pattern (🌫, 05:41Z)", () => {
	// Made by frond-ear's own producer (house-export --offline, frond-ear bfc8794) from a config whose tune is
	// fixture-scribe:chatter and fixture-scribe:<a key id>. The second is withheld, so the scope says it lost one.
	const WITHHELD = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "house-export.withheld.json"), "utf8")) as unknown;

	it("the producer withheld one pattern, by count only", () => {
		const doc = WITHHELD as { reader: { may_read: string[]; may_read_complete: boolean; may_read_withheld: number } };
		expect(doc.reader.may_read).toEqual(["fixture-scribe:chatter"]);
		expect(doc.reader.may_read_complete).toBe(false);
		expect(doc.reader.may_read_withheld).toBe(1);
		expect(JSON.stringify(WITHHELD)).not.toMatch(/[0-9a-f]{16}/i);
	});

	it("the stream no kept pattern matches renders unknown, never outside the scope; the kept one still reads yes", () => {
		const { deck, reader } = live(WITHHELD);
		expect(reader?.may_read_left_out).toBe(1);
		const text = renderHouseCard(deck, reader);
		expect(text).toContain("read scope: fixture-scribe:chatter (partial: 1 pattern not kept, so a stream outside it reads unknown)");
		const facts = streamLine(text, "facts");
		expect(facts).toContain("readable here: unknown");
		expect(facts).not.toContain("readable here: no");
		expect(streamLine(text, "chatter")).toContain("readable here: yes (when heard)");
	});
});

describe("render-house-card --from", () => {
	const script = join(import.meta.dirname, "..", "..", "..", "scripts", "render-house-card.mjs");
	const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

	it("renders the export's deck with its own reader", () => {
		const out = run("--from", FIXTURE_PATH);
		expect(out.split("\n")[0]).toBe("HOUSE CARD · LIVE (this ear) · frond-ear abc1234 ear fixture-ear");
		expect(out).toContain("reader     fixture-ear · payload text: on");
	});

	it("without --from it is still the SYNTHETIC demo", () => {
		expect(run().split("\n")[0]).toBe("HOUSE CARD · SYNTHETIC — DEMO DATA");
	});

	it("refuses a file that isn't a house export, and --blind with --from", () => {
		expect(() => run("--from", join(import.meta.dirname, "..", "..", "..", "package.json"))).toThrow();
		expect(() => run("--from", FIXTURE_PATH, "--blind")).toThrow();
	});
});
