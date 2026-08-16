// @ts-check

import { fileURLToPath } from 'node:url';

import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import { defineConfig, fontProviders } from 'astro/config';

import { pluginCodeCaption } from '@fujocoded/expressive-code-caption';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { pluginFileIcons } from '@xt0rted/expressive-code-file-icons';
import expressiveCode from 'astro-expressive-code';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

import { pluginCodeTabs } from './plugins/expressive-code-code-tabs.mjs';
import { rehypeHeadingSlugs } from './plugins/rehype-heading-slugs.mjs';
import { rehypeMermaidBlocks } from './plugins/rehype-mermaid-blocks.mjs';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    site: 'https://ellimist.dev',

    // `expressiveCode` must be listed before `mdx` so that it can process
    // code blocks inside .mdx files.
    integrations: [
        expressiveCode({
            // Tokyo Night for dark; Catppuccin Latte is its light counterpart
            // (Shiki ships no light Tokyo Night variant).
            themes: ['catppuccin-latte', 'tokyo-night'],
            // Bind the themes to our own `.dark` class instead of the OS
            // preference, so the theme toggle switches code blocks too.
            useDarkModeMediaQuery: false,
            themeCssSelector: (theme) =>
                theme.type === 'dark' ? '.dark' : ':root:not(.dark)',
            plugins: [
                // Must run early: it reads the `---` caption fence out of the
                // code before other plugins see the code as plaintext.
                pluginCodeCaption(),
                pluginCollapsibleSections(),
                pluginLineNumbers(),
                pluginFileIcons({
                    iconClass: 'ec-file-icon',
                    titleClass: 'ec-title-with-icon',
                }),
                pluginCodeTabs(),
            ],
            styleOverrides: {
                borderRadius: '0.5rem',
                codeFontSize: '0.875rem',
                codeFontFamily: 'var(--font-jetbrains-mono)',
                uiFontFamily: 'var(--font-jetbrains-mono)',
                borderColor: 'var(--color-border)',
            },
        }),
        mdx(),
        sitemap(),
        svelte(),
    ],

    markdown: {
        processor: unified({
            remarkPlugins: [remarkMath],
            // `rehypeHeadingSlugs` must precede Astro's own heading-id plugin,
            // and `rehypeMermaidBlocks` must precede Expressive Code. Both run
            // after every plugin listed here, so listing these is enough.
            rehypePlugins: [rehypeHeadingSlugs, rehypeMermaidBlocks, rehypeKatex],
        }),
    },

    fonts: [
        {
            provider: fontProviders.fontsource(),
            name: 'Catamaran',
            cssVariable: '--font-catamaran',
            fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
            weights: [400, 600, 700],
            styles: ['normal'],
        },
        {
            provider: fontProviders.fontsource(),
            name: 'Newsreader',
            cssVariable: '--font-newsreader',
            fallbacks: ['ui-serif', 'Georgia', 'serif'],
            weights: ['400 700'],
            styles: ['normal', 'italic'],
        },
        {
            provider: fontProviders.fontsource(),
            name: 'JetBrains Mono',
            cssVariable: '--font-jetbrains-mono',
            fallbacks: ['ui-monospace', 'SFMono-Regular', 'monospace'],
            weights: [400, 700],
            styles: ['normal'],
        },
    ],

    vite: {
        plugins: [tailwindcss()],
        resolve: {
            alias: {
                '~': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        optimizeDeps: {
            // Mermaid is only ever reached through `import('mermaid')` inside an
            // Astro component script, which Vite's dependency scanner does not
            // look into. Without this it gets optimized on first request instead
            // of at startup, and the browser asks for a `?v=` hash that no
            // longer exists. Production builds were never affected.
            include: ['mermaid'],
        },
    },
});
