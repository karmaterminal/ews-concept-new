<script lang="ts">
	import { page } from "$app/stores";
	import { createPoller } from "$lib/canticle/poller";
	import {
		hostPositions,
		pulses,
		sanitizeHouse,
		stationLook,
		type House,
	} from "$lib/canticle/house";

	let house = $state<House>(sanitizeHouse(null));
	// time since the last answer arrived, so pulses move between polls; it never invents an arrival
	let receivedAt = 0;
	let elapsed = $state(0);
	const isDemo = $derived($page.url.searchParams.get("demo") === "1");

	// phone first (frond-house §4): one small viewBox that scales to 412 px without shrinking text to nothing
	const svgWidth = 520;
	const svgHeight = 490;
	const ringHeight = 400;
	const hexRadius = 22;

	const isBlind = $derived($page.url.searchParams.get("blind") === "1");

	// One poller per demo view, keyed on the current query, not on the first mount: a client-side move to ?demo=1
	// starts it, and leaving (a link, Back, or a change of ?blind) stops it and resets to the empty house (🌫 on #9).
	function startDemo(blind: boolean): () => void {
		const poller = createPoller<House>({
			fetch: (url, init) => fetch(url, init),
			url: () => blind ? "/api/canticle-house?demo=1&blind=1" : "/api/canticle-house?demo=1",
			onValue: (next) => {
				house = next;
				receivedAt = Date.now();
				elapsed = 0;
			},
			sanitize: sanitizeHouse,
			empty: sanitizeHouse(null),
			isCurrent: (next) => next.connected,
			maxAgeMs: 25000,
		});
		poller.tick();
		const poll = setInterval(poller.tick, 10000);
		const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		const frame = still ? undefined : setInterval(() => { if (receivedAt) elapsed = Date.now() - receivedAt; }, 100);
		return () => {
			poller.stop();
			clearInterval(poll);
			if (frame) clearInterval(frame);
		};
	}

	$effect(() => {
		// no live house exists yet: without ?demo=1 nothing is polled at all
		if (!isDemo) return;
		const stop = startDemo(isBlind);
		return () => {
			stop();
			house = sanitizeHouse(null);
			receivedAt = 0;
			elapsed = 0;
		};
	});

	function hostPoint(index: number): { x: number; y: number } {
		return hostPositions(house.hosts.length, svgWidth, ringHeight)[index] ?? { x: svgWidth / 2, y: ringHeight / 2 };
	}

	// the direction from the ring's centre out through a host: its stations sit outside it, its name inside
	function outward(hostIndex: number): number {
		const host = hostPoint(hostIndex);
		return Math.atan2(host.y - ringHeight / 2, host.x - svgWidth / 2);
	}

	function stationPoint(hostIndex: number, stationIndex: number, stationCount: number): { x: number; y: number } {
		const host = hostPoint(hostIndex);
		const angle = outward(hostIndex) + (stationIndex - (stationCount - 1) / 2) * 0.55;
		return { x: host.x + Math.cos(angle) * 40, y: host.y + Math.sin(angle) * 40 };
	}

	// a label reads away from its point: left of it on the left side, right of it on the right
	function anchorFor(angle: number): "start" | "middle" | "end" {
		const c = Math.cos(angle);
		return c < -0.35 ? "end" : c > 0.35 ? "start" : "middle";
	}

	function along(point: { x: number; y: number }, angle: number, distance: number): { x: number; y: number } {
		return { x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance };
	}

	function unplacedPoint(index: number, count: number): { x: number; y: number } {
		return { x: ((index + 1) / (count + 1)) * svgWidth, y: 456 };
	}

	function hexPoints(cx: number, cy: number, radius = hexRadius): string {
		return Array.from({ length: 6 }, (_, i) => {
			const angle = -Math.PI / 2 + i * Math.PI / 3;
			return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
		}).join(" ");
	}

</script>

<main class="house-page">
	<header class="header-strip">
		<div class="title">HOUSE // FROND MAP</div>
		{#if isDemo}
			<div class="connection" class:linked={house.connected}>
				{house.connected ? "CONNECTED" : "NO LINK"}
			</div>
		{/if}
	</header>

	{#if house.synthetic}
		<div class="demo-banner">SYNTHETIC — DEMO DATA</div>
	{/if}

	{#if !isDemo}
		<section class="grant-panel">
			<div>HOUSE is a demo until a second host is granted</div>
			<a href="/canticle/house?demo=1">OPEN DEMO</a>
		</section>
	{:else}
	<section class="house-panel" aria-label="HOUSE host and station map">
		<svg class="house-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-label="HOUSE host map">
			<defs>
				<pattern id="house-unobserved-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
					<line x1="0" y1="0" x2="0" y2="7" stroke="#777" stroke-width="1" opacity="0.45"></line>
				</pattern>
			</defs>

			{#each house.hosts as host, hostIndex}
				{@const hostPos = hostPoint(hostIndex)}
				{@const label = along(hostPos, outward(hostIndex) + Math.PI, hexRadius + 6)}
				<g class="host-node" aria-label={`host ${host.name}`}>
					<polygon
						points={hexPoints(hostPos.x, hostPos.y)}
						fill="#111"
						stroke="#faaa00"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					></polygon>
					<text x={label.x} y={label.y + 3} text-anchor={anchorFor(outward(hostIndex) + Math.PI)} class="host-name">{host.name}</text>
				</g>

				{#each host.stations as station, stationIndex}
					{@const stationPos = stationPoint(hostIndex, stationIndex, host.stations.length)}
					{@const look = stationLook(station, house.connected)}
					<line
						x1={hostPos.x}
						y1={hostPos.y}
						x2={stationPos.x}
						y2={stationPos.y}
						class:spoke-withheld={look === "withheld"}
						class:spoke-not-heard={look === "not_heard"}
						class:spoke-unobserved={look === "unobserved"}
						class="station-spoke"
					></line>

					{#if look === "quiet" || look === "speaking"}
						<circle cx={stationPos.x} cy={stationPos.y} r="12" class="carrier-ring" class:speaking={look === "speaking"}></circle>
					{:else if look === "withheld"}
						<g class="withheld-seal" aria-label={`${station.name} withheld`}>
							<circle cx={stationPos.x} cy={stationPos.y} r="12"></circle>
							<rect x={stationPos.x - 5} y={stationPos.y - 1} width="10" height="8" rx="1"></rect>
							<path d={`M ${stationPos.x - 3} ${stationPos.y - 1} v -3 a3 3 0 0 1 6 0 v3`}></path>
						</g>
					{:else if look === "not_heard"}
						<circle cx={stationPos.x} cy={stationPos.y} r="9" class="not-heard"></circle>
					{/if}

					{#if look !== "withheld" && look !== "not_heard" && look !== "unobserved"}
						<circle cx={stationPos.x} cy={stationPos.y} r="4" class="station-dot"></circle>
					{/if}

					{@const stationLabel = along(stationPos, outward(hostIndex), 17)}
					<text x={stationLabel.x} y={stationLabel.y + 3} text-anchor={anchorFor(outward(hostIndex))} class="station-name">{station.name}</text>

					{#if look === "speaking"}
						{#each pulses(station, elapsed) as progress}
							<circle
								cx={stationPos.x + (hostPos.x - stationPos.x) * progress}
								cy={stationPos.y + (hostPos.y - stationPos.y) * progress}
								r="3"
								class="arrival-pulse"
							></circle>
						{/each}
					{/if}
				{/each}
			{/each}

			{#if house.unplaced.length > 0}
				<line x1="150" y1="424" x2="370" y2="424" class="unplaced-rule"></line>
				<text x="260" y="416" text-anchor="middle" class="unplaced-label">host not shown</text>
				{#each house.unplaced as station, index}
					{@const stationPos = unplacedPoint(index, house.unplaced.length)}
					{@const look = stationLook(station, house.connected)}
					{#if look === "quiet" || look === "speaking"}
						<circle cx={stationPos.x} cy={stationPos.y} r="12" class="carrier-ring" class:speaking={look === "speaking"}></circle>
					{:else if look === "withheld"}
						<g class="withheld-seal" aria-label={`${station.name} withheld`}>
							<circle cx={stationPos.x} cy={stationPos.y} r="12"></circle>
							<rect x={stationPos.x - 5} y={stationPos.y - 1} width="10" height="8" rx="1"></rect>
							<path d={`M ${stationPos.x - 3} ${stationPos.y - 1} v -3 a3 3 0 0 1 6 0 v3`}></path>
						</g>
					{:else if look === "not_heard"}
						<circle cx={stationPos.x} cy={stationPos.y} r="9" class="not-heard"></circle>
					{/if}
					{#if look !== "withheld" && look !== "not_heard" && look !== "unobserved"}
						<circle cx={stationPos.x} cy={stationPos.y} r="4" class="station-dot"></circle>
					{/if}
					<text x={stationPos.x} y={stationPos.y + 25} text-anchor="middle" class="station-name">{station.name}</text>
				{/each}
			{/if}

			{#if !house.connected}
				<rect x="0" y="0" width={svgWidth} height={svgHeight} fill="url(#house-unobserved-hatch)" class="no-link-cover"></rect>
				<text x={svgWidth / 2} y={svgHeight / 2} text-anchor="middle" class="no-link">NO LINK</text>
			{/if}
		</svg>
	</section>
	{/if}

	<footer class="legend">
		a host appears only when its station and its host are both granted · the only link is heard here · hatched means this display isn't listening · nothing said is ever shown
	</footer>
</main>

<style>
	.house-page {
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

	.connection {
		border: 1px solid var(--red);
		color: var(--red);
		padding: 5px 8px;
		font-size: 11px;
		font-weight: 900;
	}

	.connection.linked {
		border-color: #00ff80;
		color: #00ff80;
	}

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

	.grant-panel {
		margin: 14px 18px 0;
		border: 1px solid rgba(250,170,0,.55);
		padding: 16px;
		text-align: center;
		color: white;
	}

	.grant-panel a {
		display: inline-block;
		margin-top: 10px;
		border: 1px solid var(--orange);
		color: var(--orange);
		padding: 7px 10px;
		text-decoration: none;
		font-weight: 900;
	}

	.house-panel {
		width: calc(100% - 36px);
		max-width: 1400px;
		margin: 12px auto 0;
		border: 1px solid rgba(250,170,0,.45);
		background: rgba(0,0,0,.92);
		overflow: hidden;
	}

	.house-svg {
		display: block;
		width: 100%;
		height: auto;
		min-height: 360px;
	}

	.host-name {
		fill: var(--orange);
		font-size: 9px;
		font-weight: 900;
		letter-spacing: .04em;
	}

	.station-name {
		fill: rgba(255,255,255,.82);
		font-size: 10px;
		overflow-wrap: anywhere;
	}

	.station-spoke {
		stroke: #3cff9a;
		stroke-width: 1;
		opacity: .55;
		vector-effect: non-scaling-stroke;
	}

	.spoke-withheld { stroke: #77708b; }
	.spoke-not-heard { stroke: #555; }
	.spoke-unobserved { opacity: 0; }

	.carrier-ring {
		fill: none;
		stroke: #faaa00;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
		animation: carrier-breathe 4.2s ease-in-out infinite;
	}

	.carrier-ring.speaking {
		stroke: #3cff9a;
	}

	.station-dot {
		fill: #050505;
		stroke: #faaa00;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.speaking + .station-dot {
		fill: #3cff9a;
	}

	.arrival-pulse {
		fill: #3cff9a;
		filter: drop-shadow(0 0 4px #3cff9a);
	}

	.not-heard {
		fill: #222;
		stroke: #555;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.withheld-seal circle,
	.withheld-seal rect,
	.withheld-seal path {
		fill: #77708b;
		stroke: #77708b;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.withheld-seal rect,
	.withheld-seal path {
		fill: #050505;
	}

	.unplaced-rule {
		stroke: rgba(250,170,0,.35);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.unplaced-label {
		fill: rgba(250,170,0,.7);
		font-size: 10px;
		letter-spacing: .12em;
	}

	.no-link-cover {
		opacity: .82;
	}

	.no-link {
		fill: white;
		font-size: 22px;
		font-weight: 900;
		letter-spacing: .18em;
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

	@keyframes carrier-breathe {
		0%, 100% { opacity: .38; }
		50% { opacity: .9; }
	}

	@media (max-width: 600px) {
		.header-strip {
			align-items: flex-start;
			flex-direction: column;
			padding: 8px 10px;
		}
		.demo-banner { margin-inline: 10px; }
		.grant-panel { margin-inline: 10px; }
		.house-panel { width: calc(100% - 20px); }
		.house-svg { min-height: 300px; }
		.legend { margin-inline: 10px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.carrier-ring { animation: none; }
	}
</style>
