export type PageItem =
	| { type: 'page'; value: number; key: string }
	| { type: 'ellipsis'; key: string };

export function buildPages(
	current: number,
	total: number,
	siblingCount = 1,
): PageItem[] {
	const page = (value: number): PageItem => ({
		type: 'page',
		value,
		key: `page-${value}`,
	});

	// first + last + current + 2 siblings + 2 ellipsis slots
	if (total <= siblingCount * 2 + 5) {
		return Array.from({ length: total }, (_, i) => page(i + 1));
	}

	const left = Math.max(current - siblingCount, 1);
	const right = Math.min(current + siblingCount, total);

	const showLeftEllipsis = left > 2;
	const showRightEllipsis = right < total - 1;

	const items: PageItem[] = [page(1)];

	if (showLeftEllipsis) items.push({ type: 'ellipsis', key: 'ellipsis-left' });

	for (
		let i = showLeftEllipsis ? left : 2;
		i <= (showRightEllipsis ? right : total - 1);
		i++
	) {
		items.push(page(i));
	}

	if (showRightEllipsis) items.push({ type: 'ellipsis', key: 'ellipsis-right' });

	items.push(page(total));
	return items;
}
