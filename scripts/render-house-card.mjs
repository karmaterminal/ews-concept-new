// The house card (frond-house §1.5, §3.C) as plain text: one card per shown station, with station visible / stream
// admitted / readable here on every stream line. The SYNTHETIC demo by default; --from renders one ear's own export.
//   pnpm --silent house-card                         no reader profile: readable here stays unknown
//   pnpm --silent house-card --reader demo-reader-scoped    a demo reader (demo-reader-scoped, -shape-only, -full)
//   pnpm --silent house-card --reader ./me.json      a reader profile {reader, payload_text, may_read: ["station:stream"]}
//   add --blind to see the collector with no link.
//   pnpm --silent house-card --from ./export.json    LIVE: the deck and reader from `frond-ear house-export --ear <name>`
//                                                    (add --reader to read it as another profile; --blind is demo only)
// Needs Node 23.6 or later (type stripping); the canticle modules import without extensions, so a resolve hook adds .ts.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, next) {
		try {
			return next(specifier, context);
		} catch (error) {
			if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
			throw error;
		}
	},
});

const { DEMO_DECK, DEMO_READERS, renderHouseCard, sanitizeReader } = await import("../src/lib/canticle/card.ts");
const { cardFromExport } = await import("../src/lib/canticle/house-export.ts");

const args = process.argv.slice(2);
let reader = null;
let readerGiven = false;
let blind = false;
let from = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--blind") blind = true;
	else if (args[i] === "--from" && i + 1 < args.length) from = args[++i];
	else if (args[i] === "--reader" && i + 1 < args.length) {
		readerGiven = true;
		const value = args[++i];
		if (Object.hasOwn(DEMO_READERS, value)) reader = DEMO_READERS[value];
		else {
			reader = sanitizeReader(JSON.parse(readFileSync(value, "utf8")));
			if (reader === null) {
				console.error(`render-house-card: ${value} is not a reader profile {reader, payload_text, may_read}`);
				process.exit(2);
			}
		}
	} else {
		console.error("usage: render-house-card [--reader NAME|profile.json] [--blind | --from export.json]");
		process.exit(2);
	}
}

if (from === null) process.stdout.write(renderHouseCard(DEMO_DECK(Date.now(), { blind }), reader));
else {
	if (blind) {
		console.error("render-house-card: --blind is for the demo only; a live export says its own link state");
		process.exit(2);
	}
	let live = null;
	try {
		live = cardFromExport(JSON.parse(readFileSync(from, "utf8")));
	} catch {
		live = null;
	}
	if (live === null) {
		console.error(`render-house-card: ${from} is not a frond-ear house export (frond-house-export/0)`);
		process.exit(2);
	}
	process.stdout.write(renderHouseCard(live.deck, readerGiven ? reader : live.reader));
}
