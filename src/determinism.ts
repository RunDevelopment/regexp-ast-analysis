import { CharBase, CharSet } from "refa";
import { Alternative } from "regexpp/ast";
import { MatchingDirection, OptionalMatchingDirection } from "./basic";
import { ReadonlyFlags } from "./flags";
import { getLongestPrefix, GetLongestPrefixOptions } from "./longest-prefix";
import { assertSameParent, SetEquivalence } from "./util";

/**
 * This splits the set of alternative into disjoint non-empty equivalence
 * classes based on the characters consumed by the alternatives. The
 * equivalence classes can be reordered freely but elements within an
 * equivalence class have to be proven to be reorderable.
 *
 * The idea of determinism is that we can reorder alternatives freely if the
 * regex engine doesn't have a choice as to which alternative to take.
 *
 * E.g. we can freely reorder the alternatives `food|butter|bread` because the
 * alternatives are not a prefix of each other and do not overlap. On the other
 * hand, the alternatives `a|aa` cannot be reordered without affecting the
 * regex.
 *
 * @param alternatives A set of alternatives with the same parent.where all
 * alternatives have the same parent.
 *
 * The collection must be possible to iterate multiple times. Ideally, the
 * backing data structure of this parameter is `Set` but other collection types
 * are also possible.
 * @param dir The direction from which characters are read to determine the
 * equivalence classes.
 *
 * Alternatives can have different equivalence classes depending on the
 * direction from which characters are read. E.g. when reading `a|ba` left to
 * right, the alternatives can be reordered, but not when reading from right to
 * left.
 *
 * The `"unknown"` option ensures that the returned equivalence classes hold
 * true regardless of direction. This option can also be thought of as "both"
 * directions.
 *
 * Example: Here are the results of this function for `ab|ac|bc` with all
 * direction options:
 *
 * - `"left"`: ``[[`ab`, `ac`], [`bc`]]``
 * - `"right"`: ``[[`ab`], [`ac`, `bc`]]``
 * - `"unknown"`: ``[[`ab`, `ac`, `bc`]]``
 * @param flags The flags of the regex of the given alternatives.
 */
export function getDeterminismEqClasses(
	alternatives: Iterable<Alternative>,
	dir: OptionalMatchingDirection,
	flags: ReadonlyFlags
): readonly (readonly Alternative[])[] {
	assertSameParent(alternatives);

	// TODO: cache

	if (dir === "unknown") {
		return getDirectionIndependentDeterminismEqClasses(alternatives, flags);
	}

	return getDirectionalDeterminismEqClasses(alternatives, dir, flags);
}

/**
 * This will return equivalence classes independent of the matching direction
 * of the given alternatives.
 */
function getDirectionIndependentDeterminismEqClasses(
	alternatives: Iterable<Alternative>,
	flags: ReadonlyFlags
): readonly (readonly Alternative[])[] {
	const ltr = getDirectionalDeterminismEqClasses(alternatives, "ltr", flags);
	const rtl = getDirectionalDeterminismEqClasses(alternatives, "rtl", flags);

	const disjoint = mergeOverlappingSets([...ltr, ...rtl], s => s);

	const result: (readonly Alternative[])[] = [];
	for (const sets of disjoint) {
		const eq = new Set<Alternative>();
		for (const s of sets) {
			s.forEach(a => eq.add(a));
		}
		result.push([...eq]);
	}

	return result;
}

const LONGEST_PREFIX_OPTIONS: Readonly<GetLongestPrefixOptions> = {
	includeAfter: true,
	looseGroups: true,
};

/**
 * This splits the set of alternative into disjoint non-empty equivalence
 * classes based on the characters consumed. The equivalence classes can be
 * reordered freely but elements within an equivalence class have to be proven
 * to be reorderable.
 *
 * The idea of determinism is that we can reorder alternatives freely if the
 * regex engine doesn't have a choice as to which alternative to take.
 *
 * E.g. we can freely reorder the alternatives `food|butter|bread` because the
 * alternative are not a prefix of each other and do not overlap.
 */
function getDirectionalDeterminismEqClasses(
	alternatives: Iterable<Alternative>,
	dir: MatchingDirection,
	flags: ReadonlyFlags
): readonly (readonly Alternative[])[] {
	// Step 1:
	// We map each alternative to an array of CharSets. Each array represents a
	// concatenation that we are sure of. E.g. the alternative `abc*de` will
	// get the array `a, b, [cd]`, and `abc` will get `a, b, c`.
	const getPrefixCharSets = cachedFn<Alternative, readonly CharSet[]>(a => {
		let prefix = getLongestPrefix(a, dir, flags, LONGEST_PREFIX_OPTIONS);

		// We optimize a little here.
		// All trailing all-characters sets can be removed without affecting
		// the result of the equivalence classes.
		let all = 0;
		for (let i = prefix.length - 1; i >= 0; i--) {
			if (prefix[i].isAll) {
				all++;
			} else {
				break;
			}
		}

		if (all > 0) {
			prefix = prefix.slice(0, prefix.length - all);
		}

		return prefix;
	});

	// Step 2:
	// Remap the prefix CharSets to use base sets instead. The following
	// operations will scale linearly with the number of characters. By using
	// base sets instead of the raw CharSets, we can drastically reduce the
	// number "logical" characters. It's the same trick refa uses for its DFA
	// operations (creation, minimization).
	const allCharSets = new Set<CharSet>();
	for (const a of alternatives) {
		getPrefixCharSets(a).forEach(cs => allCharSets.add(cs));
	}
	const base = new CharBase(allCharSets);

	interface Prefix {
		readonly characters: readonly (readonly number[])[];
		readonly alternative: Alternative;
	}
	const prefixes: Prefix[] = [];
	for (const a of alternatives) {
		prefixes.push({
			characters: getPrefixCharSets(a).map(cs => base.split(cs)),
			alternative: a,
		});
	}

	// Step 3:
	// Create equivalence classes from the prefixes. In the first iteration, we
	// will only look at the first character and create equivalence classes
	// based on that. Then we will try to further sub-divide the equivalence
	// classes based on the second character of the prefixes. This sub-division
	// process will continue until one prefix in the a equivalence class runs
	// out of characters.

	/** Subdivide */
	function subdivide(eqClass: readonly Prefix[], index: number): (readonly Prefix[])[] {
		if (eqClass.length < 2) {
			return [eqClass];
		}

		for (const prefix of eqClass) {
			if (index >= prefix.characters.length) {
				// ran out of characters
				return [eqClass];
			}
		}

		const disjointSets = mergeOverlappingSets(eqClass, p => p.characters[index]);

		const result: (readonly Prefix[])[] = [];
		for (const set of disjointSets) {
			result.push(...subdivide(set, index + 1));
		}

		return result;
	}

	return subdivide(prefixes, 0).map(eq => eq.map(p => p.alternative));
}

/**
 * Given a set of sets (`S`), this will merge all overlapping sets until all
 * sets are disjoint.
 *
 * This assumes that all sets contain at least one element.
 *
 * This function will not merge the given sets itself. Instead, it will
 * return an iterable of sets (`Set<S>`) of sets (`S`) to merge. Each set (`S`)
 * is guaranteed to be returned exactly once.
 *
 * Note: Instead of actual JS `Set` instances, the implementation will treat
 * `readonly S[]` instances as sets. This makes the whole implementation a lot
 * more efficient.
 */
function mergeOverlappingSets<S, E>(sets: readonly S[], getElements: (set: S) => Iterable<E>): (readonly S[])[] {
	if (sets.length < 2) {
		return [sets];
	}

	const eq = new SetEquivalence(sets.length);
	const elementMap = new Map<E, number>();

	for (let i = 0; i < sets.length; i++) {
		const s = sets[i];
		for (const e of getElements(s)) {
			const elementSet = elementMap.get(e);
			if (elementSet === undefined) {
				// It's the first time we see this element.
				elementMap.set(e, i);
			} else {
				// We've seen this element before in another set.
				// Make the 2 sets equal.
				eq.makeEqual(i, elementSet);
			}
		}
	}

	const eqSets = eq.getEquivalenceSets();

	const result: S[][] = [];
	for (let i = 0; i < eqSets.count; i++) {
		result.push([]);
	}
	for (let i = 0; i < sets.length; i++) {
		result[eqSets.indexes[i]].push(sets[i]);
	}
	return result;
}

interface CachedFn<S, T> {
	(value: S): T;
	readonly cache: Map<S, T>;
}

/**
 * Create a new cached function.
 */
function cachedFn<S, T>(fn: (value: S) => T): CachedFn<S, T> {
	/** */
	function wrapper(value: S): T {
		let cached = wrapper.cache.get(value);
		if (cached === undefined) {
			cached = fn(value);
			wrapper.cache.set(value, cached);
		}
		return cached;
	}

	wrapper.cache = new Map<S, T>();

	return wrapper;
}
