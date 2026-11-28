import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderHouseCard } from "./card";
import { GAP_TABLE, gapLine, type GapPush } from "./gaps";
import { cardFromExport } from "./house-export";

// Every gap name frond-ear's house-export can emit, copied from its code at the commit the fixture records.
const NAMES = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "frond-ear-gap-names.json"), "utf8")) as {
	commit: string;
	emitted: string[];
	board_empty: string[];
	walk_breaks: string[];
	not_coverage: string[];
};
const SAMPLE = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "house-export.sample.json"), "utf8")) as Record<
	string,
	any
>;

function withGaps(gaps: Array<{ name: string; count: number }>) {
	const doc = structuredClone(SAMPLE);
	doc.deck.walk = "partial";
	doc.deck.gaps = gaps;
	const card = cardFromExport(doc);
	if (card === null) throw new Error("the sample is not a house export");
	return card;
}

describe("every gap name frond-ear's house-export emits reads on the card", () => {
	it("the fixture records its frond-ear commit and a non-empty list", () => {
		expect(NAMES.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(NAMES.emitted.length).toBeGreaterThan(0);
	});

	it.each(NAMES.emitted)("%s alone is named, never +N unreadable", (name) => {
		const { deck, reader } = withGaps([{ name, count: 1 }]);
		const text = renderHouseCard(deck, reader);
		expect(text).toContain(`${name} ×1`);
		expect(text).toContain(`\n             ${name}: ${gapLine(name)}\n`);
		expect(text).not.toContain("unreadable");
	});

	it("all of them at once: each named, none unreadable", () => {
		const { deck, reader } = withGaps(NAMES.emitted.map((name) => ({ name, count: 1 })));
		const text = renderHouseCard(deck, reader);
		for (const name of NAMES.emitted) expect(text).toContain(`${name} ×1`);
		expect(text).not.toContain("unreadable");
	});
});

describe("the card's gap table is frond-ear's list, at the fixture's commit", () => {
	it("has every name the export emits, and no other", () => {
		const table = [...GAP_TABLE.keys()].sort();
		const emitted = [...NAMES.emitted].sort();
		expect(emitted.filter((name) => !GAP_TABLE.has(name)), `missing from the card's table (frond-ear ${NAMES.commit})`).toEqual([]);
		expect(table.filter((name) => !emitted.includes(name)), "in the card's table but not emitted").toEqual([]);
		expect(table).toEqual(emitted);
	});

	it("pushes each name the way frond-ear's own sets do", () => {
		const expected = (name: string): GapPush =>
			NAMES.board_empty.includes(name)
				? "held"
				: NAMES.walk_breaks.includes(name)
					? "walk"
					: NAMES.not_coverage.includes(name)
						? "local"
						: "coverage";
		for (const name of NAMES.emitted) expect(GAP_TABLE.get(name)?.push, name).toBe(expected(name));
	});

	it("every line pushes toward unknown or partial, never toward yes", () => {
		for (const name of NAMES.emitted) {
			const line = gapLine(name);
			expect(line, name).not.toBeNull();
			const [means, push] = (line as string).split(" → ");
			expect(means.length, name).toBeGreaterThan(0);
			expect(push, name).toMatch(/unknown|partial|the board is unchanged/);
			expect(line, name).not.toMatch(/\byes\b|\bcomplete\b|\bwhole\b|readable here/);
		}
	});
});

describe("adding names keeps the card's safety", () => {
	const plain = (() => {
		const { deck, reader } = withGaps([]);
		return renderHouseCard(deck, reader);
	})();
	const stations = (text: string) => text.split("\n\n").slice(1).join("\n\n");

	it("no gap, and no set of them, changes any station or stream line", () => {
		const { deck, reader } = withGaps(NAMES.emitted.map((name) => ({ name, count: 2 })));
		const text = renderHouseCard(deck, reader);
		expect(stations(text)).toBe(stations(plain));
		for (const name of NAMES.emitted) {
			const one = withGaps([{ name, count: 1 }]);
			expect(stations(renderHouseCard(one.deck, one.reader)), name).toBe(stations(plain));
		}
	});

	it("an unknown name still counts as unreadable beside every known one, and is never printed", () => {
		const { deck, reader } = withGaps([...NAMES.emitted.map((name) => ({ name, count: 1 })), { name: "secret_token", count: 1 }]);
		const text = renderHouseCard(deck, reader);
		expect(text).toContain(", +1 unreadable\n");
		expect(text).toContain("+1 unreadable: entries the card can't read (a name it doesn't know, a bad count, or past its 64); what they mean is unknown");
		expect(text).not.toContain("secret_token");
		expect(gapLine("secret_token")).toBeNull();
		expect(gapLine("__proto__")).toBeNull();
	});
});
