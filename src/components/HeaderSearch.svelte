<script lang="ts">
	import { Search } from '@lucide/svelte';
	import {
		loadSearch,
		runSearch,
		type SearchEngine,
		type SearchHit,
	} from '~/lib/search-client';
	import { cn } from '~/lib/utils';

	interface Props {
		/** Content hash, used as the localStorage cache key. */
		version: string;
	}

	let { version }: Props = $props();

	const MAX_RESULTS = 6;

	let query = $state('');
	let open = $state(false);
	let activeIndex = $state(0);
	let engine = $state<SearchEngine | null>(null);
	let failed = $state(false);
	let root = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);

	async function ensureLoaded() {
		if (engine || failed) return;
		try {
			engine = await loadSearch(version);
		} catch {
			failed = true;
		}
	}

	const results = $derived.by<SearchHit[]>(() =>
		engine && query.trim() ? runSearch(engine, query, {}, MAX_RESULTS) : [],
	);

	$effect(() => {
		if (activeIndex >= results.length) activeIndex = 0;
	});

	function go(item: SearchHit) {
		window.location.href = item.href;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			query = '';
			open = false;
			input?.blur();
			return;
		}

		if (results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = (activeIndex + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = (activeIndex - 1 + results.length) % results.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = results[activeIndex];
			if (target) go(target);
		}
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (root && !root.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<!--
	One input and one dropdown at every width. Mobile differs only in layout:
	the header stacks it onto its own full-width row (see Header.astro), so
	there is no second code path that can drift from this one.
-->
<div bind:this={root} class="relative w-full sm:max-w-xs">
	<Search
		class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 sm:size-3.5"
		aria-hidden="true"
	/>
	<input
		bind:this={input}
		type="search"
		bind:value={query}
		oninput={() => {
			open = true;
			void ensureLoaded();
		}}
		onfocus={() => {
			open = true;
			void ensureLoaded();
		}}
		onkeydown={onKeydown}
		placeholder="Search posts and notes…"
		aria-label="Search posts and notes"
		aria-expanded={open}
		aria-controls="header-search-results"
		role="combobox"
		autocomplete="off"
		class="bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border py-1 pr-2 pl-8 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] sm:h-8 sm:text-sm"
	/>

	{#if open}
		<div
			id="header-search-results"
			role="listbox"
			class="border-border bg-popover absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-md border shadow-lg"
		>
			{#if failed}
				<p class="text-muted-foreground px-3 py-2.5 text-sm">
					Search unavailable.
				</p>
			{:else if !query.trim()}
				<p class="text-muted-foreground px-3 py-2.5 text-sm">
					Search titles, tags, series, and article text.
				</p>
			{:else if !engine}
				<p class="text-muted-foreground px-3 py-2.5 text-sm">Loading…</p>
			{:else if results.length === 0}
				<p class="text-muted-foreground px-3 py-2.5 text-sm">
					No matches for “{query.trim()}”.
				</p>
			{:else}
				<ul>
					{#each results as item, i (item.id)}
						<li>
							<a
								href={item.href}
								role="option"
								aria-selected={i === activeIndex}
								onmouseenter={() => (activeIndex = i)}
								class={cn(
									'flex flex-col gap-0.5 px-3 py-2.5 transition-colors sm:py-2',
									i === activeIndex ? 'bg-accent' : '',
								)}
							>
								<span
									class={cn(
										'truncate text-sm font-medium transition-colors',
										i === activeIndex ? 'text-primary' : 'text-popover-foreground',
									)}
								>
									{item.title}
								</span>
								<span class="flex items-center gap-1.5">
									<span
										class={cn(
											'chip-kind',
											item.kind === 'blog' ? 'chip-kind-post' : 'chip-kind-note',
										)}
									>
										{item.kind === 'blog' ? 'post' : 'note'}
									</span>
									{#if item.draft}
										<span class="chip-kind chip-kind-draft">draft</span>
									{/if}
									<span
										class="text-muted-foreground font-mono text-[10px] tabular-nums"
									>
										{item.dateLabel}
									</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
