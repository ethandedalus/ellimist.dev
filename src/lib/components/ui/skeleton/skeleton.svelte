<script lang="ts">
	// Sourced verbatim from the shadcn-svelte registry (registry/skeleton.json),
	// with the CLI's $UTILS$ placeholder resolved to this project's alias.
	import { cn, type WithElementRef, type WithoutChildren } from '~/lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="skeleton"
	class={cn('bg-accent animate-pulse rounded-md', className)}
	{...restProps} 
></div>
