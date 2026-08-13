// Rehype plugin: keeps the section number readable in a heading's fragment.
//
// github-slugger drops the dot in a numbered heading, so "2.1. Private Service
// Access" becomes `#21-private-service-access` — indistinguishable from a
// twenty-first section. This maps a dot between digits to an underscore first,
// giving `#2_1-private-service-access`.
//
// It has to run before `rehypeHeadingIds` from `@astrojs/markdown-remark`, which
// Astro appends after every user rehype plugin. That plugin leaves an existing
// `id` alone and records whatever it finds, so `getHeadings()` keeps matching
// the anchors on the page.

import GithubSlugger from 'github-slugger';
import { visit } from 'unist-util-visit';

const HEADING = /^h[1-6]$/;

/** @param {import('hast').Element} node */
function textOf(node) {
    let text = '';
    visit(node, (child) => {
        if (child.type === 'text' || child.type === 'raw') text += child.value;
    });
    return text;
}

export function rehypeHeadingSlugs() {
    /** @param {import('hast').Root} tree */
    return (tree) => {
        // Per file, so repeated headings within one document are numbered the
        // same way github-slugger would number them.
        const slugger = new GithubSlugger();

        visit(tree, 'element', (node) => {
            if (!HEADING.test(node.tagName)) return;

            node.properties ??= {};
            // An id written by hand in the source wins.
            if (typeof node.properties.id === 'string') return;

            node.properties.id = slugger.slug(
                textOf(node).replace(/(\d)\.(?=\d)/g, '$1_'),
            );
        });
    };
}
