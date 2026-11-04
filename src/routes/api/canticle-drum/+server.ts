import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { DEMO_DRUM, sanitizeDrum } from "$lib/canticle/drum";

export const GET: RequestHandler = async ({ url }) => {
	const demo = url.searchParams.get("demo") === "1";
	const headers = { "cache-control": "no-store" };

	if (demo) {
		return json(DEMO_DRUM(Date.now()), { headers });
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const endpoint =
			process.env.CANTICLE_DRUM_URL || "http://127.0.0.1:8766/api/drum";
		const response = await fetch(endpoint, { signal: controller.signal });
		if (!response.ok) throw new Error(`drum endpoint returned ${response.status}`);
		const data = await response.json();
		return json(sanitizeDrum(data), { headers });
	} catch {
		return json(sanitizeDrum(null), { headers });
	} finally {
		clearTimeout(timeout);
	}
};
