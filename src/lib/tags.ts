// Server-only: this imports `astro:content`. Islands must import types and
// `tagSlug` from `~/lib/types` instead, never from here.
import { getCollection } from 'astro:content';
import { tagSlug, type TaggedItem } from '~/lib/types';

export { tagSlug, type TaggedItem };

function formatDate(date: Date): string {
	return date.toLocaleDateString('en-us', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Every published post and note, newest first. Metadata only — the full-text
 * documents live in `~/lib/search-index`. Used for the server-rendered
 * listing, so the archive exists without JavaScript.
 */
export async function getTaggedItems(): Promise<TaggedItem[]> {
	const [posts, notes] = await Promise.all([
		getCollection('blog', ({ data }) => !data.draft),
		getCollection('notes', ({ data }) => !data.draft),
	]);

	const items: TaggedItem[] = [
		...posts.map((post) => ({
			kind: 'blog' as const,
			href: `/blog/${post.id}/`,
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate.toISOString(),
			dateLabel: formatDate(post.data.pubDate),
			tags: post.data.tags,
			series: post.data.series,
			seriesSlug: post.data.series ? tagSlug(post.data.series) : undefined,
			seriesPart: post.data.seriesPart,
		})),
		...notes.map((note) => ({
			kind: 'notes' as const,
			href: `/notes/${note.id}/`,
			title: note.data.title,
			description: note.data.description,
			pubDate: note.data.pubDate.toISOString(),
			dateLabel: formatDate(note.data.pubDate),
			tags: note.data.tags,
		})),
	];

	return items.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}
