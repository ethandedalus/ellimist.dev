import type MiniSearch from 'minisearch';
import type { SearchResult } from 'minisearch';
import type {
	FacetCount,
	SearchDoc,
	SearchIndexPayload,
	TaggedItem,
} from '~/lib/types';

/** Shared by document search and facet search, so both forgive typos alike. */
const FUZZY = 0.3;

/** MiniSearch config for the small tag/series indexes. */
const FACET_OPTIONS = {
	idField: 'slug',
	fields: ['label'],
	storeFields: ['label', 'slug', 'count'],
};

const CACHE_PREFIX = 'ellimist:search:';
const MAX_CACHE_BYTES = 2_000_000;

const OPTIONS = {
	idField: 'id',
	fields: ['title', 'description', 'tags', 'series', 'text'],
	storeFields: [
		'kind',
		'href',
		'title',
		'description',
		'tags',
		'tagSlugs',
		'series',
		'seriesSlug',
		'seriesPart',
		'dateLabel',
		'pubDate',
	],
};

export interface SearchHit extends TaggedItem {
	id: string;
	tagSlugs: string[];
}

export interface SearchEngine {
	mini: MiniSearch<SearchDoc>;
	tags: FacetCount[];
	series: FacetCount[];
	/** Small MiniSearch indexes over the facet labels, for the pickers. */
	tagIndex: MiniSearch<FacetCount>;
	seriesIndex: MiniSearch<FacetCount>;
	items: SearchHit[];
}

let enginePromise: Promise<SearchEngine> | null = null;

/**
 * Index facet labels so the pickers get the same fuzzy behaviour as document
 * search, from the same engine. Not cached — indexing a handful of short
 * labels is cheaper than serializing them.
 */
function buildFacetIndex(
	MiniSearchCtor: typeof MiniSearch,
	facets: FacetCount[],
): MiniSearch<FacetCount> {
	const index = new MiniSearchCtor<FacetCount>(FACET_OPTIONS as never);
	index.addAll(facets);
	return index;
}

/**
 * Fuzzy-match facet labels. An empty query returns the full list, so the
 * picker keeps its usage-count ordering until you type.
 */
export function searchFacets(
	index: MiniSearch<FacetCount>,
	facets: FacetCount[],
	query: string,
): FacetCount[] {
	const q = query.trim();
	if (!q) return facets;

	return index.search(q, { prefix: true, fuzzy: FUZZY }).map((hit) => ({
		label: hit.label as string,
		slug: hit.slug as string,
		count: hit.count as number,
	}));
}

function facetCounts(pairs: Iterable<[label: string, slug: string]>): FacetCount[] {
	const bySlug = new Map<string, FacetCount>();

	for (const [label, slug] of pairs) {
		if (!slug) continue;
		const existing = bySlug.get(slug);
		if (existing) existing.count += 1;
		else bySlug.set(slug, { label, slug, count: 1 });
	}

	return [...bySlug.values()].sort(
		(a, b) => b.count - a.count || a.label.localeCompare(b.label),
	);
}

function tagCountsFrom(docs: Pick<SearchDoc, 'tags' | 'tagSlugs'>[]): FacetCount[] {
	return facetCounts(
		docs.flatMap((doc) =>
			doc.tags.map((tag, i): [string, string] => [tag, doc.tagSlugs[i] ?? '']),
		),
	);
}

function seriesCountsFrom(
	docs: Pick<SearchDoc, 'series' | 'seriesSlug'>[],
): FacetCount[] {
	return facetCounts(
		docs
			.filter((doc) => doc.series && doc.seriesSlug)
			.map((doc): [string, string] => [doc.series!, doc.seriesSlug!]),
	);
}

function readCache(
	MiniSearchCtor: typeof MiniSearch,
	version: string,
): SearchEngine | null {
	try {
		const raw = localStorage.getItem(CACHE_PREFIX + version);
		if (!raw) return null;

		const { index, tags, series, items } = JSON.parse(raw) as {
			index: string;
			tags: FacetCount[];
			series: FacetCount[];
			items: SearchHit[];
		};
		const mini = MiniSearchCtor.loadJSON<SearchDoc>(index, OPTIONS as never);
		return {
			mini,
			tags,
			series,
			items,
			// Rebuilt rather than cached — indexing a handful of labels is
			// cheaper than serializing them.
			tagIndex: buildFacetIndex(MiniSearchCtor, tags),
			seriesIndex: buildFacetIndex(MiniSearchCtor, series),
		};
	} catch {
		return null;
	}
}

function writeCache(
	version: string,
	mini: MiniSearch<SearchDoc>,
	tags: FacetCount[],
	series: FacetCount[],
	items: SearchHit[],
) {
	try {
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const key = localStorage.key(i);
			if (key?.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + version) {
				localStorage.removeItem(key);
			}
		}

		const payload = JSON.stringify({
			index: JSON.stringify(mini),
			tags,
			series,
			items,
		});
		if (payload.length > MAX_CACHE_BYTES) return;
		localStorage.setItem(CACHE_PREFIX + version, payload);
	} catch (e) {
		console.error(e)
	}
}

export function loadSearch(version: string): Promise<SearchEngine> {
	if (enginePromise) return enginePromise;

	enginePromise = (async () => {
		const { default: MiniSearchCtor } = await import('minisearch');

		const cachedEngine = readCache(MiniSearchCtor, version);
		if (cachedEngine) return cachedEngine;

		const response = await fetch('/search-index.json');
		if (!response.ok) {
			throw new Error(`search index responded ${response.status}`);
		}
		const payload = (await response.json()) as SearchIndexPayload;

		const mini = new MiniSearchCtor<SearchDoc>(OPTIONS as never);
		mini.addAll(payload.docs);

		const tags = tagCountsFrom(payload.docs);
		const series = seriesCountsFrom(payload.docs);
		const items: SearchHit[] = payload.docs.map(({ text: _text, ...rest }) => rest);

		writeCache(payload.version, mini, tags, series, items);

		return {
			mini,
			tags,
			series,
			items,
			tagIndex: buildFacetIndex(MiniSearchCtor, tags),
			seriesIndex: buildFacetIndex(MiniSearchCtor, series),
		};
	})();

	enginePromise.catch(() => {
		enginePromise = null;
	});

	return enginePromise;
}

export function whenIdle(callback: () => void) {
	if ('requestIdleCallback' in window) {
		(
			window as unknown as { requestIdleCallback: (cb: () => void) => void }
		).requestIdleCallback(callback);
	} else {
		setTimeout(callback, 1200);
	}
}

export interface SearchFilters {
	tags?: string[];
	series?: string[];
}

export function runSearch(
	engine: SearchEngine,
	query: string,
	filters: SearchFilters = {},
	limit?: number,
): SearchHit[] {
	const trimmed = query.trim();
	const tags = filters.tags ?? [];
	const series = filters.series ?? [];

	const matches = (doc: { tagSlugs?: string[]; seriesSlug?: string }) => {
		if (tags.length > 0 && !tags.every((slug) => doc.tagSlugs?.includes(slug))) {
			return false;
		}
		if (series.length > 0 && !series.includes(doc.seriesSlug ?? '')) {
			return false;
		}
		return true;
	};

	let hits: SearchHit[] = trimmed
		? (engine.mini.search(trimmed, {
			prefix: true,
			// 0.2 missed ordinary typos ("lexng", "borow"); 0.4 matched nearly
			// every document. Measured against the real index.
			fuzzy: FUZZY,
			boost: { title: 4, tags: 3, series: 3, description: 2 },
			filter: matches as (result: SearchResult) => boolean,
		}) as unknown as SearchHit[])
		: engine.items.filter(matches);

	if (!trimmed && series.length === 1) {
		hits = [...hits].sort((a, b) => {
			const ap = a.seriesPart ?? Number.MAX_SAFE_INTEGER;
			const bp = b.seriesPart ?? Number.MAX_SAFE_INTEGER;
			return ap - bp || a.pubDate.localeCompare(b.pubDate);
		});
	}

	return limit ? hits.slice(0, limit) : hits;
}
