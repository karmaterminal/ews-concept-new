<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { page } from "$app/stores";
	import { createPoller } from "$lib/canticle/poller";
	import { sanitizeDrum, traceRow, beaconTicks, type Drum } from "$lib/canticle/drum";

	let drum = $state<Drum>(sanitizeDrum(null));
	let poll: ReturnType<typeof setInterval> | undefined;
	let stationIndex = $state(0);

	const inks = ["#faaa00", "#ff3b30", "#3cff9a", "#33ccff"];
	const chartLeft = 74;
	const chartWidth = 640;
	const rowHeight = 10.5;
	const chartTop = 12;
	const chartBottom = chartTop + 96 * rowHeight;
	const svgHeight = chartBottom + 18;

	const poller = createPoller<Drum>({
		fetch: (url, init) => fetch(url, init),
		url: () => $page.url.searchParams.get("demo") === "1"
			? "/api/canticle-drum?demo=1"
			: "/api/canticle-drum",
		onValue: (next) => {
			drum = next;
			const requested = $page.url.searchParams.get("station");
			const found = requested ? next.stations.findIndex((station) => station.name === requested) : -1;
			if (found >= 0) stationIndex = found;
			else if (stationIndex >= next.stations.length) stationIndex = 0;
		},
		sanitize: sanitizeDrum,
		empty: sanitizeDrum(null),
		isCurrent: (next) => next.rows > 0 && next.stations.length > 0,
		maxAgeMs: 25000,
	});

	function selectStation(index: number): void {
		stationIndex = index;
		const url = new URL($page.url);
		url.searchParams.set("station", drum.stations[index]?.name ?? "");
		history.replaceState(history.state, "", url);
	}

	function localTime(ms: number): string {
		return new Date(ms).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
	}

	function rowStart(row: number): number {
		return drum.start_ms + row * drum.row_ms;
	}

	function xFor(bucketInRow: number): number {
		return chartLeft + (bucketInRow / 89) * chartWidth;
	}

	function yFor(row: number, y: number): number {
		return chartTop + row * rowHeight + 5.25 - y * 4.8;
	}

	// the carrier as runs of consecutive beacon buckets (a gap of up to 2 buckets is still one run): one faint line
	// under the baseline that breaks where beacons stop, instead of a tick per 10 s
	function carrierRuns(row: number): { x1: number; x2: number }[] {
		const ticks = beaconTicks(drum, stationIndex, row).sort((a, b) => a - b);
		const runs: { x1: number; x2: number }[] = [];
		let from = -1;
		let last = -1;
		for (const tick of ticks) {
			if (from < 0) {
				from = last = tick;
			} else if (tick - last <= 2) {
				last = tick;
			} else {
				runs.push({ x1: xFor(from), x2: xFor(Math.min(89, last + 1)) });
				from = last = tick;
			}
		}
		if (from >= 0) runs.push({ x1: xFor(from), x2: xFor(Math.min(89, last + 1)) });
		return runs;
	}

	function polyline(row: number, segment: { x: number; y: number }[]): string {
		return segment.map((point) => `${xFor(point.x)},${yFor(row, point.y)}`).join(" ");
	}

	function unobservedSegments(row: number): { x1: number; x2: number }[] {
		const from = row * 90;
		const to = from + 90;
		const segments: { x1: number; x2: number }[] = [];
		let cursor = from;
		const ranges = drum.observed
			.filter(([a, b]) => a < to && b > from)
			.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
			.sort((a, b) => a[0] - b[0]);
		for (const [a, b] of ranges) {
			if (cursor < a) segments.push({ x1: xFor(cursor - from), x2: xFor(a - from) });
			cursor = Math.max(cursor, b);
		}
		if (cursor < to) segments.push({ x1: xFor(cursor - from), x2: xFor(to - from) });
		return segments;
	}

	onMount(() => {
		poller.tick();
		poll = setInterval(poller.tick, 10000);
	});

	onDestroy(() => {
		poller.stop();
		if (poll) clearInterval(poll);
	});
</script>

<main class="helicorder-page">
	<header class="header-strip">
		<div class="title">HELICORDER // {drum.stations[stationIndex]?.name ?? "NO STATION"}</div>
		<div class="history">
			history since {drum.stations.length > 0 ? localTime(drum.since_ms) : "—"}
		</div>
	</header>

	{#if drum.synthetic}
		<div class="demo-banner">SYNTHETIC — DEMO DATA</div>
	{/if}

	{#if drum.stations.length > 0}
		<nav class="station-picker" aria-label="Drum stations">
			{#each drum.stations as station, index}
				<button
					class:active={stationIndex === index}
					onclick={() => selectStation(index)}
					type="button"
				>{station.name}</button>
			{/each}
		</nav>

		<section class="drum-panel" aria-label={`24 hour helicorder for ${drum.stations[stationIndex]?.name ?? ""}`}>
			<svg class="drum-svg" viewBox={`0 0 740 ${svgHeight}`} role="img" aria-label="Seismograph drum plot">
				<defs>
					<pattern id="unobserved-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
						<line x1="0" y1="0" x2="0" y2="7" stroke="#777" stroke-width="1" opacity="0.45"></line>
					</pattern>
				</defs>

				{#each Array.from({ length: drum.rows }) as _, row}
					{@const baseline = chartTop + row * rowHeight + 5.25}
					{#each unobservedSegments(row) as gap}
						<rect
							x={gap.x1}
							y={baseline - 4.2}
							width={Math.max(0, gap.x2 - gap.x1)}
							height={8.4}
							fill="url(#unobserved-hatch)"
						></rect>
					{/each}
					<!-- no ruled baseline: the pen trace is the baseline, so an unobserved stretch has no line at all -->
					{#each traceRow(drum, stationIndex, row) as segment}
						<polyline
							points={polyline(row, segment)}
							fill="none"
							stroke={inks[row % 4]}
							stroke-width="1"
							vector-effect="non-scaling-stroke"
							stroke-linejoin="round"
							stroke-linecap="round"
						></polyline>
					{/each}
					{#if row % 4 === 0}
						<text x="8" y={baseline + 3} class="row-label">{localTime(rowStart(row))}</text>
					{/if}
					{#each carrierRuns(row) as run}
						<line x1={run.x1} x2={run.x2} y1={baseline + 4} y2={baseline + 4} class="carrier-run"></line>
					{/each}
				{/each}

				<circle
					cx={chartLeft + (Math.max(0, Math.min(drum.row_ms, drum.now_ms - rowStart(95))) / drum.row_ms) * chartWidth}
					cy={chartTop + 95 * rowHeight + 5.25}
					r="3"
					class="live-dot"
				></circle>
			</svg>
		</section>

		<footer class="legend">
			pen deflects on arrivals · the faint line under each row is the carrier · hatched is not observed · nothing said is ever shown
		</footer>
	{:else}
		<section class="empty-state">NO DRUM LINK</section>
	{/if}
</main>

<style>
	.demo-banner {
		margin: 14px 18px 0;
		padding: 10px;
		border: 2px solid var(--red);
		background: rgba(255, 0, 0, 0.12);
		color: white;
		text-align: center;
		font-weight: 900;
		letter-spacing: 0.2em;
	}

	.helicorder-page {
		min-height: 100vh;
		box-sizing: border-box;
		background:
			linear-gradient(rgba(250,170,0,.025) 1px, transparent 1px),
			linear-gradient(90deg, rgba(250,170,0,.025) 1px, transparent 1px),
			#050505;
		background-size: 28px 28px;
		color: var(--orange);
		padding-bottom: 20px;
	}

	.header-strip {
		min-height: 64px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 18px;
		border-bottom: 3px solid var(--orange);
		background: rgba(250,170,0,.08);
		letter-spacing: .12em;
	}

	.title {
		font-size: clamp(16px, 3vw, 30px);
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.history {
		white-space: nowrap;
		font-size: 11px;
		color: white;
	}

	.station-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 18px 4px;
	}

	.station-picker button {
		min-width: 0;
		max-width: 100%;
		border: 1px solid rgba(250,170,0,.55);
		background: #090909;
		color: var(--orange);
		padding: 7px 10px;
		font: inherit;
		font-size: 11px;
		letter-spacing: .06em;
		overflow-wrap: anywhere;
		cursor: pointer;
	}

	.station-picker button.active {
		background: var(--orange);
		color: #050505;
		font-weight: 900;
	}

	.drum-panel {
		width: calc(100% - 36px);
		max-width: 1400px;
		margin: 12px auto 0;
		border: 1px solid rgba(250,170,0,.45);
		background: rgba(0,0,0,.92);
		overflow: hidden;
	}

	.drum-svg {
		display: block;
		width: 100%;
		height: auto;
		min-height: 360px;
	}


	.row-label {
		fill: rgba(255,255,255,.72);
		font-size: 11px;
		font-family: monospace;
	}

	.carrier-run {
		stroke: #3cff9a;
		stroke-width: 1;
		opacity: 0.35;
		vector-effect: non-scaling-stroke;
	}

	.live-dot {
		fill: #fff;
		filter: drop-shadow(0 0 4px #fff);
		animation: pen-blink 1s steps(2, end) infinite;
	}

	.legend {
		margin: 10px 18px 0;
		border-top: 1px solid rgba(250,170,0,.35);
		padding-top: 10px;
		color: rgba(250,170,0,.82);
		text-align: center;
		font-size: clamp(9px, 2vw, 11px);
		letter-spacing: .04em;
	}

	.empty-state {
		margin: 40px 18px;
		border: 1px solid rgba(250,170,0,.5);
		padding: 28px;
		text-align: center;
		color: var(--red);
		font-weight: 900;
	}

	@keyframes pen-blink {
		50% { opacity: .15; }
	}

	@media (max-width: 600px) {
		.header-strip {
			align-items: flex-start;
			flex-direction: column;
			padding: 8px 10px;
		}
		.station-picker { padding-inline: 10px; }
		.drum-panel { width: calc(100% - 20px); }
		.row-label { font-size: 9px; }
		.legend { margin-inline: 10px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.live-dot { animation: none; }
	}
</style>
