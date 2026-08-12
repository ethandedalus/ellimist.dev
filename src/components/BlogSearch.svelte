<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import FacetPicker from '~/components/FacetPicker.svelte';
	import Pagination from '~/lib/components/ui/pagination/pagination.svelte';
	import {
		loadSearch,
		runSearch,
		searchFacets,
		whenIdle,
		type SearchEngine,
		type SearchHit,
	} from '~/lib/search-client';
	import { cn } from '~/lib/utils';

	interface Props {
		/** Content hash, used as the localStorage cache key. */
		version: string;
		/** Results per page. Set in ~/consts, not by the reader. */
		pageSize: number;
	}

	let { version, pageSize }: Props = $props();

	let query = $state('');
	let selectedTags = $state<string[]>([]);
	let selectedSeries = $state<string[]>([]);
	let engine = $state<SearchEngine | null>(null);
	let failed = $state(false);
	let mounted = $state(false);

	const active = $derived(
		query.trim().length > 0 ||
			selectedTags.length > 0 ||
			selectedSeries.length > 0,
	);

	const results = $derived.by<SearchHit[]>(() =>
		engine
			? runSearch(engine, query, {
					tags: selectedTags,
					series: selectedSeries,
				})
			: [],
	);

	let page = $state(1);

	// Any change to the query or filters invalidates the current page.
	$effect(() => {
		void query;
		void selectedTags;
		void selectedSeries;
		page = 1;
	});

	const pageCount = $derived(Math.max(1, Math.ceil(results.length / pageSize)));

	const currentPage = $derived(Math.min(page, pageCount));

	const pageResults = $derived(
		results.slice((currentPage - 1) * pageSize, currentPage * pageSize),
	);

	async function ensureLoaded() {
		if (engine || failed) return;
		try {
			engine = await loadSearch(version);
		} catch {
			failed = true;
		}
	}

	/** `?tag=a,b` and `?tag=a&tag=b` both work. */
	function readParam(params: URLSearchParams, key: string): string[] {
		return params
			.getAll(key)
			.flatMap((value) => value.split(','))
			.filter(Boolean);
	}

	onMount(() => {
		// Read filters out of the URL so /blog?tag=rust lands pre-filtered.
		const params = new URLSearchParams(window.location.search);
		const urlTags = readParam(params, 'tag');
		const urlSeries = readParam(params, 'series');
		const q = params.get('q');

		if (urlTags.length > 0) selectedTags = urlTags;
		if (urlSeries.length > 0) selectedSeries = urlSeries;
		if (q) query = q;
		mounted = true;

		if (active) void ensureLoaded();
		// Otherwise warm during idle time — never on the critical path. This has
		// to go through `ensureLoaded` so the engine reaches component state;
		// warming only the module cache leaves the tag list empty.
		else whenIdle(() => void ensureLoaded());
	});

	// Mirror filters into the URL so a filtered view can be copied out of the
	// address bar. `replaceState` keeps the back button meaningful.
	$effect(() => {
		if (!mounted) return;

		const params = new URLSearchParams(window.location.search);
		if (selectedTags.length > 0) params.set('tag', selectedTags.join(','));
		else params.delete('tag');

		if (selectedSeries.length > 0)
			params.set('series', selectedSeries.join(','));
		else params.delete('series');

		const q = query.trim();
		if (q) params.set('q', q);
		else params.delete('q');

		const search = params.toString();
		window.history.replaceState(
			null,
			'',
			`${window.location.pathname}${search ? `?${search}` : ''}`,
		);
	});

	// The full listing is server-rendered by the page so it exists without JS
	// and for crawlers. Hand over once the index is ready. Until then, and if
	// loading fails, the server-rendered list stays on screen.
	$effect(() => {
		const listing = document.getElementById('blog-listing');
		if (listing) listing.hidden = engine !== null;
	});

	function clear() {
		query = '';
		selectedTags = [];
		selectedSeries = [];
	}

	function toggleTag(slug: string) {
		selectedTags = selectedTags.includes(slug)
			? selectedTags.filter((s) => s !== slug)
			: [...selectedTags, slug];
	}
</script>

<div class="flex flex-col gap-4">
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
			aria-hidden="true"
		/>
		<input
			type="search"
			bind:value={query}
			oninput={ensureLoaded}
			onfocus={ensureLoaded}
			placeholder="Search everything…"
			aria-label="Search posts and notes"
			class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring/50 h-10 w-full rounded-md border py-2 pr-3 pl-9 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
		/>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<FacetPicker
				label="Filter by tag"
				searchLabel="Find a tag…"
				facets={engine?.tags ?? []}
				search={engine
					? (q) => searchFacets(engine!.tagIndex, engine!.tags, q)
					: undefined}
				loading={!engine && !failed}
				selected={selectedTags}
				onopen={ensureLoaded}
				emptyText="No tags yet."
				onchange={(next) => {
					selectedTags = next;
					void ensureLoaded();
				}}
			/>

			<FacetPicker
				label="Filter by series"
				searchLabel="Find a series…"
				facets={engine?.series ?? []}
				search={engine
					? (q) => searchFacets(engine!.seriesIndex, engine!.series, q)
					: undefined}
				loading={!engine && !failed}
				selected={selectedSeries}
				onopen={ensureLoaded}
				emptyText="No series yet."
				onchange={(next) => {
					selectedSeries = next;
					void ensureLoaded();
				}}
			/>
		</div>

		{#if active}
			<button
				type="button"
				onclick={clear}
				class="text-muted-foreground hover:text-primary inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors"
			>
				<X class="size-3" aria-hidden="true" />
				Clear
			</button>
		{/if}
	</div>
</div>

{#if engine}
	<div id="blog-results" class="mt-8 scroll-mt-20">
		<p class="text-muted-foreground mb-4 text-sm" role="status" aria-live="polite">
			{results.length}
			{results.length === 1 ? 'entry' : 'entries'}
			{#if pageCount > 1}
				<span class="opacity-70">· page {currentPage} of {pageCount}</span>
			{/if}
		</p>

		{#if results.length === 0}
			<p class="text-muted-foreground text-sm">Nothing matches those filters.</p>
		{:else}
			<ul class="divide-border flex flex-col divide-y">
				{#each pageResults as item (item.id)}
						<li class="py-4">
							<a href={item.href} class="group flex flex-col gap-1">
								<span class="flex items-center gap-2">
									<span
										class={cn(
											'chip-kind',
											item.kind === 'blog' ? 'chip-kind-post' : 'chip-kind-note',
										)}
									>
										{item.kind === 'blog' ? 'post' : 'note'}
									</span>
									<span class="text-muted-foreground font-mono text-xs tabular-nums">
										{item.dateLabel}
									</span>
									{#if item.series}
										<span class="chip-series">
											<span class="series-name">{item.series}</span>
											{#if item.seriesPart}
												<span class="series-part">Part {item.seriesPart}</span>
											{/if}
										</span>
									{/if}
								</span>
								<span
									class="text-foreground group-hover:text-primary font-medium transition-colors"
								>
									{item.title}
								</span>
								{#if item.description}
									<span class="text-muted-foreground text-sm text-pretty">
										{item.description}
									</span>
								{/if}
							</a>

							{#if item.tags.length > 0}
								<ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
									{#each item.tags as tag, i (item.tagSlugs[i] ?? tag)}
										{@const slug = item.tagSlugs[i] ?? ''}
										<li>
											<button
												type="button"
												onclick={() => toggleTag(slug)}
												aria-pressed={selectedTags.includes(slug)}
												class="tag-link"
											>
												#{tag}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>

				{#if pageCount > 1}
					<Pagination
						count={results.length}
						perPage={pageSize}
						page={currentPage}
						onPageChange={(next) => {
							page = next;
							document
								.getElementById('blog-results')
								?.scrollIntoView({ behavior: 'smooth', block: 'start' });
						}}
						class="mt-8"
					/>
				{/if}
			{/if}
	</div>
{:else if failed}
	<p class="text-muted-foreground mt-8 text-sm">
		Search is unavailable right now — showing the full archive below.
	</p>
{/if}
