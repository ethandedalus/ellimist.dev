// Rehype plugin: turns ```diagram fences into containers the client script can
// render a Mermaid diagram into, instead of letting them reach the syntax
// highlighter.
//
// The trigger is deliberately *not* ```mermaid, so that a post about Mermaid can
// still show Mermaid source as an ordinary highlighted code block. A fence is
// used rather than a custom delimiter because fences are the only markdown
// construct whose content is guaranteed to survive parsing verbatim — anything
// else and `A[Label]`, `|edge|` and blank lines arrive here already rewritten
// into link references, table cells and separate paragraphs.
//
// It has to run before Expressive Code, which claims every fenced code block.
// Astro appends EC's rehype plugin after every plugin listed in the config's
// `rehypePlugins`, so listing this one there is enough.
//
// Fence options:
//
//   height=280          space reserved for the skeleton, in pixels
//   title="Good state"  header above the diagram, or the tab label when grouped
//   group="quorum"      adjacent diagrams sharing a name become one tab widget
//   border              force the frame on; `border=false` forces it off
//
// A trailing `--- … ---` block is a caption, the same syntax code blocks use.
//
// The diagram source ships inside the container. Rendering happens in the
// browser (see `src/components/MermaidDiagrams.astro`), so the markup here is a
// skeleton plus the source as a fallback for when scripting is unavailable.

import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import { visit } from 'unist-util-visit';

const LANGUAGE = 'language-diagram';
const DEFAULT_MIN_HEIGHT = 220;

const h = (tagName, properties, children = []) => ({
    type: 'element',
    tagName,
    properties,
    children,
});

/** @param {string} meta */
function parseMeta(meta) {
    /** @type {Record<string, string|boolean>} */
    const options = {};
    const pattern = /([a-zA-Z][\w-]*)(?:=(?:"([^"]*)"|(\S+)))?/g;
    let match;
    while ((match = pattern.exec(meta)) !== null) {
        const [, key, quoted, bare] = match;
        options[key] = quoted ?? bare ?? true;
    }
    return options;
}

/**
 * Splits a trailing `--- … ---` block off the end of the fence. Mermaid's own
 * frontmatter also uses `---`, but that sits at the top of a diagram, so only a
 * block that runs to the final line is treated as a caption.
 *
 * @param {string} text
 */
function splitCaption(text) {
    const lines = text.split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (!lines.length || lines[lines.length - 1].trim() !== '---') {
        return { code: text, caption: undefined };
    }

    for (let i = lines.length - 2; i >= 0; i--) {
        if (lines[i].trim() !== '---') continue;
        // A diagram consisting only of frontmatter has no caption.
        if (i === 0) break;
        return {
            code: lines.slice(0, i).join('\n'),
            caption: lines.slice(i + 1, lines.length - 1).join('\n'),
        };
    }

    return { code: text, caption: undefined };
}

/**
 * Renders caption markdown to hast children, unwrapping the lone paragraph the
 * usual one-line caption produces.
 *
 * @param {string} markdown
 */
function captionChildren(markdown) {
    const root = toHast(fromMarkdown(markdown));
    const children = root?.type === 'root' ? root.children : [];
    const elements = children.filter((child) => child.type !== 'text');
    if (elements.length === 1 && elements[0].tagName === 'p') {
        return elements[0].children;
    }
    return children;
}

/** @param {import('hast').Element} pre */
function readDiagram(pre) {
    const code = pre.children.find(
        (child) => child.type === 'element' && child.tagName === 'code',
    );
    if (!code) return undefined;

    const classes = code.properties?.className ?? [];
    const list = Array.isArray(classes) ? classes : [classes];
    if (!list.includes(LANGUAGE)) return undefined;

    let text = '';
    visit(code, 'text', (node) => {
        text += node.value;
    });

    // The meta string survives as `data.meta` or `properties.metastring`
    // depending on the pipeline; neither is guaranteed, so treat it as optional.
    const options = parseMeta(
        String(code.data?.meta ?? code.properties?.metastring ?? ''),
    );
    const { code: source, caption } = splitCaption(text.replace(/\n+$/, ''));

    return {
        code: source.replace(/\n+$/, ''),
        caption,
        title: typeof options.title === 'string' ? options.title : undefined,
        group: typeof options.group === 'string' ? options.group : undefined,
        border: options.border,
        minHeight: Number(options.height) || DEFAULT_MIN_HEIGHT,
    };
}

function buildFigure(diagram) {
    // A titled diagram reads as an unfinished frame without its border, and a
    // tabbed one always gets framed by the widget, so those are the defaults.
    // `border` / `border=false` overrides either way.
    const framed =
        diagram.border === undefined
            ? Boolean(diagram.title || diagram.group)
            : diagram.border !== 'false';

    const properties = {
        className: ['mermaid-figure'],
        'data-mermaid': '',
        style: `--mermaid-min-height:${diagram.minHeight}px`,
    };
    if (framed) properties['data-framed'] = '';
    if (diagram.group) properties['data-diagram-group'] = diagram.group;
    if (diagram.title) properties['data-diagram-title'] = diagram.title;

    return h('figure', properties, [
        // Shown only outside a tab widget; the tab already carries the title.
        ...(diagram.title
            ? [h('div', { className: ['diagram-title'] }, [
                  { type: 'text', value: diagram.title },
              ])]
            : []),
        h('div', { className: ['mermaid-skeleton'], 'aria-hidden': 'true' }),
        // Read by the client script, and the whole diagram when scripting is
        // off. Not `hidden`, so CSS decides.
        h('pre', { className: ['mermaid-source'] }, [
            { type: 'text', value: diagram.code },
        ]),
        h('div', { className: ['mermaid-output'] }),
        ...(diagram.caption
            ? [
                  h('figcaption', { className: ['mermaid-caption'] },
                      captionChildren(diagram.caption)),
              ]
            : []),
    ]);
}

const groupOf = (node) =>
    node?.type === 'element' && node.tagName === 'figure'
        ? node.properties?.['data-diagram-group']
        : undefined;

const isBlank = (node) => node.type === 'text' && !node.value.trim();

function buildTabs(group, figures, uid) {
    const tabs = [];
    const panels = [];

    figures.forEach((figure, i) => {
        const tabId = `diagram-tab-${uid}-${i}`;
        const panelId = `diagram-panel-${uid}-${i}`;
        const label = figure.properties['data-diagram-title'] ?? `Diagram ${i + 1}`;
        const active = i === 0;

        // The tab shows the title now, so the in-figure header is redundant.
        figure.children = figure.children.filter(
            (child) => child.properties?.className?.[0] !== 'diagram-title',
        );
        delete figure.properties['data-framed'];

        tabs.push(
            h('button', {
                type: 'button',
                id: tabId,
                role: 'tab',
                'aria-controls': panelId,
                'aria-selected': String(active),
                tabIndex: active ? 0 : -1,
            }, [{ type: 'text', value: String(label) }]),
        );

        panels.push(
            h('div', {
                id: panelId,
                className: ['diagram-tabpanel'],
                role: 'tabpanel',
                'aria-labelledby': tabId,
                hidden: !active,
            }, [figure]),
        );
    });

    return h('div', {
        className: ['diagram-tabs'],
        'data-diagram-group': group,
    }, [
        h('div', {
            className: ['diagram-tablist'],
            role: 'tablist',
            'aria-label': group,
        }, tabs),
        ...panels,
    ]);
}

export function rehypeMermaidBlocks() {
    /** @param {import('hast').Root} tree */
    return (tree) => {
        // Pass 1: every fence becomes a figure.
        visit(tree, 'element', (node, index, parent) => {
            if (node.tagName !== 'pre' || !parent || index === null) return;
            const diagram = readDiagram(node);
            if (!diagram) return;
            parent.children[index] = buildFigure(diagram);
            return index + 1;
        });

        // Pass 2: runs of adjacent figures sharing a group become one widget.
        // Whitespace between them is the only thing allowed in between, which is
        // what makes a paragraph end a run.
        let uid = 0;
        visit(tree, (node) => {
            if (!Array.isArray(node.children)) return;

            const out = [];
            let i = 0;
            while (i < node.children.length) {
                const child = node.children[i];
                const group = groupOf(child);
                if (!group) {
                    out.push(child);
                    i++;
                    continue;
                }

                const run = [child];
                let j = i + 1;
                while (j < node.children.length) {
                    const next = node.children[j];
                    if (isBlank(next)) {
                        j++;
                        continue;
                    }
                    if (groupOf(next) !== group) break;
                    run.push(next);
                    j++;
                }

                if (run.length < 2) {
                    out.push(child);
                    i++;
                    continue;
                }

                out.push(buildTabs(group, run, ++uid));
                i = j;
            }
            node.children = out;
        });
    };
}
