import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEMO_SHAPE, sanitizeShape } from '$lib/canticle/shape';

export const GET: RequestHandler = async ({ url }) => {
	const demo = url.searchParams.get('demo') === '1';
	const headers = { 'cache-control': 'no-store' };

	if (demo) {
		return json(DEMO_SHAPE(Date.now()), { headers });
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const endpoint =
			process.env.CANTICLE_SHAPE_URL || 'http://127.0.0.1:8766/api/shape';
		const response = await fetch(endpoint, { signal: controller.signal });
		if (!response.ok) throw new Error(`shape endpoint returned ${response.status}`);
		const data = await response.json();
		return json(sanitizeShape(data), { headers });
	} catch {
		return json(
			sanitizeShape({
				now_ms: Date.now(),
				synthetic: false,
				connected: false,
				daemon: 'unknown',
				receive: 'unknown',
				stations: [],
			}),
			{ headers },
		);
	} finally {
		clearTimeout(timeout);
	}
};
