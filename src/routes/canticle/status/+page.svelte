<script lang="ts">
	import { page } from "$app/stores";
	import { beforeNavigate, goto } from "$app/navigation";
	import StripeBar from "$lib/components/StripeBar.svelte";
	import RibCageLayout from "$lib/components/RibCageLayout.svelte";
	import { carrierLevel, sanitizeShape, stateGloss, type Shape } from "$lib/canticle/shape";
	import { createShapePoller } from "$lib/canticle/poller";
	import { barLook, linked } from "$lib/canticle/status";

	let shape = $state<Shape>(sanitizeShape(null));
	let loadingStation = $state<string | null>(null);
	// no answer yet is not evidence of a blind collector: wait for the first answer (a failed poll is one) before NO LINK
	let answered = $state(false);

	function beaconAge(ms: number | null): string {
		return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
	}

	// the SYNCHRONIZING pause before the detail page; any other navigation in the meantime (Back, a link) cancels it,
	// so it never drags the reader somewhere they already left (🌿 on #10)
	let pendingOpen: ReturnType<typeof setTimeout> | undefined;

	function cancelOpen(): void {
		if (pendingOpen) clearTimeout(pendingOpen);
		pendingOpen = undefined;
		loadingStation = null;
	}

	function openStation(name: string): void {
		cancelOpen();
		loadingStation = name;
		const demo = $page.url.searchParams.get("demo") === "1" ? "?demo=1" : "";
		pendingOpen = setTimeout(() => {
			pendingOpen = undefined;
			void goto(`/canticle/status/${encodeURIComponent(name)}${demo}`);
		}, 700);
	}

	beforeNavigate(() => cancelOpen());

	$effect(() => {
		const demo = $page.url.searchParams.get("demo") === "1";
		const route = $page.url.pathname;
		shape = sanitizeShape(null);
		loadingStation = null;
		answered = false;

		const poller = createShapePoller({
			fetch: (url, init) => fetch(url, init),
			url: () => route.endsWith("/canticle/status") && demo
				? "/api/canticle-shape?demo=1"
				: "/api/canticle-shape",
			onShape: (next) => {
				shape = next;
				answered = true;
			},
			maxAgeMs: 25000,
		});
		poller.tick();
		const timer = setInterval(poller.tick, 2000);

		return () => {
			cancelOpen();
			clearInterval(timer);
			poller.stop();
			shape = sanitizeShape(null);
			answered = false;
		};
	});
</script>

<main class="status-page" class:unobserved={answered && !linked(shape)}>
	<header class="header-strip">
		<div class="title">STATION STATUS</div>
		<div class="statuses">
			<a class="nav-link" href={`/canticle${$page.url.searchParams.get("demo") === "1" ? "?demo=1" : ""}`}>CANTICLE</a>
			<a class="nav-link" href={`/canticle/helicorder${$page.url.searchParams.get("demo") === "1" ? "?demo=1" : ""}`}>HELICORDER</a>
			<span class:danger={shape.daemon === "degraded"}>daemon <b>{shape.daemon}</b></span>
			<span class:danger={shape.receive === "degraded"}>receive <b>{shape.receive}</b></span>
			<span class:linked={linked(shape)} class="link">{!answered ? "WAITING" : shape.synthetic ? "SYNTHETIC" : shape.connected ? "CONNECTED" : "NO LINK"}</span>
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

	{#if !answered}
		<section class="empty-state">waiting for the gateway</section>
	{:else if !linked(shape)}
		<div class="board-hatch" aria-label="No link">
			<div class="no-link">NO LINK</div>
		</div>
	{:else if shape.stations.length === 0}
		<section class="empty-state">no stations shared with this display</section>
	{:else}
		<section class="board" aria-label="Station status board">
			<RibCageLayout items={shape.stations} maxBranches={5}>
				{#snippet nodeContent(station, { side, delay })}
					{@const look = barLook(station, shape)}
					<button
						type="button"
						class="station-bar station-{look}"
						style={`animation-delay:${delay}ms`}
						onclick={() => openStation(station.name)}
						aria-label={`${station.name}, ${station.state}, ${stateGloss(station.state)}, beacon ${beaconAge(station.beacon_age_ms)}`}
					>
						<span class="bar-name">{station.name}</span>
						<span class="tooltip" role="tooltip">
							<strong>{station.name}</strong>
							<span>{station.state}</span>
							<span>{stateGloss(station.state)}</span>
							<span>beacon {beaconAge(station.beacon_age_ms)}</span>
						</span>
					</button>
				{/snippet}
				{#snippet connectorContent(station)}
					<span>{station.name}</span>
				{/snippet}
			</RibCageLayout>
		</section>
	{/if}

	{#if loadingStation}
		<div class="loading-overlay" role="status">
			<div class="loader"></div>
			<p>SYNCHRONIZING {loadingStation}</p>
		</div>
	{/if}
</main>

<style>
	.status-page {
		min-height: 100vh;
		box-sizing: border-box;
		background:
			linear-gradient(rgba(250,170,0,.025) 1px, transparent 1px),
			linear-gradient(90deg, rgba(250,170,0,.025) 1px, transparent 1px),
			#050505;
		background-size: 28px 28px;
		color: var(--orange);
		padding-bottom: 24px;
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
		font-size: clamp(18px, 3vw, 34px);
		font-weight: 900;
	}

	.statuses {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px 12px;
		font-size: 11px;
		text-transform: uppercase;
	}

	.statuses b { margin-left: 4px; color: white; }
	.statuses .danger b { color: var(--red); }
	.nav-link, .link {
		border: 1px solid var(--orange);
		color: var(--orange);
		padding: 5px 8px;
		font-weight: 900;
		text-decoration: none;
	}
	.link { border-color: var(--red); color: var(--red); }
	.link.linked { border-color: #00ff88; color: #00ff88; }

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

	.board {
		position: relative;
		min-height: 420px;
		padding: 24px 0;
	}

	:global(.ews-rib-layout__spine),
	:global(.ews-rib-layout__connector-line) { background-color: #00ff88; }
	:global(.ews-rib-layout__connector-text) { color: #00ff88; }

	.station-bar {
		position: relative;
		width: 96px;
		height: 34px;
		border: 0;
		padding: 0;
		margin: 12px 0;
		background: #00ff88;
		color: #050505;
		transform: skewX(-18deg);
		box-shadow: 0 0 12px rgba(0,255,136,.45);
		cursor: pointer;
		font: 900 10px monospace;
		animation: bar-in .5s ease-out both;
	}

	.station-bar .bar-name {
		display: block;
		transform: skewX(18deg);
		max-width: 92px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.station-dim {
		background: #444;
		color: #aaa;
		box-shadow: none;
	}
	.station-unobserved {
		background: #444;
		color: #777;
		box-shadow: none;
	}

	.tooltip {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 8px);
		width: 220px;
		transform: translateX(-50%) skewX(18deg);
		display: none;
		flex-direction: column;
		gap: 3px;
		border: 1px solid var(--orange);
		background: #050505;
		color: white;
		padding: 8px;
		text-align: left;
		z-index: 30;
	}
	.station-bar:hover .tooltip,
	.station-bar:focus-visible .tooltip { display: flex; }
	.tooltip strong { color: var(--orange); overflow-wrap: anywhere; }

	.board-hatch {
		position: relative;
		min-height: calc(100vh - 180px);
		background: repeating-linear-gradient(135deg, rgba(119,119,119,.16) 0, rgba(119,119,119,.16) 6px, transparent 6px, transparent 12px);
	}
	.no-link {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #777;
		font-size: clamp(28px, 8vw, 72px);
		font-weight: 900;
		letter-spacing: .18em;
	}

	.loading-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0,0,0,.92);
		color: var(--orange);
		font-weight: 900;
		letter-spacing: .12em;
	}
	.loader {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(250,170,0,.25);
		border-top-color: var(--orange);
		border-radius: 50%;
		animation: spin .7s linear infinite;
	}

	.empty-state {
		margin: 40px 18px;
		border: 1px solid rgba(250,170,0,.5);
		padding: 28px;
		text-align: center;
		text-transform: uppercase;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
	@keyframes bar-in {
		from { opacity: 0; transform: skewX(-18deg) translateX(-18px); }
		to { opacity: 1; transform: skewX(-18deg) translateX(0); }
	}

	@media (max-width: 600px) {
		.header-strip { align-items: flex-start; flex-direction: column; padding: 8px 10px; }
		.statuses { justify-content: flex-start; }
		.board { min-height: 360px; }
		.station-bar { width: 78px; }
		.tooltip { width: 180px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.station-bar, .loader { animation: none; }
	}
</style>
