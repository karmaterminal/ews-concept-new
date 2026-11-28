import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
	return checkWith(process.env, ...args);
}

function checkWith(env: NodeJS.ProcessEnv, ...args: string[]) {
	const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env, timeout: 60_000 });
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

/** A stand-in frond-ear checkout whose src/cli.ts runs `body` (it is handed the path it may write to). */
function stubCheckout(body: string): { dir: string; seen: string } {
	const dir = mkdtempSync(join(tmpdir(), "check-gap-names-stub-"));
	mkdirSync(join(dir, "src"));
	const seen = join(dir, "seen-env.json");
	writeFileSync(join(dir, "src", "cli.ts"), `const SEEN = ${JSON.stringify(seen)};\n${body}\n`);
	return { dir, seen };
}

const GOOD_DOC = JSON.stringify({
	kind: "frond-house-gap-names/0",
	source: "frond-ear abc1234",
	names: [...FIXTURE.emitted],
	board_empty: [...FIXTURE.board_empty],
	walk_breaks: [...FIXTURE.walk_breaks],
	not_coverage: [...FIXTURE.not_coverage],
});

describe("🌿 on ews#16: the frond-ear CLI runs with an allowlisted environment and a timeout", () => {
	it("a planted token never reaches the child: it sees PATH and HOME only", () => {
		const { dir, seen } = stubCheckout(
			`import { writeFileSync } from "node:fs";\nwriteFileSync(SEEN, JSON.stringify(process.env));\nprocess.stdout.write(${JSON.stringify(GOOD_DOC)});`,
		);
		const planted = "ghp_" + "Fake0Token1Planted2For3The4Test5Only6";
		const r = checkWith(
			{ ...process.env, GH_TOKEN: planted, GITHUB_TOKEN: planted, FROND_PLANTED_SECRET: planted },
			"--frond-ear",
			dir,
		);
		expect(r.err).toBe("");
		expect(r.code).toBe(0);
		const env = JSON.parse(readFileSync(seen, "utf8")) as Record<string, string>;
		expect(JSON.stringify(env)).not.toContain(planted);
		expect(Object.keys(env).filter((key) => !["PATH", "HOME"].includes(key))).toEqual([]);
		expect(env.PATH).toBe(process.env.PATH);
	});

	it("a CLI that hangs is stopped at the timeout: exit 2, saying so", () => {
		const { dir } = stubCheckout("setTimeout(() => {}, 120_000);");
		const started = Date.now();
		const r = check("--frond-ear", dir, "--timeout-ms", "500");
		expect(Date.now() - started).toBeLessThan(30_000);
		expect(r.code).toBe(2);
		expect(r.err).toContain("timed out after 0.5 s");
	});

	it("the timeout defaults to 30 s, and takes only a positive whole number of ms with --frond-ear", () => {
		expect(readFileSync(SCRIPT, "utf8")).toMatch(/const DEFAULT_TIMEOUT_MS = 30_000;/);
		const { dir } = stubCheckout(`process.stdout.write(${JSON.stringify(GOOD_DOC)});`);
		expect(check("--frond-ear", dir).code).toBe(0);
		expect(check("--frond-ear", dir, "--timeout-ms", "5000").code).toBe(0);
		for (const bad of ["0", "-1", "1.5", "soon"]) expect(check("--frond-ear", dir, "--timeout-ms", bad).code).toBe(2);
		expect(check("--from", output(), "--timeout-ms", "500").code).toBe(2);
	});

	it.each([
		["a grandchild that sleeps", `spawn("sleep", ["300"], { stdio: ["ignore", "inherit", "inherit"] })`, ""],
		// SIGTERM is ignored by both, so only the SIGKILL after the grace stops them.
		[
			"a CLI and a grandchild that ignore SIGTERM",
			`spawn("sh", ["-c", "trap '' TERM; exec sleep 300"], { stdio: ["ignore", "inherit", "inherit"] })`,
			`process.on("SIGTERM", () => {});`,
		],
	])("🌿 on ews#17: a timeout stops the CLI's whole process group: %s", async (_, grandchild, cli) => {
		// The stub starts a grandchild that sleeps 300 s and holds stdout, records both pids, then hangs.
		const { dir, seen } = stubCheckout(
			[
				`import { spawn } from "node:child_process";`,
				`import { writeFileSync } from "node:fs";`,
				cli,
				`const child = ${grandchild};`,
				`writeFileSync(SEEN, JSON.stringify({ cli: process.pid, grandchild: child.pid }));`,
				`setTimeout(() => {}, 300_000);`,
			].join("\n"),
		);
		// Gone means no such pid, or (for the instant before its new parent reaps it) a zombie that runs nothing.
		const running = (pid: number) => {
			try {
				process.kill(pid, 0);
			} catch {
				return false;
			}
			try {
				return !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
			} catch {
				return false;
			}
		};
		let pids: { cli: number; grandchild: number } | undefined;
		try {
			const started = Date.now();
			const r = check("--frond-ear", dir, "--timeout-ms", "1000");
			const took = Date.now() - started;
			pids = JSON.parse(readFileSync(seen, "utf8")) as { cli: number; grandchild: number };
			expect(pids.grandchild).toBeGreaterThan(0);
			const deadline = Date.now() + 5_000;
			while ((running(pids.cli) || running(pids.grandchild)) && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect([pids.cli, pids.grandchild].filter(running)).toEqual([]);
			expect(r.code).toBe(2);
			expect(r.err).toContain("timed out after 1 s");
			expect(took).toBeLessThan(20_000);
		} finally {
			// Never leave one behind, whatever an assertion said: by pid, only the two this stub recorded.
			for (const pid of pids === undefined ? [] : [pids.cli, pids.grandchild]) {
				if (running(pid)) process.kill(pid, "SIGKILL");
			}
		}
	}, 90_000);

	it("a CLI that exits nonzero is exit 2, never a pass", () => {
		const { dir } = stubCheckout(`process.stdout.write(${JSON.stringify(GOOD_DOC)});\nprocess.exit(1);`);
		expect(check("--frond-ear", dir).code).toBe(2);
	});
});

describe("🌫 on ews#17: an output cap, and what a timeout stops", () => {
	/** Gone: no such pid, or a zombie waiting for its reaper (it runs nothing). */
	const running = (pid: number) => {
		try {
			process.kill(pid, 0);
		} catch {
			return false;
		}
		try {
			return !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
		} catch {
			return false;
		}
	};
	const settle = async (pids: number[]) => {
		const deadline = Date.now() + 5_000;
		while (pids.some(running) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
		return pids.filter(running);
	};
	/** GOOD_DOC padded with JSON whitespace to `bytes`: still a valid document. */
	const padded = (bytes: number) => GOOD_DOC + " ".repeat(bytes - Buffer.byteLength(GOOD_DOC));

	it("a CLI that prints 2 MiB on stdout (a valid document) and exits 0 is stopped at the 1 MiB stdout cap: exit 2, and its group is gone", async () => {
		const { dir, seen } = stubCheckout(
			[
				`import { spawn } from "node:child_process";`,
				`import { writeFileSync } from "node:fs";`,
				`const child = spawn("sleep", ["300"], { stdio: "ignore" });`,
				`writeFileSync(SEEN, JSON.stringify({ cli: process.pid, grandchild: child.pid }));`,
				`process.stdout.write(${JSON.stringify(padded(2 * 1024 * 1024))}, () => process.exit(0));`,
			].join("\n"),
		);
		let pids: number[] = [];
		try {
			const r = check("--frond-ear", dir);
			const seenPids = JSON.parse(readFileSync(seen, "utf8")) as { cli: number; grandchild: number };
			pids = [seenPids.cli, seenPids.grandchild];
			expect(r.code).toBe(2);
			expect(r.err).toContain("printed more than 1 MiB on stdout and was stopped");
			expect(await settle(pids)).toEqual([]);
		} finally {
			for (const pid of pids) if (running(pid)) process.kill(pid, "SIGKILL");
		}
	}, 60_000);

	it("output just under the cap is read whole", () => {
		const { dir } = stubCheckout(`process.stdout.write(${JSON.stringify(padded(1024 * 1024 - 1))});`);
		const r = check("--frond-ear", dir);
		expect(r.err).toBe("");
		expect(r.code).toBe(0);
	});

	it("the cap is 1 MiB of stdout bytes, and only stdout is counted", () => {
		const script = readFileSync(SCRIPT, "utf8");
		expect(script).toMatch(/const MAX_STDOUT_BYTES = 1024 \* 1024;/);
		const docs = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "frond-house.md"), "utf8");
		for (const text of [script, docs]) expect(text).not.toMatch(/MAX_OUTPUT_BYTES|[Oo]utput past 1 MiB|prints more than 1 MiB is/);
		// stderr is drained, not counted: 2 MiB of it beside a good stdout still passes.
		const { dir } = stubCheckout(`process.stderr.write("x".repeat(2 * 1024 * 1024));\nprocess.stdout.write(${JSON.stringify(GOOD_DOC)});`);
		expect(check("--frond-ear", dir).code).toBe(0);
	});

	it("a timeout stops descendants still in the CLI's process group, and says only that", async () => {
		// One grandchild stays in the group; one leaves it (its own session). Only the first is the script's to stop.
		const { dir, seen } = stubCheckout(
			[
				`import { spawn } from "node:child_process";`,
				`import { writeFileSync } from "node:fs";`,
				`const inGroup = spawn("sleep", ["300"], { stdio: "ignore" });`,
				`const left = spawn("sleep", ["300"], { stdio: "ignore", detached: true });`,
				`writeFileSync(SEEN, JSON.stringify({ cli: process.pid, inGroup: inGroup.pid, left: left.pid }));`,
				`setTimeout(() => {}, 300_000);`,
			].join("\n"),
		);
		let pids: number[] = [];
		try {
			const r = check("--frond-ear", dir, "--timeout-ms", "1000");
			const p = JSON.parse(readFileSync(seen, "utf8")) as { cli: number; inGroup: number; left: number };
			pids = [p.cli, p.inGroup, p.left];
			expect(r.code).toBe(2);
			expect(await settle([p.cli, p.inGroup])).toEqual([]);
			// The one that left the group is out of reach: the script never claims it.
			expect(running(p.left)).toBe(true);
			const docs = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "frond-house.md"), "utf8");
			const script = readFileSync(SCRIPT, "utf8");
			for (const text of [docs, script]) {
				expect(text).not.toMatch(/anything it started|no grandchild it started/);
				expect(text).toMatch(/descendants still in its process group/);
			}
		} finally {
			for (const pid of pids) if (running(pid)) process.kill(pid, "SIGKILL");
		}
	}, 60_000);
});

