// Expressive Code plugin: turns consecutive code blocks sharing a `group="..."`
// meta option into a single tabbed widget.
//
//     ```rust group="ffi" tab="lib.rs"
//     ...
//     ```
//
//     ```c group="ffi" tab="header.h"
//     ...
//     ```
//
// Blocks must be adjacent siblings in the document — a paragraph between them
// starts a new group.
//
// `rehype-expressive-code` renders every fenced block on its own, so the engine
// never sees more than one block per "group" and `postprocessRenderedBlockGroup`
// can't merge them. This plugin therefore tags each rendered block with the
// group it belongs to and assembles the tab widget in the browser.

import {
    AttachedPluginData,
    PluginStyleSettings,
    definePlugin,
} from 'astro-expressive-code';

const tabsData = new AttachedPluginData(() => ({
    /** @type {string | undefined} */
    group: undefined,
    /** @type {string | undefined} */
    label: undefined,
    isGroupStart: false,
}));

// Blocks are preprocessed in document order, one file at a time, so tracking the
// previously seen block per source file is enough to tell whether the current
// block continues a run or starts one. Knowing this at build time lets the CSS
// below hide continuation blocks before the widget is assembled, which avoids a
// flash of stacked code blocks.
/** @type {Map<string, { group: string | undefined, index: number }>} */
const lastBlockPerFile = new Map();

/**
 * @param {import('astro-expressive-code').ExpressiveCodeBlock} codeBlock
 * @param {string | undefined} group
 * @returns {boolean} whether this block starts a new run
 */
function startsNewRun(codeBlock, group) {
    const parent = codeBlock.parentDocument;
    const position = parent?.positionInDocument;
    if (!position) return true;

    const key = parent?.sourceFilePath ?? '';
    const previous = lastBlockPerFile.get(key);
    const continuesRun =
        group !== undefined &&
        previous !== undefined &&
        previous.group === group &&
        previous.index === position.groupIndex - 1;

    if (
        position.totalGroups !== undefined &&
        position.groupIndex === position.totalGroups - 1
    ) {
        lastBlockPerFile.delete(key);
    } else {
        lastBlockPerFile.set(key, { group, index: position.groupIndex });
    }

    return !continuesRun;
}

const codeTabsStyleSettings = new PluginStyleSettings({
    defaultValues: {
        codeTabs: {
            barBackground: ({ theme }) =>
                theme.colors['editorGroupHeader.tabsBackground'] ||
                theme.colors['editor.background'],
            barBorderColor: ({ resolveSetting }) =>
                resolveSetting('borderColor'),
            // Matching the code background makes the active tab read as part
            // of the panel below it; `tab.activeBackground` often doesn't.
            activeTabBackground: ({ resolveSetting }) =>
                resolveSetting('codeBackground'),
            activeTabForeground: ({ theme }) =>
                theme.colors['tab.activeForeground'] ||
                theme.colors['editor.foreground'],
            activeTabIndicatorColor: ({ theme }) =>
                theme.colors['tab.activeBorderTop'] ||
                theme.colors['tab.activeBorder'] ||
                theme.colors['focusBorder'],
            inactiveTabBackground: ({ resolveSetting }) =>
                resolveSetting('codeTabs.barBackground'),
            inactiveTabForeground: ({ theme }) =>
                theme.colors['tab.inactiveForeground'] ||
                theme.colors['editor.foreground'],
            indicatorHeight: ({ resolveSetting }) =>
                resolveSetting('borderWidth'),
        },
    },
    preventUnitlessValues: ['codeTabs.indicatorHeight'],
});

/** @param {import('astro-expressive-code').ResolverContext} context */
function getBaseStyles({ cssVar }) {
    return `
		/* Until the widget is built, only the first block of a run is shown.
		   Gated on scripting so the blocks stay readable without JS. */
		@media (scripting: enabled) {
			&[data-ec-group]:not([data-ec-group-start]) {
				display: none;
			}
		}

		/* The widget carries the \`expressive-code\` class itself. That is what
		   makes it follow the active theme: the engine scopes every alternate
		   theme's CSS variables to \`.expressive-code\` elements, so anything
		   outside one is stuck with the base theme's values. */
		&.ec-tabs {
			--ec-tabs-radius: ${cssVar('borderRadius')};
			margin-block: 1.5rem;

			.ec-tabs-list {
				display: flex;
				overflow-x: auto;
				scrollbar-width: none;
				background: ${cssVar('codeTabs.barBackground')};
				border: ${cssVar('borderWidth')} solid ${cssVar('codeTabs.barBorderColor')};
				border-bottom: none;
				border-start-start-radius: var(--ec-tabs-radius);
				border-start-end-radius: var(--ec-tabs-radius);
			}

			.ec-tabs-list::-webkit-scrollbar {
				display: none;
			}

			.ec-tabs-list > button {
				flex: none;
				margin: 0;
				appearance: none;
				border: none;
				border-top: ${cssVar('codeTabs.indicatorHeight')} solid transparent;
				cursor: pointer;
				white-space: nowrap;
				font-family: ${cssVar('uiFontFamily')};
				font-size: ${cssVar('uiFontSize')};
				line-height: ${cssVar('uiLineHeight')};
				padding: ${cssVar('uiPaddingBlock')} ${cssVar('uiPaddingInline')};
				background: ${cssVar('codeTabs.inactiveTabBackground')};
				color: ${cssVar('codeTabs.inactiveTabForeground')};
			}

			.ec-tabs-list > button[aria-selected='true'] {
				background: ${cssVar('codeTabs.activeTabBackground')};
				color: ${cssVar('codeTabs.activeTabForeground')};
				border-top-color: ${cssVar('codeTabs.activeTabIndicatorColor')};
			}

			.ec-tabs-list > button:focus-visible {
				outline: 2px solid ${cssVar('focusBorder')};
				outline-offset: -3px;
			}

			.ec-tabs-panel > .expressive-code {
				margin: 0;
			}

			.ec-tabs-panel > .expressive-code > .frame,
			.ec-tabs-panel > .expressive-code > .frame > pre {
				border-start-start-radius: 0;
				border-start-end-radius: 0;
			}
		}
	`;
}

/** @param {boolean} syncTabs */
function getJsModule(syncTabs) {
    return `
const syncTabs = ${syncTabs};

/** @type {Map<string, Set<{ labels: string[], select: (index: number, focus?: boolean) => void }>>} */
const groups = new Map();
let uid = 0;

function build(startBlock) {
	const name = startBlock.getAttribute('data-ec-group');
	if (!name) return;

	const blocks = [startBlock];
	let next = startBlock.nextElementSibling;
	while (
		next &&
		next.classList.contains('expressive-code') &&
		next.getAttribute('data-ec-group') === name &&
		!next.hasAttribute('data-ec-group-start')
	) {
		blocks.push(next);
		next = next.nextElementSibling;
	}

	// Dropping the markers reveals the blocks again and makes re-runs no-ops.
	for (const block of blocks) {
		block.removeAttribute('data-ec-group');
		block.removeAttribute('data-ec-group-start');
	}
	if (blocks.length < 2) return;

	const id = ++uid;
	// \`expressive-code\` on the wrapper is load-bearing: it puts the widget
	// inside the scope the engine declares its theme variables in.
	const wrapper = document.createElement('div');
	wrapper.className = 'expressive-code ec-tabs';
	wrapper.setAttribute('data-ec-tabs-group', name);
	startBlock.parentNode.insertBefore(wrapper, startBlock);

	const tablist = document.createElement('div');
	tablist.className = 'ec-tabs-list';
	tablist.setAttribute('role', 'tablist');
	tablist.setAttribute('aria-label', name);
	wrapper.appendChild(tablist);

	const tabs = [];
	const panels = [];

	blocks.forEach((block, i) => {
		const tabId = 'ec-tab-' + id + '-' + i;
		const panelId = 'ec-panel-' + id + '-' + i;

		const tab = document.createElement('button');
		tab.type = 'button';
		tab.id = tabId;
		tab.setAttribute('role', 'tab');
		tab.setAttribute('aria-controls', panelId);
		tab.textContent = block.getAttribute('data-ec-tab') || 'Code';
		tablist.appendChild(tab);

		const panel = document.createElement('div');
		panel.id = panelId;
		panel.className = 'ec-tabs-panel';
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tabId);
		panel.appendChild(block);
		wrapper.appendChild(panel);

		tabs.push(tab);
		panels.push(panel);
	});

	const select = (index, focus) => {
		tabs.forEach((tab, i) => {
			const active = i === index;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
			panels[i].hidden = !active;
		});
		if (focus) tabs[index].focus();
	};

	const controller = { labels: tabs.map((tab) => tab.textContent), select };
	if (!groups.has(name)) groups.set(name, new Set());
	groups.get(name).add(controller);

	// Selecting a tab moves every other group with the same name to the tab
	// carrying the same label, so e.g. a package-manager choice sticks.
	const selectAndSync = (index, focus) => {
		select(index, focus);
		if (!syncTabs) return;
		const label = controller.labels[index];
		for (const other of groups.get(name)) {
			if (other === controller) continue;
			const match = other.labels.indexOf(label);
			if (match >= 0) other.select(match, false);
		}
	};

	tablist.addEventListener('click', (event) => {
		const tab = event.target.closest('[role="tab"]');
		const index = tabs.indexOf(tab);
		if (index >= 0) selectAndSync(index);
	});

	tablist.addEventListener('keydown', (event) => {
		const current = tabs.findIndex((tab) => tab.tabIndex === 0);
		let index = -1;
		if (event.key === 'ArrowRight') index = (current + 1) % tabs.length;
		else if (event.key === 'ArrowLeft') index = (current - 1 + tabs.length) % tabs.length;
		else if (event.key === 'Home') index = 0;
		else if (event.key === 'End') index = tabs.length - 1;
		if (index < 0) return;
		event.preventDefault();
		selectAndSync(index, true);
	});

	select(0);
}

function init() {
	document
		.querySelectorAll('.expressive-code[data-ec-group-start]')
		.forEach(build);
}

init();
document.addEventListener('astro:before-swap', () => groups.clear());
document.addEventListener('astro:page-load', init);
	`;
}

/**
 * @param {{ syncTabs?: boolean }} [options]
 * `syncTabs` (default `true`) keeps groups that share a name and a tab label
 * on the same tab.
 */
export function pluginCodeTabs(options = {}) {
    const { syncTabs = true } = options;

    return definePlugin({
        name: 'Code Tabs',
        styleSettings: codeTabsStyleSettings,
        baseStyles: getBaseStyles,
        jsModules: [getJsModule(syncTabs)],
        hooks: {
            preprocessMetadata: ({ codeBlock }) => {
                const { metaOptions, props } = codeBlock;
                const group = metaOptions.getString('group');

                if (group === undefined) {
                    startsNewRun(codeBlock, undefined);
                    return;
                }

                const data = tabsData.getOrCreateFor(codeBlock);
                data.group = group;
                data.label =
                    metaOptions.getString('tab') ??
                    metaOptions.getString('title') ??
                    codeBlock.language ??
                    'Code';
                data.isGroupStart = startsNewRun(codeBlock, group);

                // The tab already names the block, so the frame header would
                // just repeat it — unless the author asked for a frame.
                if (metaOptions.getString('frame') === undefined) {
                    props.frame = 'none';
                }
            },

            postprocessRenderedBlockGroup: ({
                renderedGroupContents,
                renderData,
            }) => {
                if (renderedGroupContents.length !== 1) return;
                const data = tabsData.getOrCreateFor(
                    renderedGroupContents[0].codeBlock,
                );
                if (!data.group) return;

                const { groupAst } = renderData;
                groupAst.properties = groupAst.properties ?? {};
                groupAst.properties['data-ec-group'] = data.group;
                groupAst.properties['data-ec-tab'] = data.label;
                if (data.isGroupStart) {
                    groupAst.properties['data-ec-group-start'] = '';
                }
            },
        },
    });
}
