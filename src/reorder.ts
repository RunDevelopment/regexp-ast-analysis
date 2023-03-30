import { CharSet } from "refa";
import { Alternative, Element, Pattern } from "@eslint-community/regexpp/ast";
import {
	containsCapturingGroup,
	getLengthRange,
	getMatchingDirection,
	hasSomeDescendant,
	isEmptyBackreference,
	MatchingDirection,
	OptionalMatchingDirection,
} from "./basic";
import { toCache } from "./cache";
import { Chars } from "./chars";
import { getDeterminismEqClasses } from "./determinism";
import { ReadonlyFlags } from "./flags";
import { getFirstCharAfter } from "./next-char";
import { toCharSet } from "./to-char-set";
import { asReadonlySet, assertSameParent } from "./util";

/**
 * Options to control the behavior of {@link canReorder}.
 */
export interface CanReorderOptions {
	/**
	 * The matching direction of the alternatives.
	 *
	 * The correctness of {@link canReorder} depends on this direction being
	 * correct.
	 *
	 * If the matching direction cannot be known, supply `"unknown"`.
	 * `"unknown"` is guaranteed to always create a correct result regardless
	 * of matching direction. If {@link canReorder} returns `true` for
	 * `"unknown"`, then it will also return `true` for both `"ltr"` and
	 * `"rtl"` and vise versa.
	 *
	 * This value defaults to the result of {@link getMatchingDirection} for
	 * any of the given alternatives.
	 */
	matchingDirection?: OptionalMatchingDirection;
	/**
	 * Capturing groups are typically referenced by their position, so they
	 * cannot be reordered without affecting the behavior of the regular
	 * expression.
	 *
	 * However, in some cases capturing groups and their order doesn't matter.
	 * Enabling this option will allow all permutations that change the order
	 * of capturing groups.
	 *
	 * @default false
	 */
	ignoreCapturingGroups?: boolean;
}

/**
 * Returns whether the given alternatives can all be reordered.
 *
 * In other words, given a set of alternatives, this will return whether all
 * permutations of those alternatives behave exactly the same as the current
 * permutation of those alternatives.
 *
 * The function makes one more guarantee when some alternatives of the same
 * parent are not given. Let `T` be the set of the given alternatives and let
 * `U` be the set of alternatives that are **not** given and have the same
 * parent as the given alternatives. Let `M` be all alternatives in `U` that
 * are positioned between two alternatives `T`. As long as the relative order
 * of the alternatives in `M` is preserved, all permutations of `T ∪ M` are
 * guaranteed to be have equivalently.
 *
 * Note that this function makes no guarantees about the alternative
 * `U \ (T ∪ M)`. Permutations that change the position of those alternatives
 * are **not** guaranteed to be valid.
 *
 * Example: `/0|1|2|💚|3|4|💯|👋|5|6/` with `T = 💚|💯|👋`, `U = 0|1|2|3|4|5|6`, and
 * `M = 3|4`.
 *
 * This function will return `true` and the following are **guaranteed** to be
 * valid permutations:
 *
 * - `/0|1|2|💚|3|4|💯|👋|5|6/` (unchanged)
 * - `/0|1|2|3|💚|4|💯|👋|5|6/`
 * - `/0|1|2|3|4|💚|💯|👋|5|6/`
 * - `/0|1|2|💚|💯|3|4|👋|5|6/`
 * - `/0|1|2|💚|💯|👋|3|4|5|6/`
 * - `/0|1|2|👋|💯|💚|3|4|5|6/`
 * - `/0|1|2|👋|3|4|💯|💚|5|6/`
 *
 * The following are **not guaranteed** to be valid permutations:
 *
 * - `/0|1|2|💚|4|3|💯|👋|5|6/` (`3` and `4` were swapped)
 * - `/💚|0|1|2|3|4|💯|👋|5|6/` (the position of `0` was changed)
 * - `/0|1|2|💚|3|4|👋|5|6|💯/` (the position of `6` was changed)
 */
export function canReorder(
	alternatives: Iterable<Alternative>,
	flags: ReadonlyFlags,
	options: CanReorderOptions = {}
): boolean {
	flags = toCache(flags);
	const { ignoreCapturingGroups = false, matchingDirection } = options;

	const target = asReadonlySet(alternatives);
	if (target.size < 2) {
		// we can trivially reorder 0 or 1 alternatives
		return true;
	}
	assertSameParent(target);

	const slice = getAlternativesSlice(target);

	const direction = matchingDirection ?? getMatchingDirection(slice[0]);

	if (direction === "unknown") {
		return (
			canReorderDirectional(target, slice, "ltr", flags, ignoreCapturingGroups) &&
			canReorderDirectional(target, slice, "rtl", flags, ignoreCapturingGroups)
		);
	}

	return canReorderDirectional(target, slice, direction, flags, ignoreCapturingGroups);
}
export function canReorderDirectional(
	target: ReadonlySet<Alternative>,
	slice: Alternative[],
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	ignoreCapturingGroups: boolean
): boolean {
	const eqClasses = getDeterminismEqClasses(slice, direction, flags);

	if (!ignoreCapturingGroups && !canReorderCapturingGroups(target, slice, eqClasses)) {
		return false;
	}
	// from this point onward, we don't have to worry about capturing groups
	// anymore

	// we only have to prove that we can reorder alternatives within each
	// equivalence class.

	return eqClasses.every(eq => {
		if (eq.length < 2) {
			return true;
		}

		if (eq.every(a => !target.has(a))) {
			// This equivalence class contains only non-target alternatives.
			// As by the guarantees provided by this function, these
			// alternatives are not required to be reorderable.
			return true;
		}

		return canReorderBasedOnLength(eq) || canReorderBasedOnConsumedChars(eq, direction, flags);
	});
}

/**
 * Returns whether the capturing groups in the slice alternative can be
 * reordered.
 */
function canReorderCapturingGroups(
	target: ReadonlySet<Alternative>,
	slice: readonly Alternative[],
	eqClasses: readonly (readonly Alternative[])[]
): boolean {
	// Reordering and capturing groups:
	// Reordering doesn't play well with capturing groups because changing
	// the order of two capturing groups is a change that can be observed
	// by the user and might break the regex. So we have to avoid changing
	// the relative order of two alternatives with capturing groups.
	//
	// Since target alternatives can be reordered, there must be at most one
	// target alternative containing capturing groups. If one target
	// alternative contains capturing groups, no other alternative in the
	// slice is allowed to contain capturing groups.

	let targetCG = 0;
	let nonTargetCG = 0;
	for (const a of slice) {
		if (containsCapturingGroup(a)) {
			if (target.has(a)) {
				targetCG++;
			} else {
				nonTargetCG++;
			}
		}
	}

	if (targetCG > 1 || (targetCG === 1 && nonTargetCG !== 0)) {
		return false;
	}

	if (nonTargetCG !== 0) {
		// A equivalence class containing a capturing group must not contain a
		// target alternative.
		//
		// Here is an example where this doesn't work: `/^(?:a|(b)|b)$/` with
		// the targets `a` and `b`. Since `/^(?:a|(b)|b)$/` !=
		// `/^(?:a|b|(b))$/`, we cannot reorder the target alternatives.

		return eqClasses.every(eq => {
			return (
				// no capturing groups
				!eq.some(containsCapturingGroup) ||
				// or no target alternatives
				eq.every(a => !target.has(a))
			);
		});
	} else if (targetCG !== 0) {
		// The target alternative with the capturing group must be in its own
		// equivalence class.

		return eqClasses.every(eq => {
			return eq.length < 2 || !eq.some(containsCapturingGroup);
		});
	}

	return true;
}

/**
 * Returns whether alternatives can be reordered because they all have the same
 * length.
 *
 * No matter which alternative the regex engine picks, we will always end up in
 * the same place after.
 */
function canReorderBasedOnLength(slice: readonly Alternative[]): boolean {
	const lengthRange = getLengthRange(slice);
	return Boolean(lengthRange && lengthRange.min === lengthRange.max);
}

/**
 * Returns whether alternatives can be reordered because the characters
 * consumed.
 *
 * If the given alternatives are followed (in their current matching direction)
 * by characters not consumed by the alternatives, then the order order of the
 * alternatives doesn't matter.
 *
 * Furthermore, we can factor out common prefixes and suffixes. E.g. checking
 * whether `(?:foobar|footwear)` can be reordered is the same as checking
 * whether `foo(?:b|twe)ar` can be reordered. Using this idea, we can narrow
 * down the consumed characters and find additional characters that also have
 * to be disjoint with the consumed characters.
 */
function canReorderBasedOnConsumedChars(
	slice: readonly Alternative[],
	direction: MatchingDirection,
	flags: ReadonlyFlags
): boolean {
	const factoredOut = factorOutCommon(
		slice.map(a => a.elements),
		flags
	);

	const elements: Element[] = [];
	for (const alternative of factoredOut.rest) {
		elements.push(...alternative);
	}

	const consumedChars = Chars.empty(flags).union(...elements.map(e => getConsumedChars(e, flags)));

	// we first check all suffix characters because we get them for free when factoring out.
	const suffix = direction === "ltr" ? factoredOut.right : factoredOut.left;
	if (suffix.some(cs => cs.isDisjointWith(consumedChars))) {
		return true;
	}

	// now we check the character after the parent of the given alternatives
	const parent = slice[0].parent;
	if (parent.type === "Pattern" || parent.type === "Assertion") {
		return false;
	}

	return getFirstCharAfter(parent, direction, flags).char.isDisjointWith(consumedChars);
}
interface FactoredOut {
	left: CharSet[];
	right: CharSet[];
	rest: readonly (readonly Element[])[];
}
function factorOutCommon(alternatives: readonly (readonly Element[])[], flags: ReadonlyFlags): FactoredOut {
	const prefix = factorOutCommonPrefix(alternatives, "ltr", flags);
	const suffix = factorOutCommonPrefix(prefix.rest, "rtl", flags);
	return { left: prefix.prefix, right: suffix.prefix, rest: suffix.rest };
}
interface FactoredOutPrefix {
	prefix: CharSet[];
	rest: readonly (readonly Element[])[];
}
function factorOutCommonPrefix(
	alternatives: readonly (readonly Element[])[],
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FactoredOutPrefix {
	const prefix = getLongestPureCharPrefix(alternatives, direction, flags);
	if (prefix.length === 0) {
		return { prefix, rest: alternatives };
	} else {
		// remove prefix
		return {
			prefix,
			rest: alternatives.map(elements => {
				const start = direction === "ltr" ? prefix.length : 0;
				const end = direction === "ltr" ? elements.length : elements.length - prefix.length;
				return elements.slice(start, end);
			}),
		};
	}
}
function getLongestPureCharPrefix(
	alternatives: readonly (readonly Element[])[],
	direction: MatchingDirection,
	flags: ReadonlyFlags
): CharSet[] {
	const prefix: CharSet[] = [];

	for (let i = 0; ; i++) {
		let char: CharSet | null = null;

		for (const elements of alternatives) {
			const current = direction === "ltr" ? i : elements.length - 1 - i;

			if (i >= 0 && i < elements.length) {
				const element = elements[current];
				switch (element.type) {
					case "Character":
					case "CharacterClass":
					case "CharacterSet":
						if (char === null) {
							char = toCharSet(element, flags);
						} else {
							if (!char.equals(toCharSet(element, flags))) {
								return prefix;
							}
						}
						break;

					default:
						return prefix;
				}
			} else {
				return prefix;
			}
		}

		if (char === null) throw new Error();
		prefix.push(char);
	}
}

/**
 * Returns the smallest slice of alternatives that contains all given
 * alternatives.
 */
function getAlternativesSlice(set: ReadonlySet<Alternative>): Alternative[] {
	if (set.size <= 1) {
		return [...set];
	}

	let first;
	for (const item of set) {
		first = item;
		break;
	}

	if (!first) {
		throw new Error();
	}

	const parentAlternatives = first.parent.alternatives;
	let min = set.size;
	let max = 0;

	for (let i = 0; i < parentAlternatives.length; i++) {
		const a = parentAlternatives[i];
		if (set.has(a)) {
			min = Math.min(min, i);
			max = Math.max(max, i);
		}
	}

	return parentAlternatives.slice(min, max + 1);
}

/**
 * Returns the union of all characters that can possibly be consumed by the
 * given element.
 */
function getConsumedChars(element: Element | Pattern | Alternative, flags: ReadonlyFlags): CharSet {
	const sets: CharSet[] = [];

	// we misuse hasSomeDescendant to iterate all relevant elements
	hasSomeDescendant(
		element,
		d => {
			if (d.type === "Character" || d.type === "CharacterClass" || d.type === "CharacterSet") {
				sets.push(toCharSet(d, flags));
			} else if (d.type === "Backreference" && !isEmptyBackreference(d)) {
				sets.push(getConsumedChars(d.resolved, flags));
			}

			// always continue to the next element
			return false;
		},
		// don't go into assertions
		d => d.type !== "Assertion" && d.type !== "CharacterClass"
	);

	return Chars.empty(flags).union(...sets);
}
