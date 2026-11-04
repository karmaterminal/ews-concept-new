import { afterEach, describe, expect, it, vi } from "vitest";
import { createShapePoller, POLL_MAX_AGE_MS, POLL_TIMEOUT_MS } from "./poller";
import type { Shape } from "./shape";
import { createFlowPoller } from "./poller";
import type { Flow } from "./flow";

const GOOD = {
	now_ms: 1,
	synthetic: false,
	connected: true,
	daemon: "ok",
	receive: "ok",
	stations: [{ name: "cael", state: "EQUIPPED_SPEAKING", beacon_age_ms: 900, streams: [] }],
};

function ok(body: unknown = GOOD): Response {
	return new Response(JSON.stringify(body), { status: 200 });
}

function harness() {
	const shown: Shape[] = [];
	const clock = { t: 0 };
	const queue: Array<(signal: AbortSignal) => Promise<Response>> = [];
	const fetch = vi.fn((_url: string, init: { signal: AbortSignal }) => {
		const next = queue.shift();
		if (!next) throw new Error("no response queued");
		return next(init.signal);
	});
	const poller = createShapePoller({
		fetch,
		url: () => "/api/canticle-shape",
		onShape: (s) => shown.push(s),
		now: () => clock.t,
	});
	const last = () => shown[shown.length - 1];
	return { shown, clock, queue, fetch, poller, last };
}

/** A response the test settles by hand; it rejects if the request is aborted first. */
function deferred() {
	let settle!: (r: Response) => void;
	const respond = (signal: AbortSignal) =>
		new Promise<Response>((resolve, reject) => {
			settle = resolve;
			signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
		});
	return { respond, settle: (r: Response) => settle(r) };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("createShapePoller", () => {
	it("reads disconnected on a 5xx after a good answer, and recovers on the next good one", async () => {
		const h = harness();
		h.queue.push(async () => ok(), async () => new Response("bad gateway", { status: 503 }));
		h.queue.push(async () => new Response("", { status: 500 }), async () => ok());
		await h.poller.tick();
		expect(h.last().connected).toBe(true);
		await h.poller.tick();
		expect(h.last()).toMatchObject({ connected: false, daemon: "unknown", receive: "unknown", stations: [] });
		await h.poller.tick();
		expect(h.last().connected).toBe(false);
		await h.poller.tick();
		expect(h.last()).toMatchObject({ connected: true, stations: [{ beacon_age_ms: 900 }] });
	});

	describe("createFlowPoller", () => {
		it("uses the same stale and invalidation rules for flow", async () => {
			const shown: Flow[] = [];
			let t = 0;
			const good: Flow = {
				now_ms: 1,
				since_ms: 0,
				minute_ms: 60000,
				synthetic: false,
				minutes: [{ t: 1, observed: true }],
				stations: [{ name: "cael", minutes: [{ beacon: true, state: "unknown", arrivals: [] }] }],
				river: [],
			};
			const queue: Response[] = [
				new Response(JSON.stringify(good), { status: 200 }),
				new Response("bad gateway", { status: 503 }),
			];
			const poller = createFlowPoller({
				fetch: vi.fn(async () => queue.shift() as Response),
				url: () => "/api/canticle-flow",
				onFlow: (flow) => shown.push(flow),
				now: () => t,
			});
			await poller.tick();
			expect(shown.at(-1)?.stations).toHaveLength(1);
			t = POLL_MAX_AGE_MS + 1;
			await poller.tick();
			expect(shown.at(-1)?.stations).toEqual([]);
		});
	});

	it("reads disconnected when the request throws or the body is not JSON", async () => {
		const h = harness();
		h.queue.push(async () => ok(), async () => Promise.reject(new TypeError("network")));
		h.queue.push(async () => ok(), async () => new Response("<html>", { status: 200 }));
		for (const want of [true, false, true, false]) {
			await h.poller.tick();
			expect(h.last().connected).toBe(want);
		}
	});

	it("starts no second request while one is pending, so an older answer cannot land after a newer one", async () => {
		const h = harness();
		const first = deferred();
		h.queue.push(first.respond);
		const pending = h.poller.tick();
		await h.poller.tick();
		await h.poller.tick();
		expect(h.fetch).toHaveBeenCalledTimes(1);
		first.settle(ok());
		await pending;
		expect(h.shown).toHaveLength(1);
		expect(h.last().connected).toBe(true);
	});

	it("reads disconnected once no good answer has come for the bound, even with a request pending", async () => {
		const h = harness();
		h.queue.push(async () => ok());
		await h.poller.tick();
		const hung = deferred();
		h.queue.push(hung.respond);
		h.clock.t = 1000;
		const pending = h.poller.tick();
		h.clock.t = POLL_MAX_AGE_MS;
		await h.poller.tick();
		expect(h.last().connected).toBe(true);
		h.clock.t = POLL_MAX_AGE_MS + 1;
		await h.poller.tick();
		expect(h.last()).toMatchObject({ connected: false, stations: [] });
		hung.settle(ok());
		await pending;
		expect(h.last().connected).toBe(true);
	});

	it("aborts a request that never settles, and reads disconnected", async () => {
		vi.useFakeTimers();
		const h = harness();
		h.queue.push(async () => ok());
		await h.poller.tick();
		h.queue.push(deferred().respond);
		const pending = h.poller.tick();
		await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - 1);
		expect(h.last().connected).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		await pending;
		expect(h.last().connected).toBe(false);
		h.queue.push(async () => ok());
		await h.poller.tick();
		expect(h.fetch).toHaveBeenCalledTimes(3);
		expect(h.last().connected).toBe(true);
	});

	it("does not take an answer that ignored its abort and settled late (🌫 on #3)", async () => {
		vi.useFakeTimers();
		const h = harness();
		h.queue.push(async () => ok());
		await h.poller.tick();
		let settle!: (r: Response) => void;
		h.queue.push(() => new Promise<Response>((resolve) => (settle = resolve))); // never listens to the signal
		const pending = h.poller.tick();
		await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS);
		settle(ok());
		await pending;
		expect(h.last().connected).toBe(false);
	});

	it("shows nothing after it is stopped", async () => {
		const h = harness();
		const late = deferred();
		h.queue.push(late.respond);
		const pending = h.poller.tick();
		h.poller.stop();
		late.settle(ok());
		await pending;
		expect(h.shown).toHaveLength(0);
	});
});
