// Holds the house card's gap table (src/lib/canticle/gaps.ts) and its offline fixture
// (src/lib/canticle/fixtures/frond-ear-gap-names.json) to frond-ear's own list of gap names (🌿's should-fix on
// ews#15). Run it whenever frond-ear moves:
//   node scripts/check-gap-names.mjs --frond-ear ~/path/to/frond-ear   runs that checkout's
//                                                                       `node src/cli.ts house-export --gap-names`
//   node scripts/check-gap-names.mjs --from gap-names.json              reads output saved from it
// Exit 0: every name and every push class match. Exit 1: they differ (each difference is printed). Exit 2: the input
// isn't frond-ear's gap-names document, or the checkout couldn't run it.
// Needs Node 23.6 or later (type stripping).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { GAP_TABLE } = await import("../src/lib/canticle/gaps.ts");
const FIXTURE_PATH = join(import.meta.dirname, "..", "src", "lib", "canticle", "fixtures", "frond-ear-gap-names.json");

const KIND = "frond-house-gap-names/0";
const USAGE = "usage: check-gap-names (--frond-ear <checkout> | --from <gap-names.json>)";

function refuse(message) {
	console.error(`check-gap-names: ${message}`);
	process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 2 || !["--frond-ear", "--from"].includes(args[0])) refuse(USAGE);
const [how, where] = args;

let text;
if (how === "--from") {
	try {
		text = readFileSync(where, "utf8");
	} catch {
		refuse(`${where} could not be read`);
	}
} else {
	try {
		text = execFileSync(process.execPath, [join(where, "src", "cli.ts"), "house-export", "--gap-names"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		refuse(`${where}: \`node src/cli.ts house-export --gap-names\` failed (is it a frond-ear checkout with --gap-names?)`);
	}
}

let doc;
try {
	doc = JSON.parse(text);
} catch {
	refuse("the input is not JSON");
}
const isNames = (value) => Array.isArray(value) && value.every((name) => typeof name === "string" && /^[a-z_]{1,64}$/.test(name));
if (
	typeof doc !== "object" ||
	doc === null ||
	doc.kind !== KIND ||
	typeof doc.source !== "string" ||
	!/^frond-ear [0-9a-z+]{1,24}$/.test(doc.source) ||
	!["names", "board_empty", "walk_breaks", "not_coverage"].every((key) => isNames(doc[key]))
)
	refuse(`the input is not frond-ear's ${KIND} document`);
const names = new Set(doc.names);
for (const key of ["board_empty", "walk_breaks", "not_coverage"]) {
	for (const name of doc[key]) if (!names.has(name)) refuse(`${key} names ${name}, which its own names list lacks`);
}

/** The card's push class for a name, from frond-ear's sets (gaps.ts says the same). */
const push = (name, sets) =>
	sets.board_empty.includes(name)
		? "held"
		: sets.walk_breaks.includes(name)
			? "walk"
			: sets.not_coverage.includes(name)
				? "local"
				: "coverage";

const problems = [];
const missing = [...names].filter((name) => !GAP_TABLE.has(name)).sort();
const extra = [...GAP_TABLE.keys()].filter((name) => !names.has(name)).sort();
if (missing.length > 0) problems.push(`missing from the card's table: ${missing.join(", ")}`);
if (extra.length > 0) problems.push(`in the card's table but not in frond-ear: ${extra.join(", ")}`);
for (const name of [...names].sort()) {
	const card = GAP_TABLE.get(name);
	if (card !== undefined && card.push !== push(name, doc)) {
		problems.push(`${name}: frond-ear pushes it ${push(name, doc)}, the card ${card.push}`);
	}
}

// The offline fixture the card's own tests read must say the same, so it is refreshed in the same change.
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const fixtureNames = new Set(fixture.emitted);
const fixtureMissing = [...names].filter((name) => !fixtureNames.has(name)).sort();
const fixtureExtra = [...fixtureNames].filter((name) => !names.has(name)).sort();
if (fixtureMissing.length > 0) problems.push(`missing from the fixture: ${fixtureMissing.join(", ")}`);
if (fixtureExtra.length > 0) problems.push(`in the fixture but not in frond-ear: ${fixtureExtra.join(", ")}`);
for (const name of [...names].filter((name) => fixtureNames.has(name)).sort()) {
	if (push(name, fixture) !== push(name, doc)) {
		problems.push(`${name}: frond-ear pushes it ${push(name, doc)}, the fixture ${push(name, fixture)}`);
	}
}

if (problems.length > 0) {
	console.error(`check-gap-names: the card differs from ${doc.source}:`);
	for (const line of problems) console.error(`  ${line}`);
	console.error("  update src/lib/canticle/gaps.ts, and refresh fixtures/frond-ear-gap-names.json (with its commit)");
	process.exit(1);
}
console.log(`check-gap-names: ok, ${names.size} gap names match ${doc.source} (card table and fixture)`);
