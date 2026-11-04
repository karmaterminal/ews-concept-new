<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { page } from "$app/stores";
	import HexShape from "$lib/components/HexShape.svelte";
	import StripeBar from "$lib/components/StripeBar.svelte";
	import {
		carrierLevel,
		sanitizeShape,
		stateTone,
		type Shape,
	} from "$lib/canticle/shape";

	let shape = $state<Shape>(sanitizeShape(null));
	let poll: ReturnType<typeof setInterval> | undefined;

	function seconds(ms: number | null): string {
		return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
	}

	async function pollShape() {
		try {
			const demo = $page.url.searchParams.get("demo") === "1";
			const response = await fetch(
				demo ? "/api/canticle-shape?demo=1" : "/api/canticle-shape",
			);
			if (!response.ok) return;
			shape = sanitizeShape(await response.json());
		} catch {
			shape = sanitizeShape(null);
		}
	}

	onMount(() => {
		pollShape();
		poll = setInterval(pollShape, 2000);
	});

	onDestroy(() => {
		if (poll) clearInterval(poll);
	});
</script>

<main class="canticle-page">
	<header class="header-strip">
		<div class="title">CANTICLE // CARRIER SHAPE</div>
		<div class="statuses">
			<span>daemon <b>{shape.daemon}</b></span>
			<span>receive <b>{shape.receive}</b></span>
			<span class:linked={shape.connected} class="link">
				{shape.connected ? "CONNECTED" : "NO LINK"}
			</span>
		</div>
	</header>

	<StripeBar loop={true} duration={20} color={shape.connected ? "orange" : "red"} size="12px" />

	{#if shape.synthetic}
		<div class="demo-banner">SYNTHETIC — DEMO DATA</div>
	{/if}

	{#if shape.stations.length === 0}
		<section class="empty-state">no stations shared with this display</section>
	{:else}
		<section class="station-grid" aria-label="Broadcast stations">
			{#each shape.stations as station}
				{@const tone = stateTone(station.state)}
				{@const level = carrierLevel(station.beacon_age_ms)}
				<article class="station-pod tone-{tone}">
					<HexShape className="canticle-hex" color={tone === "speaking" ? "orange" : tone === "dark" ? "" : "orange"} paddingContent={18}>
						<div class="hex-content">
							<div
								class="carrier-ring"
								style={`--carrier-level:${level}; --ring-scale:${0.82 + level * 0.18}; --ring-opacity:${0.18 + level * 0.82}`}
							></div>
							<div class="station-name">{station.name}</div>
							<div class="state-word">{station.state}</div>
							<div class="beacon">
								<span>BEACON</span>
								<strong>{seconds(station.beacon_age_ms)}</strong>
							</div>
						</div>
					</HexShape>

					<div class="streams">
						{#each station.streams as stream}
							<div class="stream">
								<div class="stream-head">
									<span class="stream-name">{stream.stream}</span>
									<span class="stream-age">{seconds(stream.newest_age_ms)}</span>
								</div>
								<div class="activity-track" aria-label={`live activity ${stream.live}`}>
									<div
										class="activity-fill"
										style={`width:${Math.min(stream.live, 10) * 10}%`}
									></div>
								</div>
							</div>
						{/each}
					</div>
				</article>
			{/each}
		</section>
	{/if}

	<footer>shape only — no station text is ever shown here</footer>
</main>

<style>
	.canticle-page {
		min-height: 100vh;
		background:
			linear-gradient(rgba(255, 170, 0, 0.025) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 170, 0, 0.025) 1px, transparent 1px),
			#050505;
		background-size: 28px 28px;
		color: var(--orange);
		padding-bottom: 24px;
	}

	.header-strip {
		min-height: 64px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 18px;
		border-bottom: 3px solid var(--orange);
		background: rgba(250, 170, 0, 0.08);
		letter-spacing: 0.12em;
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
		gap: 10px 18px;
		font-size: 12px;
		text-transform: uppercase;
	}

	.statuses b {
		margin-left: 4px;
		color: white;
	}

	.link {
		border: 1px solid var(--red);
		color: var(--red);
		padding: 5px 8px;
		font-weight: 900;
	}

	.link.linked {
		border-color: #00ff80;
		color: #00ff80;
	}

	.demo-banner {
		margin: 18px 18px 0;
		border: 2px solid var(--red);
		background: rgba(230, 9, 8, 0.18);
		color: #fff;
		text-align: center;
		padding: 12px;
		font-size: clamp(16px, 3vw, 28px);
		font-weight: 900;
		letter-spacing: 0.16em;
		box-shadow: 0 0 18px rgba(230, 9, 8, 0.35);
	}

	.station-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 300px));
		justify-content: center;
		gap: 28px;
		padding: 32px 18px 20px;
	}

	.station-pod {
		--tone: var(--orange);
		min-width: 0;
	}

	.station-pod.tone-speaking { --tone: #00ff80; }
	.station-pod.tone-quiet { --tone: var(--orange); }
	.station-pod.tone-present { --tone: #66aaff; }
	.station-pod.tone-dark { --tone: #777; }

	:global(.canticle-hex) {
		filter: drop-shadow(0 0 10px color-mix(in srgb, var(--tone) 38%, transparent));
	}

	/* The hex is a solid fill: give the content the whole hex, and read it off a dark disc. */
	:global(.canticle-hex .inner-content) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hex-content {
		position: relative;
		width: 64%;
		aspect-ratio: 1;
		box-sizing: border-box;
		padding: 10%;
		border-radius: 50%;
		background: #050505;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		color: var(--tone);
	}

	.carrier-ring {
		position: absolute;
		inset: -4%;
		border: 2px solid var(--tone);
		border-radius: 50%;
		opacity: var(--ring-opacity);
		transform: scale(var(--ring-scale));
		box-shadow: 0 0 16px var(--tone), inset 0 0 12px var(--tone);
		animation: carrier-pulse 2s ease-in-out infinite;
		pointer-events: none;
	}

	.station-name {
		position: relative;
		max-width: 100%;
		font-size: clamp(12px, 1.4vw, 16px);
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.state-word {
		position: relative;
		margin-top: 5px;
		max-width: 100%;
		font-size: 9px;
		color: white;
		letter-spacing: 0.04em;
		overflow-wrap: anywhere;
	}

	.beacon {
		position: relative;
		display: flex;
		flex-direction: column;
		margin-top: 10px;
		font-size: 9px;
	}

	.beacon strong {
		font-size: 14px;
		color: white;
	}

	.streams {
		min-height: 54px;
		margin: -12px 22px 0;
		border: 1px solid rgba(250, 170, 0, 0.45);
		background: rgba(0, 0, 0, 0.92);
		padding: 8px;
		position: relative;
		z-index: 2;
	}

	.stream + .stream {
		margin-top: 7px;
	}

	.stream-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 10px;
	}

	.stream-name {
		max-width: 70%;
		overflow-wrap: anywhere;
	}

	.stream-age {
		color: white;
		white-space: nowrap;
	}

	.activity-track {
		height: 7px;
		margin-top: 4px;
		border: 1px solid rgba(250, 170, 0, 0.35);
		background: #151515;
	}

	.activity-fill {
		height: 100%;
		min-width: 0;
		background: var(--tone);
		box-shadow: 0 0 8px var(--tone);
	}

	.empty-state {
		margin: 40px 18px;
		border: 1px solid rgba(250, 170, 0, 0.5);
		padding: 28px;
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	footer {
		border-top: 1px solid rgba(250, 170, 0, 0.35);
		margin: 20px 18px 0;
		padding-top: 12px;
		text-align: center;
		color: rgba(250, 170, 0, 0.75);
		font-size: 11px;
		letter-spacing: 0.08em;
	}

	@keyframes carrier-pulse {
		0%, 100% { filter: brightness(0.75); }
		50% { filter: brightness(1.35); }
	}

	@media (prefers-reduced-motion: reduce) {
		.carrier-ring { animation: none; }
	}

	@media (max-width: 600px) {
		.header-strip {
			align-items: flex-start;
			flex-direction: column;
		}
		.statuses { justify-content: flex-start; }
		.station-grid {
			grid-template-columns: minmax(220px, 300px);
		}
	}
</style>
