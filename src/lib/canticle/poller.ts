import { sanitizeShape, type Shape } from "./shape";
import { sanitizeFlow, type Flow } from "./flow";

type ShapeFetch = (url: string, init: { signal: AbortSignal; cache: RequestCache }) => Promise<Response>;

export type ShapePollerOptions = {
	fetch: ShapeFetch;
	url: () => string;
	onShape: (shape: Shape) => void;
	now?: () => number;
	/** A request still pending after this is aborted, and the shape reads disconnected. */
	timeoutMs?: number;
	/** With no good answer for this long, the shape reads disconnected, whatever is in flight. */
	maxAgeMs?: number;
};

export const POLL_TIMEOUT_MS = 3000;
export const POLL_MAX_AGE_MS = 6000;

/**
 * Polls the shape route without ever showing an old answer as current (🌫 on ews-concept-new#3).
 *
 * - One request at a time: a tick while one is in flight starts nothing, so an older answer can never land after a
 *   newer one.
 * - A non-2xx answer, a failed or aborted request, or a body that isn't JSON reads disconnected.
 * - A request still pending after `timeoutMs` is aborted.
 * - With no good answer for `maxAgeMs`, the shape reads disconnected even if a request is still pending.
 */
export function createShapePoller(options: ShapePollerOptions) {
	return createPoller<Shape>({
		fetch: options.fetch,
		url: options.url,
		onValue: options.onShape,
		sanitize: sanitizeShape,
		empty: sanitizeShape(null),
		isCurrent: (shape) => shape.connected,
		now: options.now,
		timeoutMs: options.timeoutMs,
		maxAgeMs: options.maxAgeMs,
	});
}

export type CanticlePollerOptions<T> = {
	fetch: ShapeFetch;
	url: () => string;
	onValue: (value: T) => void;
	sanitize: (raw: unknown) => T;
	empty: T | (() => T);
	isCurrent?: (value: T) => boolean;
	now?: () => number;
	timeoutMs?: number;
	maxAgeMs?: number;
};

export function createPoller<T>(options: CanticlePollerOptions<T>) {
	const now = options.now ?? Date.now;
	const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
	const maxAgeMs = options.maxAgeMs ?? POLL_MAX_AGE_MS;
	const getEmpty = () => typeof options.empty === "function" ? (options.empty as () => T)() : options.empty;
	const isCurrent = options.isCurrent ?? (() => true);
	let inFlight = false;
	let lastGoodAt: number | null = null;
	let showingConnected = false;
	let stopped = false;

	function show(value: T) {
		if (stopped) return;
		showingConnected = isCurrent(value);
		options.onValue(value);
	}

	async function tick(): Promise<void> {
		if (showingConnected && (lastGoodAt === null || now() - lastGoodAt > maxAgeMs)) {
			show(getEmpty());
		}
		if (inFlight || stopped) return;
		inFlight = true;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await options.fetch(options.url(), { signal: controller.signal, cache: "no-store" });
			if (!response.ok || controller.signal.aborted) {
				show(getEmpty());
				return;
			}
			const value = options.sanitize(await response.json());
			// A fetch that ignored its abort and settled late is not a good answer (🌫 on #3).
			if (controller.signal.aborted) throw new Error("aborted");
			lastGoodAt = now();
			show(value);
		} catch {
			show(getEmpty());
		} finally {
			clearTimeout(timer);
			inFlight = false;
		}
	}

	return {
		tick,
		stop() {
			stopped = true;
		},
	};
}

export type FlowPollerOptions = Omit<CanticlePollerOptions<Flow>, "sanitize" | "empty" | "isCurrent" | "onValue"> & {
	onFlow: (flow: Flow) => void;
};

export function createFlowPoller(options: FlowPollerOptions) {
	return createPoller<Flow>({
		fetch: options.fetch,
		url: options.url,
		onValue: options.onFlow,
		sanitize: sanitizeFlow,
		empty: sanitizeFlow(null),
		isCurrent: (flow) => flow.minutes.length > 0,
		now: options.now,
		timeoutMs: options.timeoutMs,
		maxAgeMs: options.maxAgeMs,
	});
}
