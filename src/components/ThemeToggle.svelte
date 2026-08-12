<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let isDark = $state(false);

	onMount(() => {
		isDark = document.documentElement.classList.contains('dark');

		// Follow the OS only while the user has made no explicit choice.
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const onSystemChange = (event: MediaQueryListEvent) => {
			if (localStorage.getItem('theme')) return;
			isDark = event.matches;
			document.documentElement.classList.toggle('dark', isDark);
		};
		media.addEventListener('change', onSystemChange);
		return () => media.removeEventListener('change', onSystemChange);
	});

	function toggle() {
		const next = !document.documentElement.classList.contains('dark');
		isDark = next;
		document.documentElement.classList.toggle('dark', next);
		try {
			localStorage.setItem('theme', next ? 'dark' : 'light');
		} catch (e) {
			console.error(e)
		}
	}
</script>

<!-- The flanking icons are decorative; below `sm` the header needs the width. -->
<div class="flex shrink-0 items-center gap-2">
	<Sun class="text-muted-foreground hidden size-4 sm:block" aria-hidden="true" />
	<button
		type="button"
		role="switch"
		aria-checked={isDark}
		aria-label="Toggle dark mode"
		onclick={toggle}
		class="theme-switch focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
	>
		<span
			class="theme-switch-thumb bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform"
		></span>
	</button>
	<Moon class="text-muted-foreground hidden size-4 sm:block" aria-hidden="true" />
</div>
