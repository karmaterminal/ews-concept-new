// The gap names frond-ear's `house-export` can put in `deck.gaps` (frond-ear src/canticle/house-cli.ts), each with a
// plain line for the card: what it means for the reader, and which way it pushes. The export has already applied
// every one of them to its own fields (a held board's counts are null, a coverage gap makes every station partial,
// and so on); the card only says them. None of them can make anything a yes: each push is toward unknown or partial,
// and one (`ear_muted`) changes nothing a line says.
//
// The push classes are frond-ear's own sets (BOARD_EMPTY, WALK_BREAKS, NOT_COVERAGE), and the table is held to the
// list in fixtures/frond-ear-gap-names.json, copied from frond-ear's code at a recorded commit: refresh that fixture
// whenever frond-ear adds a name. A name not in the table is not printed; the card counts it as unreadable.

/**
 * - `held`: the board is held empty, or might be (BOARD_EMPTY): no on-air count is known, and every station's
 *   stream list is partial;
 * - `walk`: the guide walk wasn't read whole, or didn't add up (WALK_BREAKS): the walk is partial, and every
 *   station's stream list too;
 * - `coverage`: every station's stream list is partial;
 * - `local` (NOT_COVERAGE): only what the line names reads unknown or partial.
 */
export type GapPush = "held" | "walk" | "coverage" | "local";

const PUSH: Record<Exclude<GapPush, "local">, string> = {
	held: "no on-air count is known; every station's list is partial",
	walk: "the walk is partial; every station's list is partial",
	coverage: "every station's list is partial",
};

/** A local gap says its own push; the others push as their class does, after any `also` of their own. */
export type Gap =
	| { push: Exclude<GapPush, "local">; means: string; also?: string }
	| { push: "local"; means: string; local: string };

const TABLE: ReadonlyArray<[string, Gap]> = [
	// held (frond-ear BOARD_EMPTY)
	["ended", { push: "held", means: "the host daemon's receptor ended its run" }],
	["not_listening", { push: "held", means: "the listener is not bound" }],
	["host_mute", { push: "held", means: "the host daemon's receptor is muted" }],
	["awaiting_landing", { push: "held", means: "this connection has had no landing state from the host daemon yet" }],
	["unrecognized_gap", { push: "held", means: "the guide gave a gap the export can't read, so it takes the worst" }],
	// walk (frond-ear WALK_BREAKS)
	["order_violation", { push: "walk", means: "guide rows came out of order" }],
	["changed_mid_walk", { push: "walk", means: "the guide or the presence table changed while it was read" }],
	["row_unparsed", { push: "walk", means: "a guide row, or its count, couldn't be read" }],
	["page_unparsed", { push: "walk", means: "a guide page couldn't be read" }],
	["page_refused", { push: "walk", means: "a guide page was refused" }],
	["row_count_mismatch", { push: "walk", means: "the guide's rows don't add up to its own total" }],
	["duplicate_row", { push: "walk", means: "a guide row came twice" }],
	["untuned_count_mismatch", { push: "walk", means: "the untuned list doesn't add up to its own total" }],
	// coverage: every other name not in frond-ear's NOT_COVERAGE
	["blind", { push: "coverage", means: "no datagram heard lately" }],
	[
		"joined_late",
		{ push: "coverage", means: "the ear joined the host daemon's run late; earlier records weren't seen" },
	],
	["records_lost", { push: "coverage", means: "records were lost on the host daemon's socket" }],
	["omitted_other_tuned", { push: "coverage", means: "other tuned streams were left out under overflow" }],
	["omitted_untuned", { push: "coverage", means: "untuned streams were left out under overflow" }],
	["coverage_unknown", { push: "coverage", means: "the guide says its coverage is unknown" }],
	["untuned_unlisted", { push: "coverage", means: "a guide page gave no untuned list" }],
	["untuned_partial_source", { push: "coverage", means: "this source lists only untuned streams some ear tunes" }],
	[
		"unrecognized_word",
		{ push: "coverage", means: "a presence, verification or listener word the export doesn't know; read as unknown" },
	],
	[
		"canticle_state_unknown",
		{
			push: "coverage",
			means: "the daemon's canticle state is unknown: not given, a word the export doesn't know, or its source stopped or refused",
			also: "payload text is unknown",
		},
	],
	[
		"canticle_state_changed",
		{
			push: "coverage",
			means: "the daemon's canticle state differed between its two reads",
			also: "payload text is unknown",
		},
	],
	[
		"canticle_state_contradicts",
		{ push: "coverage", means: "the guide contradicts the daemon's canticle state", also: "payload text is unknown" },
	],
	[
		"daemon_unreachable",
		{
			push: "coverage",
			means: "the running daemon wasn't reached, or refused or garbled its first answers; the config file alone is no reading",
			also: "payload text is unknown",
		},
	],
	[
		"canticle_off",
		{
			push: "coverage",
			means: "canticle is off in the running daemon, so nothing is heard and no stream is vouched for",
		},
	],
	// local (frond-ear NOT_COVERAGE)
	[
		"applied_tune_changed",
		{
			push: "local",
			means: "the daemon's applied tune differed between its two reads",
			local: "it isn't taken as the read scope, so the scope is partial",
		},
	],
	[
		"applied_tune_disagrees",
		{
			push: "local",
			means: "the daemon's applied tune disagrees with its own rows",
			local: "it isn't taken as the read scope, so the scope is partial",
		},
	],
	[
		"tuned_changed",
		{ push: "local", means: "streams listed tuned once and untuned once", local: "their tuning is unknown" },
	],
	[
		"count_changed",
		{
			push: "local",
			means: "an untuned stream's count changed between sightings",
			local: "that count is unknown and its station's list partial",
		},
	],
	[
		"config_daemon_mismatch",
		{ push: "local", means: "the config file and the running daemon disagree", local: "the read scope is partial" },
	],
	[
		"runtime_scope_unverified",
		{
			push: "local",
			means: "the daemon didn't vouch for its applied tune",
			local: "the read scope is only what its rows prove, so it is partial",
		},
	],
	[
		"verification_changed",
		{
			push: "local",
			means: "a station gave two verification words",
			local: "its presence is unknown and its list partial",
		},
	],
	[
		"presence_changed",
		{
			push: "local",
			means: "a station's presence word changed between reads",
			local: "its presence is unknown and its list partial",
		},
	],
	[
		"presence_disagrees",
		{
			push: "local",
			means: "the guide and the presence table disagree on a station",
			local: "its presence is unknown and its list partial",
		},
	],
	["ear_muted", { push: "local", means: "this ear is muted", local: "pushes to it are held; the board is unchanged" }],
	[
		"row_local_omissions",
		{ push: "local", means: "a guide row says records were left out locally", local: "that station's list is partial" },
	],
	[
		"row_coverage_unknown",
		{ push: "local", means: "a guide row says its coverage is unknown", local: "that station's list is partial" },
	],
];

/** The card's gap table, by frond-ear's name. Exported for the drift test; read it with `gapLine`. */
export const GAP_TABLE: ReadonlyMap<string, Gap> = new Map(TABLE);

/** Whether `name` is one of the producer's own gap names: only those print. */
export function knownGap(name: string): boolean {
	return GAP_TABLE.has(name);
}

/** The plain line for a known gap name: what it means, then which way it pushes. Null for any other name. */
export function gapLine(name: string): string | null {
	const gap = GAP_TABLE.get(name);
	if (gap === undefined) return null;
	if (gap.push === "local") return `${gap.means} → ${gap.local}`;
	return `${gap.means} → ${gap.also === undefined ? "" : `${gap.also}; `}${PUSH[gap.push]}`;
}
