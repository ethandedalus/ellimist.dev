<script lang="ts">
	import { buildPages } from './pages';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { buttonVariants } from '~/lib/components/ui/button';
	import { cn } from '~/lib/utils';

	interface Props {
		/** Total number of items across all pages. */
		count: number;
		perPage: number;
		page: number;
		siblingCount?: number;
		onPageChange: (page: number) => void;
		class?: string;
	}

	let {
		count,
		perPage,
		page,
		siblingCount = 1,
		onPageChange,
		class: className,
	}: Props = $props();

	const pageCount = $derived(Math.max(1, Math.ceil(count / perPage)));
	const pages = $derived(buildPages(page, pageCount, siblingCount));

	const canPrev = $derived(page > 1);
	const canNext = $derived(page < pageCount);

	function goto(next: number) {
		const clamped = Math.min(Math.max(next, 1), pageCount);
		if (clamped !== page) onPageChange(clamped);
	}
</script>

<nav
	role="navigation"
	aria-label="pagination"
	data-slot="pagination"
	class={cn('mx-auto flex w-full justify-center', className)}
>
	<ul data-slot="pagination-content" class="flex flex-row items-center gap-1">
		<li data-slot="pagination-item">
			<button
				type="button"
				aria-label="Go to previous page"
				disabled={!canPrev}
				onclick={() => goto(page - 1)}
				class={buttonVariants({
					size: 'default',
					variant: 'ghost',
					class: 'gap-1 px-2.5 sm:ps-2.5',
				})}
			>
				<ChevronLeftIcon />
				<span class="hidden sm:block">Previous</span>
			</button>
		</li>

		{#each pages as item (item.key)}
			<li data-slot="pagination-item">
				{#if item.type === 'ellipsis'}
					<span
						aria-hidden="true"
						data-slot="pagination-ellipsis"
						class="flex size-9 items-center justify-center"
					>
						<EllipsisIcon class="size-4" />
						<span class="sr-only">More pages</span>
					</span>
				{:else}
					<button
						type="button"
						aria-label={`Go to page ${item.value}`}
						aria-current={item.value === page ? 'page' : undefined}
						data-slot="pagination-link"
						data-active={item.value === page}
						onclick={() => goto(item.value)}
						class={buttonVariants({
							variant: item.value === page ? 'outline' : 'ghost',
							size: 'icon',
						})}
					>
						{item.value}
					</button>
				{/if}
			</li>
		{/each}

		<li data-slot="pagination-item">
			<button
				type="button"
				aria-label="Go to next page"
				disabled={!canNext}
				onclick={() => goto(page + 1)}
				class={buttonVariants({
					size: 'default',
					variant: 'ghost',
					class: 'gap-1 px-2.5 sm:pe-2.5',
				})}
			>
				<span class="hidden sm:block">Next</span>
				<ChevronRightIcon />
			</button>
		</li>
	</ul>
</nav>
