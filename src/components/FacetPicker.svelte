<script lang="ts">
	import { Check, Plus, Search, X } from '@lucide/svelte';
	import type { FacetCount } from '~/lib/types';
	import { cn } from '~/lib/utils';

	interface Props {
		/** Trigger text, e.g. "Filter by tag". */
		label: string;
		/** Placeholder for the in-panel filter, e.g. "Find a tag…". */
		searchLabel: string;
		facets: FacetCount[];
		selected: string[];
		onchange: (next: string[]) => void;
		/**
		 * Fuzzy matcher supplied by the caller, backed by MiniSearch. Falls back
		 * to substring matching before the search index has loaded.
		 */
		search?: (query: string) => FacetCount[];
		/** Called when the panel opens, so the caller can load data on demand. */
		onopen?: () => void;
		/** True while the list is still being fetched. */
		loading?: boolean;
		emptyText?: string;
	}

	let {
		label,
		searchLabel,
		facets,
		selected,
		onchange,
		search,
		onopen,
		loading = false,
		emptyText = 'Nothing to filter by.',
	}: Props = $props();

	const VISIBLE_LIMIT = 200;

	let open = $state(false);
	let filter = $state('');
	let root = $state<HTMLElement | null>(null);
	let filterInput = $state<HTMLInputElement | null>(null);

	const matching = $derived.by(() => {
		const q = filter.trim();
		if (!q) return facets.slice(0, VISIBLE_LIMIT);

		const pool = search
			? search(q)
			: facets.filter((f) => f.label.toLowerCase().includes(q.toLowerCase()));
		return pool.slice(0, VISIBLE_LIMIT);
	});

	const selectedFacets = $derived(
		selected
			.map((slug) => facets.find((f) => f.slug === slug))
			.filter((f): f is FacetCount => f !== undefined),
	);

	function toggle(slug: string) {
		onchange(
			selected.includes(slug)
				? selected.filter((s) => s !== slug)
				: [...selected, slug],
		);
	}

	function openPanel() {
		open = true;
		onopen?.();
		queueMicrotask(() => filterInput?.focus());
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (root && !root.contains(event.target as Node)) open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			open = false;
			filter = '';
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="flex flex-wrap items-center gap-2">
	<div bind:this={root} class="relative">
		<button
			type="button"
			onclick={() => (open ? (open = false) : openPanel())}
			onkeydown={onKeydown}
			aria-expanded={open}
			aria-haspopup="listbox"
			class={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
				open
					? 'border-primary text-primary'
					: 'border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary',
			)}
		>
			<Plus class="size-3" aria-hidden="true" />
			{label}
			{#if facets.length > 0}
				<span class="opacity-60 tabular-nums">{facets.length}</span>
			{/if}
		</button>

		{#if open}
			<div
				class="border-border bg-popover absolute top-full left-0 z-50 mt-2 w-64 overflow-hidden rounded-md border shadow-lg"
			>
				<div class="border-border relative border-b">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
						aria-hidden="true"
					/>
					<input
						bind:this={filterInput}
						bind:value={filter}
						onkeydown={onKeydown}
						type="text"
						placeholder={searchLabel}
						aria-label={searchLabel}
						class="placeholder:text-muted-foreground h-9 w-full bg-transparent py-1 pr-2 pl-8 text-sm outline-none"
					/>
				</div>

				<ul
					role="listbox"
					aria-multiselectable="true"
					class="max-h-56 overflow-y-auto py-1"
				>
					{#each matching as facet (facet.slug)}
						{@const active = selected.includes(facet.slug)}
						<li>
							<button
								type="button"
								role="option"
								aria-selected={active}
								onclick={() => toggle(facet.slug)}
								class="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
							>
								<Check
									class={cn(
										'size-3.5 shrink-0',
										active ? 'text-primary' : 'opacity-0',
									)}
									aria-hidden="true"
								/>
								<span class="text-popover-foreground flex-1 truncate">
									{facet.label}
								</span>
								<span class="text-muted-foreground text-xs tabular-nums">
									{facet.count}
								</span>
							</button>
						</li>
					{/each}

					{#if matching.length === 0}
						<li class="text-muted-foreground px-3 py-2 text-sm">
							{loading
								? 'Loading…'
								: filter.trim()
									? 'No matches.'
									: emptyText}
						</li>
					{/if}
				</ul>

				{#if facets.length > VISIBLE_LIMIT && !filter.trim()}
					<p
						class="border-border text-muted-foreground border-t px-3 py-1.5 text-xs"
					>
						Showing {VISIBLE_LIMIT} of {facets.length} — type to narrow.
					</p>
				{/if}
			</div>
		{/if}
	</div>

	{#each selectedFacets as facet (facet.slug)}
		<button
			type="button"
			onclick={() => toggle(facet.slug)}
			aria-label={`Remove ${facet.label} filter`}
			class="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full border border-transparent px-3 py-1 text-xs font-medium transition-opacity hover:opacity-85"
		>
			{facet.label}
			<X class="size-3" aria-hidden="true" />
		</button>
	{/each}
</div>
