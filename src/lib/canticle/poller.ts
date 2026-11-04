import { sanitizeShape, type Shape } from "./shape";

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
	const now = options.now ?? Date.now;
	const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
	const maxAgeMs = options.maxAgeMs ?? POLL_MAX_AGE_MS;
	let inFlight = false;
	let lastGoodAt: number | null = null;
	let showingConnected = false;
	let stopped = false;

	function show(shape: Shape) {
		if (stopped) return;
		showingConnected = shape.connected;
		options.onShape(shape);
	}

	async function tick(): Promise<void> {
		if (showingConnected && (lastGoodAt === null || now() - lastGoodAt > maxAgeMs)) {
			show(sanitizeShape(null));
		}
		if (inFlight || stopped) return;
		inFlight = true;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await options.fetch(options.url(), { signal: controller.signal, cache: "no-store" });
			if (!response.ok) {
				show(sanitizeShape(null));
				return;
			}
			const shape = sanitizeShape(await response.json());
			lastGoodAt = now();
			show(shape);
		} catch {
			show(sanitizeShape(null));
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
