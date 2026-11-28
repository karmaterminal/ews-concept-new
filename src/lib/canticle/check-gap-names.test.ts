import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/check-gap-names.mjs holds the card's gap table to a frond-ear checkout's own `house-export --gap-names`
// (🌿's should-fix on ews#15). Here it reads saved outputs built from the offline fixture, so no checkout is needed.
const SCRIPT = join(import.meta.dirname, "..", "..", "..", "scripts", "check-gap-names.mjs");
const FIXTURE = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "frond-ear-gap-names.json"), "utf8")) as {
	emitted: string[];
	board_empty: string[];
	walk_breaks: string[];
	not_coverage: string[];
};

/** A `frond-ear house-export --gap-names` document as frond-ear prints it, from the fixture, with `edit` applied. */
function output(edit: (doc: any) => void = () => {}): string {
	const doc = {
		kind: "frond-house-gap-names/0",
		source: "frond-ear abc1234",
		names: [...FIXTURE.emitted],
		board_empty: [...FIXTURE.board_empty],
		walk_breaks: [...FIXTURE.walk_breaks],
		not_coverage: [...FIXTURE.not_coverage],
	};
	edit(doc);
	const dir = mkdtempSync(join(tmpdir(), "check-gap-names-"));
	const path = join(dir, "gap-names.json");
	writeFileSync(path, JSON.stringify(doc));
	return path;
}

function check(...args: string[]) {
	const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
	return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("scripts/check-gap-names.mjs", () => {
	it("passes when frond-ear's list and sets match the card's table and the fixture", () => {
		const r = check("--from", output());
		expect(r.err).toBe("");
		expect(r.code).toBe(0);
		expect(r.out).toContain("39 gap names match frond-ear abc1234");
	});

	it("fails on a name frond-ear added that the card doesn't know", () => {
		const r = check("--from", output((d) => d.names.push("brand_new_gap")));
		expect(r.code).toBe(1);
		expect(r.err).toContain("missing from the card's table: brand_new_gap");
		expect(r.err).toContain("missing from the fixture: brand_new_gap");
	});

	it("fails on a name frond-ear dropped that the card still has", () => {
		const r = check("--from", output((d) => (d.names = d.names.filter((n: string) => n !== "records_lost"))));
		expect(r.code).toBe(1);
		expect(r.err).toContain("in the card's table but not in frond-ear: records_lost");
	});

	it("fails on a name frond-ear moved to another set", () => {
		const r = check("--from", output((d) => d.not_coverage.push("records_lost")));
		expect(r.code).toBe(1);
		expect(r.err).toContain("records_lost: frond-ear pushes it local, the card coverage");
	});

	it("refuses input that isn't frond-ear's gap-names document", () => {
		expect(check("--from", output((d) => (d.kind = "frond-house-export/0"))).code).toBe(2);
		expect(check("--from", output((d) => d.board_empty.push("not_a_listed_name"))).code).toBe(2);
		expect(check("--from", output((d) => (d.names = "host_mute"))).code).toBe(2);
		expect(check("--from", join(import.meta.dirname, "fixtures", "house-export.sample.json")).code).toBe(2);
		expect(check().code).toBe(2);
		expect(check("--from", output(), "--frond-ear", "/nonexistent").code).toBe(2);
	});

	it("runs a checkout's own CLI with --frond-ear, and says so when it can't", () => {
		const r = check("--frond-ear", join(tmpdir(), "no-such-frond-ear-checkout"));
		expect(r.code).toBe(2);
		expect(r.err).toContain("no-such-frond-ear-checkout");
	});
});
