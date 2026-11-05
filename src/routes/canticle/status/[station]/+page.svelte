<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/stores";
	import { afterNavigate, replaceState } from "$app/navigation";
	import StripeBar from "$lib/components/StripeBar.svelte";
	import {
		CANTICLE_IDENTIFIER,
		carrierLevel,
		sanitizeShape,
		stateGloss,
		type Shape,
		type ShapeStation,
	} from "$lib/canticle/shape";
	import { sanitizeFlow, type Flow } from "$lib/canticle/flow";
	import { sanitizeDrum, isObserved, type Drum } from "$lib/canticle/drum";
	import { createFlowPoller, createPoller, createShapePoller } from "$lib/canticle/poller";
	import { linked, logFor, streamsFor, waveform } from "$lib/canticle/status";

	let shape = $state<Shape>(sanitizeShape(null));
	let flow = $state<Flow>(sanitizeFlow(null));
	let drum = $state<Drum>(sanitizeDrum(null));
	let shapeLoaded = $state(false);
	let drumLoaded = $state(false);

	const stationName = $derived($page.params.station ?? "");
	// the polling effect is keyed on these two values only: $page also emits on a shallow replaceState (a stream pick),
	// and that must neither restart the pollers nor reseed the pick
	const isDemo = $derived($page.url.searchParams.get("demo") === "1");
	const station = $derived<ShapeStation | undefined>(
		shape.stations.find((item) => item.name === stationName),
	);
	// the picked stream, held here: a shallow replaceState doesn't update $page.url, so reading the pick back from it
	// would revert it (the helicorder picker's lesson). Seeded from ?stream= whenever the route changes.
	let selectedStream = $state<string | null>(null);
	const stationStreams = $derived(streamsFor(drum, stationName, station));
	// a ?stream= this station doesn't carry is said so, never drawn as a flat "quiet" trace (🌿 on #10)
	const streamMissing = $derived(selectedStream !== null && drumLoaded && !stationStreams.includes(selectedStream));
	const segments = $derived(streamMissing ? [] : waveform(drum, stationName, selectedStream, 360));
	const logs = $derived(logFor(flow, stationName, selectedStream, 50));

	const chartLeft = 58;
	const chartRight = 730;
	const chartTop = 26;
	const chartBottom = 250;
	const chartWidth = chartRight - chartLeft;
	const chartHeight = chartBottom - chartTop;
	const maxY = $derived.by(() => {
		let max = 1;
		for (const segment of segments) {
			for (const point of segment) max = Math.max(max, point.y);
		}
		return max;
	});

	function beaconAge(ms: number | null): string {
		return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
	}

	function percent(ms: number | null): number {
		return Math.round(carrierLevel(ms) * 100);
	}

	function localTime(ms: number): string {
		return new Date(ms).toLocaleTimeString([], {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}

	function xFor(index: number): number {
		return chartLeft + (index / 359) * chartWidth;
	}

	function yFor(value: number): number {
		return chartBottom - (value / maxY) * chartHeight;
	}

	function polyline(points: { x: number; y: number }[]): string {
		return points.map((point) => `${xFor(point.x)},${yFor(point.y)}`).join(" ");
	}

	function unobservedRects(): { x: number; width: number }[] {
		if (drum.bucket_ms <= 0) return [];
		const latest = Math.floor((drum.now_ms - drum.start_ms) / drum.bucket_ms);
		const first = Math.max(0, latest - 359);
		const runs: { x: number; width: number }[] = [];
		let runStart: number | null = null;

		for (let x = 0; x < 360; x++) {
			const bucket = first + x;
			const unobserved = bucket > latest || !isObserved(drum, bucket);
			if (unobserved && runStart === null) runStart = x;
			if (!unobserved && runStart !== null) {
				runs.push({ x: xFor(runStart), width: Math.max(1, xFor(x) - xFor(runStart)) });
				runStart = null;
			}
		}
		if (runStart !== null) {
			runs.push({ x: xFor(runStart), width: Math.max(1, chartRight - xFor(runStart)) });
		}
		return runs;
	}

	function streamFromAddress(): string | null {
		const value = new URL(window.location.href).searchParams.get("stream");
		return value && CANTICLE_IDENTIFIER.test(value) ? value : null;
	}

	// every navigation (a link, Back, Forward, a query-only change on the same station) resyncs the pick from the
	// address actually shown; this is separate from the polling effect, which is keyed on station and demo (🌫 on #10)
	afterNavigate(() => {
		selectedStream = streamFromAddress();
	});

	function selectStream(stream: string | null): void {
		const url = new URL(window.location.href);
		if (stream === null) url.searchParams.delete("stream");
		else url.searchParams.set("stream", stream);
		selectedStream = stream;
		replaceState(url, {});
	}

	$effect(() => {
		void stationName;
		const demo = isDemo;
		// seed from the real address, not $page.url: a stream pick is a shallow replaceState that SvelteKit's copy of the
		// URL never sees, so after Back→Forward $page.url lacks ?stream= while the address bar has it (🌫 on #10)
		selectedStream = untrack(streamFromAddress);
		shape = sanitizeShape(null);
		flow = sanitizeFlow(null);
		drum = sanitizeDrum(null);
		shapeLoaded = false;
		drumLoaded = false;

		const shapePoller = createShapePoller({
			fetch: (url, init) => fetch(url, init),
			url: () => demo ? "/api/canticle-shape?demo=1" : "/api/canticle-shape",
			onShape: (next) => {
				shape = next;
				shapeLoaded = true;
			},
			maxAgeMs: 25000,
		});
		const flowPoller = createFlowPoller({
			fetch: (url, init) => fetch(url, init),
			url: () => demo ? "/api/canticle-flow?demo=1" : "/api/canticle-flow",
			onFlow: (next) => {
				flow = next;
			},
			maxAgeMs: 25000,
		});
		const drumPoller = createPoller<Drum>({
			fetch: (url, init) => fetch(url, init),
			url: () => demo ? "/api/canticle-drum?demo=1" : "/api/canticle-drum",
			onValue: (next) => {
				drum = next;
				drumLoaded = true;
			},
			sanitize: sanitizeDrum,
			empty: sanitizeDrum(null),
			isCurrent: (next) => next.rows > 0 && next.stations.length > 0,
			maxAgeMs: 25000,
		});

		shapePoller.tick();
		flowPoller.tick();
		drumPoller.tick();
		const shapeTimer = setInterval(shapePoller.tick, 2000);
		const flowTimer = setInterval(flowPoller.tick, 10000);
		const drumTimer = setInterval(drumPoller.tick, 10000);

		return () => {
			clearInterval(shapeTimer);
			clearInterval(flowTimer);
			clearInterval(drumTimer);
			shapePoller.stop();
			flowPoller.stop();
			drumPoller.stop();
			shape = sanitizeShape(null);
			flow = sanitizeFlow(null);
			drum = sanitizeDrum(null);
			shapeLoaded = false;
			drumLoaded = false;
		};
	});
</script>

<main class="detail-page">
	<header class="header-strip">
		<!-- only a shown station's name is ever printed; an unknown name from the URL is not echoed -->
		<div class="title">STATION INFORMATION{station ? ` // ${station.name}` : ""}</div>
		<div class="header-links">
			<a href={`/canticle/status${$page.url.searchParams.get("demo") === "1" ? "?demo=1" : ""}`}>STATUS</a>
			{#if station}
				<span class="top-right">{station.name}</span>
			{/if}
		</div>
	</header>

	<StripeBar
		loop={true}
		duration={20}
		color={shape.daemon === "degraded" || shape.receive === "degraded" ? "red" : "orange"}
		size="12px"
	/>

	{#if shape.synthetic}
		<div class="demo-banner">SYNTHETIC — DEMO DATA</div>
	{/if}

	<!-- order matters: no answer yet → waiting; the display can't hear → NO LINK (never "not shown"); then not shown -->
	{#if !shapeLoaded}
		<section class="loading-panel">LOADING STATION</section>
	{:else if !linked(shape)}
		<section class="not-shown no-link-panel">NO LINK</section>
	{:else if !station}
		<section class="not-shown">NOT SHOWN</section>
	{:else}
		<div class="detail-grid">
			<section class="information" aria-label="Station information">
				<div class="section-head">STATION INFORMATION</div>
				<div class="name-box">
					<div class="station-name">{station.name}</div>
					<div class="hazard" aria-hidden="true"></div>
				</div>

				<table>
					<tbody>
						<tr><th>state</th><td>{station?.state}</td></tr>
						<tr><th>heard</th><td>{station ? stateGloss(station.state) : ""}</td></tr>
						<tr><th>beacon age</th><td>{station ? beaconAge(station.beacon_age_ms) : "—"}</td></tr>
						<tr><th>carrier level</th><td>{station ? `${percent(station.beacon_age_ms)}%` : "—"}</td></tr>
						<tr><th>host</th><td>not shown</td></tr>
					</tbody>
				</table>

				<div class="stream-head">STATION STREAM</div>
				<div class="hex-picker" aria-label="Station stream">
					<button
						type="button"
						class:active={selectedStream === null}
						onclick={() => selectStream(null)}
					>ALL</button>
					{#each stationStreams as stream}
						<button
							type="button"
							class:active={selectedStream === stream}
							onclick={() => selectStream(stream)}
						>{stream}</button>
					{/each}
				</div>
			</section>

			<section class="waveform-panel" aria-label="Arrival waveform">
				<div class="section-head">
					<span>ARRIVAL WAVEFORM</span>
					{#if station}<span class="top-right">{station.name}</span>{/if}
				</div>
				<div class="waveform-title">ARRIVALS // {selectedStream ?? "ALL"}</div>
				{#if streamMissing}
					<div class="stream-missing">
						stream not on this station
						<button type="button" onclick={() => selectStream(null)}>SHOW ALL</button>
					</div>
				{/if}
				<svg viewBox="0 0 760 280" role="img" aria-label="Arrival count waveform">
					<defs>
						<pattern id="detail-unobserved-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
							<line x1="0" y1="0" x2="0" y2="7" stroke="#777" stroke-width="1" opacity=".45"></line>
						</pattern>
					</defs>

					{#each Array.from({ length: 6 }) as _, i}
						{@const y = chartTop + (chartHeight / 5) * i}
						<line x1={chartLeft} x2={chartRight} y1={y} y2={y} class="grid-line"></line>
						{@const value = maxY - (maxY / 5) * i}
						{#if Number.isInteger(value)}
							<text x={chartLeft - 8} y={y + 4} class="axis-label" text-anchor="end">{value}</text>
						{/if}
					{/each}
					{#each Array.from({ length: 7 }) as _, i}
						{@const x = chartLeft + (chartWidth / 6) * i}
						<line x1={x} x2={x} y1={chartTop} y2={chartBottom} class="grid-line"></line>
						{@const offset = Math.round((359 - i * 60) * (drum.bucket_ms / 60000))}
						<text x={x} y="270" class="axis-label" text-anchor="middle">
							{drum.now_ms > 0 ? localTime(drum.now_ms - offset * 60000) : "—"}
						</text>
					{/each}

					{#each unobservedRects() as rect}
						<rect x={rect.x} y={chartTop} width={rect.width} height={chartHeight} fill="url(#detail-unobserved-hatch)"></rect>
					{/each}

					{#each segments as segment}
						<polyline points={polyline(segment)} fill="none" stroke="#faaa00" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></polyline>
					{/each}

					<text x="10" y="18" class="axis-title">arrivals / 10 s</text>
				</svg>
			</section>

			<section class="log-panel" aria-label="Station arrival log">
				<div class="section-head">LOG</div>
				{#if logs.length === 0}
					<div class="log-empty">NO ARRIVALS</div>
				{:else}
					{#each logs as item}
						<div class="log-line">
							<span>{localTime(item.at_ms)}</span>
							<span>{item.stream}</span>
							<span class="redaction">████████</span>
						</div>
					{/each}
				{/if}
			</section>
		</div>

	{/if}
</main>

<style>
	.detail-page {
		position: relative;
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
	.title { font-size: clamp(15px, 3vw, 28px); font-weight: 900; overflow-wrap: anywhere; }
	.header-links { display:flex; align-items:center; gap:10px; font-size:11px; }
	.header-links a { border:1px solid var(--orange); color:var(--orange); padding:5px 8px; text-decoration:none; font-weight:900; }
	.top-right { color:white; white-space:nowrap; }

	.demo-banner {
		margin: 14px 18px 0;
		padding: 10px;
		border: 2px solid var(--red);
		background: rgba(230,9,8,.18);
		color: white;
		text-align: center;
		font-weight: 900;
		letter-spacing: .16em;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
		gap: 16px;
		width: calc(100% - 36px);
		max-width: 1400px;
		margin: 16px auto 0;
	}

	.information, .waveform-panel, .log-panel {
		border: 1px solid rgba(250,170,0,.5);
		background: rgba(0,0,0,.94);
	}
	.section-head {
		min-height: 38px;
		box-sizing: border-box;
		display:flex;
		align-items:center;
		justify-content:space-between;
		border-bottom: 2px solid var(--orange);
		padding: 8px 10px;
		font-weight:900;
		letter-spacing:.1em;
	}

	.station-name {
		width:100%;
		height:100%;
		display:grid;
		place-items:center;
		color:white;
		font-weight:900;
		font-size:clamp(12px,2vw,18px);
		text-align:center;
		overflow-wrap:anywhere;
	}

	table { width:calc(100% - 20px); margin:10px; border-collapse:collapse; font-size:11px; }
	th, td { border:1px solid rgba(250,170,0,.25); padding:7px; text-align:left; }
	th { color:rgba(250,170,0,.75); width:38%; }
	td { color:white; overflow-wrap:anywhere; }

	.stream-head { border-top:1px solid rgba(250,170,0,.35); padding:8px 10px; font-size:11px; font-weight:900; }
	.hex-picker { display:flex; flex-wrap:wrap; gap:8px; padding:4px 10px 12px; }
	.hex-picker button {
		width:64px;
		height:58px;
		border:1px solid var(--orange);
		background:#090909;
		color:var(--orange);
		clip-path:polygon(25% 6.7%,75% 6.7%,100% 50%,75% 93.3%,25% 93.3%,0 50%);
		font:900 9px monospace;
		cursor:pointer;
		overflow-wrap:anywhere;
	}
	.hex-picker button.active { background:#202020; color:white; border-color:white; }

	.waveform-panel { min-width:0; overflow:hidden; }
	.waveform-title { padding:8px 10px 0; color:white; font-size:11px; letter-spacing:.08em; }
	.waveform-panel svg { display:block; width:100%; height:auto; min-height:280px; }
	.grid-line { stroke:rgba(250,170,0,.22); stroke-width:1; vector-effect:non-scaling-stroke; }
	.axis-label { fill:rgba(255,255,255,.72); font-size:9px; font-family:monospace; }
	.axis-title { fill:var(--orange); font-size:10px; font-family:monospace; }

	.log-panel {
		grid-column:1 / -1;
		border:2px solid var(--red);
		max-height:300px;
		overflow:auto;
	}
	.log-line {
		display:grid;
		grid-template-columns:90px minmax(0,1fr) 72px;
		align-items:center;
		gap:8px;
		min-height:34px;
		border-bottom:1px solid rgba(230,9,8,.35);
		padding:5px 10px;
		font-size:10px;
		color:white;
	}
	.redaction { color:#050505; background:var(--orange); text-align:center; font-weight:900; }
	.log-empty { padding:20px; text-align:center; color:#777; }

	.not-shown, .loading-panel {
		margin:40px 18px;
		border:1px solid rgba(250,170,0,.5);
		padding:28px;
		text-align:center;
		color:var(--orange);
		font-weight:900;
		letter-spacing:.16em;
	}
	.name-box {
		display:flex;
		margin:12px;
		min-height:84px;
		border:2px solid var(--orange);
	}
	.name-box .station-name {
		flex:1;
		padding:12px;
		color:var(--orange);
		font-size:clamp(24px,7vw,40px);
		font-weight:900;
		line-height:1.05;
		overflow-wrap:anywhere;
	}
	.name-box .hazard {
		width:56px;
		background:repeating-linear-gradient(135deg, var(--orange) 0 10px, #050505 10px 20px);
	}

	.stream-missing {
		margin:10px;
		padding:12px;
		border:1px dashed #666;
		color:#aaa;
		letter-spacing:.08em;
		display:flex;
		justify-content:space-between;
		align-items:center;
		gap:10px;
	}
	.stream-missing button { border:1px solid var(--orange); background:#090909; color:var(--orange); padding:4px 8px; }

	.no-link-panel {
		color:#999;
		border-color:#555;
		background:repeating-linear-gradient(135deg, rgba(119,119,119,.22) 0, rgba(119,119,119,.22) 6px, transparent 6px, transparent 12px);
	}

	@media (max-width:600px) {
		.header-strip { align-items:flex-start; flex-direction:column; padding:8px 10px; }
		.detail-grid { grid-template-columns:1fr; width:calc(100% - 20px); }
		.log-panel { grid-column:1; }
		.waveform-panel svg { min-height:220px; }
		.log-line { grid-template-columns:82px minmax(0,1fr) 72px; }
	}
</style>
