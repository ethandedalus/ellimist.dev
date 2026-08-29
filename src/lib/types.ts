// Client-safe. Must not import `astro:content` or anything server-only —
// Svelte islands import from here, and a server-only import in this module
// graph stops them hydrating in the browser.

/**
 * Drafts are listed while developing and never in a production build, so
 * unfinished work is reachable locally without leaking into the deployed site.
 */
export const SHOW_DRAFTS = import.meta.env.DEV;

/** Collection filter matching everything that should be visible right now. */
export function isVisible({ data }: { data: { draft?: boolean } }): boolean {
	return SHOW_DRAFTS || !data.draft;
}

/** A post or note, flattened so both collections can be listed together. */
export interface TaggedItem {
	kind: 'blog' | 'notes';
	href: string;
	title: string;
	description?: string;
	/** ISO string, so this survives serialization into a client island. */
	pubDate: string;
	/** Preformatted for display — islands shouldn't re-derive locale formatting. */
	dateLabel: string;
	tags: string[];
	/** Posts only. Notes are never part of a series. */
	series?: string;
	seriesSlug?: string;
	/** Position within the series. Only set alongside `series`. */
	seriesPart?: number;
	/** Only ever true in development — production builds exclude drafts. */
	draft?: boolean;
}

/** A filterable value with its usage count. Used for both tags and series. */
export interface FacetCount {
	label: string;
	slug: string;
	count: number;
}

/**
 * A `TaggedItem` plus the article's body text. Only ever delivered over the
 * lazily-fetched /search-index.json — never inlined into page HTML, since the
 * body text is by far the largest part of the payload.
 */
export interface SearchDoc extends TaggedItem {
	/** Stable id for MiniSearch. */
	id: string;
	/** Tag slugs, precomputed so the client doesn't re-derive them. */
	tagSlugs: string[];
	/** Body, reduced to plain text. */
	text: string;
}

/** Shape of the /search-index.json payload. */
export interface SearchIndexPayload {
	/** Changes whenever content changes; used as the localStorage cache key. */
	version: string;
	docs: SearchDoc[];
}

/**
 * URL-safe form of a tag or series name. `C++` and `c++` collapse to the same
 * slug, as do `My Series` and `my series`.
 */
export function tagSlug(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
