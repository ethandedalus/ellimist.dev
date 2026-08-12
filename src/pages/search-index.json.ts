import type { APIRoute } from 'astro';
import { getSearchIndex } from '~/lib/search-index';

// Emitted as a static file at build time and fetched lazily by the search
// islands, so the body text never lands in any page's HTML.
export const GET: APIRoute = async () => {
	const payload = await getSearchIndex();

	return new Response(JSON.stringify(payload), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=0, must-revalidate',
		},
	});
};
