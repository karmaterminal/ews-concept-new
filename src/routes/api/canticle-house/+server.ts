import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { DEMO_HOUSE } from "$lib/canticle/house";

export const GET: RequestHandler = async ({ url }) => {
	if (url.searchParams.get("demo") !== "1") {
		return json({ error: "not-granted" }, { status: 404 });
	}

	return json(DEMO_HOUSE(Date.now(), {
		blind: url.searchParams.get("blind") === "1",
	}), { headers: { "cache-control": "no-store" } });
};
