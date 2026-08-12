// Global site data, imported anywhere via `~/consts`.

export const SITE_TITLE = 'Ellimist';

/** Results per page on /blog. Author-configurable; not exposed to readers. */
export const BLOG_PAGE_SIZE = 5;

/** How many entries each homepage section shows before "See more". */
export const HOME_SECTION_SIZE = 5;

/**
 * Upper bound on what the homepage renders into HTML. "See more" reveals
 * already-rendered entries, so this caps the page's size as the archive grows.
 */
export const HOME_SECTION_MAX = 20;
export const SITE_DESCRIPTION =
	'Notes and long-form writing on systems, tooling, and the occasional detour.';
