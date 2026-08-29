// Server-only: imports `astro:content`. Never import this from a Svelte island.
import { createHash } from 'node:crypto';
import { getCollection } from 'astro:content';
import { tagSlug, type SearchDoc, type SearchIndexPayload, isVisible } from '~/lib/types';

/** Cap per document, so one long article can't dominate the index payload. */
const MAX_TEXT_LENGTH = 8000;

/**
 * Make mdx indexable 
 */
function toPlainText(source: string): string {
	return source
		// MDX imports/exports
		.replace(/^\s*(import|export)\s+.*$/gm, ' ')
		// Fence markers and their language/meta, keeping the code itself
		.replace(/^```[^\n]*$/gm, ' ')
		// JSX/HTML tags
		.replace(/<\/?[A-Za-z][^>]*>/g, ' ')
		// Images, then links (keep the link text)
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		// Display and inline math
		.replace(/\$\$[\s\S]*?\$\$/g, ' ')
		.replace(/\$[^$\n]*\$/g, ' ')
		// Leftover Markdown punctuation
		.replace(/[#>*_`~|-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_TEXT_LENGTH);
}

function formatDate(date: Date): string {
	return date.toLocaleDateString('en-us', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

let cached: SearchIndexPayload | null = null;

/** Full-text documents for every published post and note. Memoized per build. */
export async function getSearchIndex(): Promise<SearchIndexPayload> {
	if (cached) return cached;

	const [posts, notes] = await Promise.all([
		getCollection('blog', isVisible),
		getCollection('notes', isVisible),
	]);

	const docs: SearchDoc[] = [
		...posts.map((post) => ({
			id: `blog:${post.id}`,
			kind: 'blog' as const,
			href: `/blog/${post.id}/`,
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate.toISOString(),
			dateLabel: formatDate(post.data.pubDate),
			tags: post.data.tags,
			tagSlugs: post.data.tags.map(tagSlug),
			series: post.data.series,
			seriesSlug: post.data.series ? tagSlug(post.data.series) : undefined,
			seriesPart: post.data.seriesPart,
			draft: post.data.draft,
			text: toPlainText(post.body ?? ''),
		})),
		...notes.map((note) => ({
			id: `notes:${note.id}`,
			kind: 'notes' as const,
			href: `/notes/${note.id}/`,
			title: note.data.title,
			description: note.data.description,
			pubDate: note.data.pubDate.toISOString(),
			dateLabel: formatDate(note.data.pubDate),
			draft: note.data.draft,
			tags: note.data.tags,
			tagSlugs: note.data.tags.map(tagSlug),
			text: toPlainText(note.body ?? ''),
		})),
	].sort((a, b) => b.pubDate.localeCompare(a.pubDate));

	const version = createHash('sha256')
		.update(JSON.stringify(docs))
		.digest('hex')
		.slice(0, 12);

	cached = { version, docs };
	return cached;
}

export async function getSearchIndexVersion(): Promise<string> {
	return (await getSearchIndex()).version;
}
