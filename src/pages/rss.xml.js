import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '~/consts';
import { isVisible } from '~/lib/types';

export async function GET(context) {
	const [posts, notes] = await Promise.all([
		getCollection('blog', isVisible),
		getCollection('notes', isVisible),
	]);

	const items = [
		...posts.map((post) => ({
			...post.data,
			description: post.data.description,
			link: `/blog/${post.id}/`,
		})),
		...notes.map((note) => ({
			...note.data,
			description: note.data.description ?? note.data.title,
			link: `/notes/${note.id}/`,
		})),
	].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items,
	});
}
