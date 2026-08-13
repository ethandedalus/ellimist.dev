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
}));

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
		/* Until the widget is built, only the first block of a run is shown, so
		   the page doesn't flash a stack of blocks. CSS can't compare the group
		   names, so two adjacent blocks from *different* groups also collapse
		   here; the script sorts that out as soon as it runs. Gated on scripting
		   so the blocks stay readable without JS. */
		@media (scripting: enabled) {
			&[data-ec-group] + &[data-ec-group] {
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

			/* The widget takes the column's width and never more, whatever it
			   contains. Every box below states \`min-width: 0\` so that neither a
			   long tab row nor a long line of code can establish a content-based
			   floor — an ancestor only has to be a flex or grid container for
			   the default \`min-width: auto\` to widen the page instead. */
			width: 100%;
			max-width: 100%;
			min-width: 0;

			.ec-tabs-list {
				display: flex;
				min-width: 0;
				max-width: 100%;
				overflow-x: auto;
				overscroll-behavior-x: contain;
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
				display: flex;
				align-items: center;
				gap: 0.45em;
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

			.ec-tabs-panel {
				min-width: 0;
				max-width: 100%;
			}

			.ec-tabs-panel > .expressive-code {
				margin: 0;
				min-width: 0;
				max-width: 100%;
			}

			.ec-tabs-panel > .expressive-code > .frame {
				min-width: 0;
				max-width: 100%;
			}

			/* Overflowing code scrolls within the block, as it does outside a
			   tab group. Without this the frame is sized by its longest line. */
			.ec-tabs-panel > .expressive-code > .frame > pre {
				min-width: 0;
				max-width: 100%;
				overflow-x: auto;
			}

			.ec-tabs-panel > .expressive-code > .frame,
			.ec-tabs-panel > .expressive-code > .frame > pre {
				border-start-start-radius: 0;
				border-start-end-radius: 0;
			}

			/* Narrow screens fit more tabs before scrolling is needed. */
			@media (max-width: 30rem) {
				.ec-tabs-list > button {
					padding-inline: calc(${cssVar('uiPaddingInline')} * 0.55);
					font-size: calc(${cssVar('uiFontSize')} * 0.9);
				}
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

// The block's frame header already holds the label as other plugins left it —
// a file icon next to the text, for instance — so the tab takes those nodes
// rather than rebuilding the label from the raw string. Anything else the
// header held moves onto the frame, which is where plugins put such controls
// on an untitled block.
function fillTab(tab, block) {
	const frame = block.querySelector('.frame');
	const header = frame && frame.querySelector(':scope > figcaption.header');
	const title = header && header.querySelector('.title');

	if (title) {
		tab.replaceChildren(...title.childNodes);
		title.remove();
		frame.append(...header.children);
		header.remove();
		frame.classList.remove('has-title');
	} else {
		tab.textContent = block.getAttribute('data-ec-tab') || 'Code';
	}

	// Lets stylesheets reach the tab by language, e.g. to recolor an icon that
	// is unreadable on one of the themes.
	const pre = block.querySelector('pre[data-language]');
	if (pre) tab.setAttribute('data-language', pre.getAttribute('data-language'));
}

function build(startBlock, name) {
	const blocks = [startBlock];
	let next = startBlock.nextElementSibling;
	while (next && next.getAttribute('data-ec-group') === name) {
		blocks.push(next);
		next = next.nextElementSibling;
	}

	// Dropping the marker reveals the blocks again and makes re-runs no-ops.
	for (const block of blocks) block.removeAttribute('data-ec-group');
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
		fillTab(tab, block);
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

	// Scrolls the tab row, never the page — \`scrollIntoView\` would move the
	// document when a synced group is selected further down the article.
	const revealTab = (tab) => {
		const start = tab.offsetLeft;
		const end = start + tab.offsetWidth;
		if (start < tablist.scrollLeft) {
			tablist.scrollLeft = start;
		} else if (end > tablist.scrollLeft + tablist.clientWidth) {
			tablist.scrollLeft = end - tablist.clientWidth;
		}
	};

	const select = (index, focus) => {
		tabs.forEach((tab, i) => {
			const active = i === index;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
			panels[i].hidden = !active;
		});
		revealTab(tabs[index]);
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

// A run is a maximal set of adjacent siblings sharing a group name, so a block
// starts one unless the element right before it is in the same group. Blocks
// already pulled into a widget have lost the attribute and are skipped.
function init() {
	for (const block of document.querySelectorAll('.expressive-code[data-ec-group]')) {
		const name = block.getAttribute('data-ec-group');
		if (!name) continue;
		const previous = block.previousElementSibling;
		if (previous && previous.getAttribute('data-ec-group') === name) continue;
		build(block, name);
	}
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

				if (group === undefined) return;

				const data = tabsData.getOrCreateFor(codeBlock);
				data.group = group;
				data.label =
					metaOptions.getString('tab') ??
					metaOptions.getString('title') ??
					codeBlock.language ??
					'Code';

				// Give the block a title even when the author didn't ask for
				// one. The title is the hook other plugins decorate — the file
				// icons plugin only touches titled, non-terminal frames — and
				// the script lifts the rendered title into the tab, so the
				// header itself never reaches the page.
				props.title = props.title ?? data.label;
				if (metaOptions.getString('frame') === undefined) {
					props.frame = 'code';
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
			},
		},
	});
}
