// The house card (frond-house §1.5, §3.C) as plain text: one card per shown station, with station visible / stream
// admitted / readable here on every stream line. SYNTHETIC demo data only: it reads no live canticle data.
//   pnpm --silent house-card                         no reader profile: readable here stays unknown
//   pnpm --silent house-card --reader demo-reader-scoped    a demo reader (demo-reader-scoped, -shape-only, -full)
//   pnpm --silent house-card --reader ./me.json      a reader profile {reader, payload_text, may_read: ["station:stream"]}
//   add --blind to see the collector with no link.
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

const args = process.argv.slice(2);
let reader = null;
let blind = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--blind") blind = true;
	else if (args[i] === "--reader" && i + 1 < args.length) {
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
		console.error("usage: render-house-card [--reader NAME|profile.json] [--blind]");
		process.exit(2);
	}
}

process.stdout.write(renderHouseCard(DEMO_DECK(Date.now(), { blind }), reader));
