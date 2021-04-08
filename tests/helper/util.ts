export function* iterateBFS<S>(startElements: Iterable<S>, next: (element: S) => Iterable<S>): Iterable<S> {
	const visited = new Set<S>();
	let visitNow: S[] = [...startElements];
	let visitNext: S[] = [];

	while (visitNow.length > 0) {
		for (const node of visitNow) {
			if (!visited.has(node)) {
				visited.add(node);
				yield node;
				visitNext.push(...next(node));
			}
		}

		// swap arrays
		[visitNow, visitNext] = [visitNext, visitNow];
		// clear visitNext
		visitNext.length = 0;
	}
}
