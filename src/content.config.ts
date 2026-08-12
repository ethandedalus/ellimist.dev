import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Long-form articles. These get a hero image, a description, and full
// prose styling.
const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z
			.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			tags: z.array(z.string()).default([]),
			// Optional. Posts sharing a series name are grouped together and can
			// be filtered as a set. Notes deliberately have no equivalent.
			series: z.string().optional(),
			// Position within the series. Only meaningful alongside `series`.
			seriesPart: z.number().int().positive().optional(),
			draft: z.boolean().default(false),
		})
			.refine((data) => !data.seriesPart || data.series, {
				message: '`seriesPart` requires `series` to be set',
				path: ['seriesPart'],
			}),
});

// Short, one-off notes. Deliberately lighter than `blog`: no hero image and
// no required description, so a note can be a title and a paragraph.
const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			description: z.string().optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
		}),
});

export const collections = { blog, notes };
