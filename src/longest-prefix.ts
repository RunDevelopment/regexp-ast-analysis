import { CharSet } from "refa";
import { Alternative, CapturingGroup, Element, Group, Quantifier } from "regexpp/ast";
import { isPotentiallyZeroLength, isStrictBackreference, isZeroLength, MatchingDirection } from "./basic";
import { CacheInstance, toCache } from "./cache";
import { ReadonlyFlags } from "./flags";
import {
	FirstConsumedChar,
	FirstConsumedChars,
	FirstLookChar,
	getFirstCharAfter,
	getFirstConsumedChar,
	getFirstConsumedCharAfter,
} from "./next-char";
import { toCharSet } from "./to-char-set";
import { assertNever } from "./util";

export interface GetLongestPrefixOptions {
	/**
	 * Whether the returned sequence is to include the next character (if any)
	 * after the longest knowable sequence.
	 *
	 * The next character after the longest knowable sequence is either:
	 * - not consumed by the given alternative
	 *   (e.g. `(ab)c` -> `[/a/, /b/, /c/]`),
	 * - only a superset of the actual next character
	 *   (e.g. `ab(cd|ef)` -> `[/a/, /b/, /[ce]/]`), or
	 * - both.
	 *
	 * Note that enabling this options means that the returned sequence of
	 * character sets is no longer guaranteed to be a prefix of the given
	 * alternative.
	 *
	 * @default false
	 */
	includeAfter?: boolean;
	/**
	 * Whether the returned sequence is to include the next character (if any)
	 * after the longest knowable sequence.
	 *
	 * The next character after the longest knowable sequence is either:
	 * - not consumed by the given alternative
	 *   (e.g. `(ab)c` -> `[/a/, /b/, /c/]`),
	 * - only a superset of the actual next character
	 *   (e.g. `ab(cd|ef)` -> `[/a/, /b/, /[ce]/]`), or
	 * - both.
	 *
	 * Note that enabling this options means that the returned sequence of
	 * character sets is no longer guaranteed to be a prefix of the given
	 * alternative.
	 *
	 * @default false
	 */
	looseGroups?: boolean;
}

/**
 * Returns the longest knowable prefix guaranteed to always be accepted by the
 * given alternative (ignoring assertions).
 *
 * All character sets except the last one are guaranteed to be non-empty. The
 * last character set is only guaranteed to be non-empty if `includeAfter: false`.
 */
export function getLongestPrefix(
	alternative: Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: Readonly<GetLongestPrefixOptions> = {}
): readonly CharSet[] {
	flags = toCache(flags);
	const { includeAfter = false, looseGroups = false } = options;

	if (!(flags instanceof CacheInstance)) {
		throw new Error("Expect toCache to produce a cache");
	}

	const cache = flags.getLongestPrefix;
	const cacheKey = `${direction},${includeAfter},${looseGroups}`;
	let weakCache = cache.get(cacheKey);
	if (weakCache === undefined) {
		weakCache = new WeakMap();
		cache.set(cacheKey, weakCache);
	}

	let cached = weakCache.get(alternative);
	if (cached === undefined) {
		cached = getLongestPrefixImpl(alternative, direction, { includeAfter, looseGroups }, flags);
		weakCache.set(alternative, cached);
	}
	return cached;
}

function getLongestPrefixImpl(
	alternative: Alternative,
	direction: MatchingDirection,
	options: Required<GetLongestPrefixOptions>,
	flags: ReadonlyFlags
): readonly CharSet[] {
	const { chars, complete } = getAlternativePrefix(alternative, direction, options, flags);

	// try to find empty character sets
	for (let i = 0; i < chars.length; i++) {
		if (chars[i].isEmpty) {
			return chars.slice(0, i);
		}
	}

	// append the next character after the alternative
	if (complete && options.includeAfter) {
		chars.push(getFirstCharAfterAlternative(alternative, direction, flags).char);
	}

	return chars;
}

interface Prefix {
	readonly chars: CharSet[];
	readonly complete: boolean;
}

const EMPTY_COMPLETE: Prefix = { chars: [], complete: true };
const EMPTY_INCOMPLETE: Prefix = { chars: [], complete: false };

function getAlternativePrefix(
	alternative: Alternative,
	direction: MatchingDirection,
	options: Required<GetLongestPrefixOptions>,
	flags: ReadonlyFlags
): Prefix {
	const { elements } = alternative;

	const chars: CharSet[] = [];

	const first = direction === "ltr" ? 0 : elements.length - 1;
	const inc = direction === "ltr" ? +1 : -1;
	for (let i = first; i >= 0 && i < elements.length; i += inc) {
		const inner = getElementPrefix(elements[i], direction, options, flags);
		chars.push(...inner.chars);

		if (!inner.complete) {
			return { chars, complete: false };
		}
	}

	return { chars, complete: true };
}

function getElementPrefix(
	element: Element,
	direction: MatchingDirection,
	options: Required<GetLongestPrefixOptions>,
	flags: ReadonlyFlags
): Prefix {
	switch (element.type) {
		case "Assertion":
			return EMPTY_COMPLETE;

		case "Character":
		case "CharacterClass":
		case "CharacterSet":
			return {
				chars: [toCharSet(element, flags)],
				complete: true,
			};

		case "CapturingGroup":
		case "Group":
			return getGroupPrefix(element, direction, options, flags);

		case "Quantifier":
			return getQuantifierPrefix(element, direction, options, flags);

		case "Backreference": {
			if (isStrictBackreference(element)) {
				const inner = getElementPrefix(element.resolved, direction, { ...options, includeAfter: false }, flags);
				return inner;
			}

			if (!options.includeAfter) {
				return EMPTY_INCOMPLETE;
			}

			const look = FirstConsumedChars.toLook(getFirstConsumedCharPlusAfter(element, direction, flags));
			return { chars: [look.char], complete: false };
		}

		default:
			assertNever(element);
	}
}

function getGroupPrefix(
	element: Group | CapturingGroup,
	direction: MatchingDirection,
	options: Required<GetLongestPrefixOptions>,
	flags: ReadonlyFlags
): Prefix {
	const alternatives = element.alternatives.map(a => getAlternativePrefix(a, direction, options, flags));

	if (alternatives.length === 1) {
		return alternatives[0];
	}

	const chars: CharSet[] = [];
	let complete = true;
	/** Counts the number of different characters in strict mode */
	let differentCount = 0;
	for (let i = 0; complete; i++) {
		const cs: CharSet[] = [];
		let end = false;
		for (const a of alternatives) {
			if (i >= a.chars.length) {
				end = true;
			} else {
				cs.push(a.chars[i]);
				if (i === a.chars.length - 1 && !a.complete && options.includeAfter) {
					complete = false;
				}
			}
		}

		if (cs.length === 0) {
			// This means that all alternatives are complete and have the same
			// length, so we can stop here.
			break;
		}

		if (end) {
			// This means that one (but not all) complete alternatives have
			// reached the end, so we have consider the chars after the group.
			complete = false;
			if (!options.includeAfter) {
				break;
			}

			cs.push(getFirstCharAfter(element, direction, flags).char);
		} else if (!options.looseGroups) {
			if (complete && cs.some(c => !c.equals(cs[0]))) {
				differentCount++;
			}
			if (differentCount >= 2) {
				complete = false;
				if (!options.includeAfter) {
					break;
				}
			}
		}

		const total = cs[0].union(...cs.slice(1));
		chars.push(total);
	}

	return { chars, complete };
}

function getQuantifierPrefix(
	element: Quantifier,
	direction: MatchingDirection,
	options: Required<GetLongestPrefixOptions>,
	flags: ReadonlyFlags
): Prefix {
	if (isZeroLength(element)) {
		return EMPTY_COMPLETE;
	}
	if (isPotentiallyZeroLength(element)) {
		if (!options.includeAfter) {
			return EMPTY_INCOMPLETE;
		}

		const look = FirstConsumedChars.toLook(getFirstConsumedCharPlusAfter(element, direction, flags));
		return { chars: [look.char], complete: false };
	}

	const inner = getElementPrefix(element.element, direction, options, flags);
	if (!inner.complete) {
		return inner;
	}

	if (inner.chars.length === 0) {
		// The quantifier is not of length zero and the inner element is complete.
		// If the algorithm is implemented correctly, `inner` will be at least on character long.
		throw new Error(`Expected the quantifier '${element.raw}' to consume at least one character.`);
	}

	const chars: CharSet[] = [];
	for (let i = 0; i < element.min; i++) {
		chars.push(...inner.chars);
		if (chars.length > 1000) {
			// this is a safe-guard to protect against regexes like a{1000000}
			return { chars, complete: false };
		}
	}

	if (element.min === element.max) {
		return { chars, complete: true };
	}

	if (options.includeAfter) {
		const look = getFirstCharAfter(element, direction, flags);
		chars.push(look.char.union(inner.chars[0]));
	}
	return { chars, complete: false };
}

/**
 * This operations is equal to:
 *
 * ```
 * concat(
 *     getFirstConsumedChar(element, direction, flags),
 *     getFirstConsumedCharAfter(element, direction, flags),
 * )
 * ```
 */
function getFirstConsumedCharPlusAfter(
	element: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstConsumedChar {
	const consumed = getFirstConsumedChar(element, direction, flags);

	if (!consumed.empty) {
		return consumed;
	}

	return FirstConsumedChars.concat([consumed, getFirstConsumedCharAfter(element, direction, flags)], flags);
}

function getFirstCharAfterAlternative(
	alternative: Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstLookChar {
	const { elements } = alternative;
	const last = direction === "rtl" ? 0 : elements.length - 1;
	const inc = direction === "ltr" ? +1 : -1;

	// The idea here is to go back as far as possible into the alternative without consuming a characters.
	// This allows assertions inside the alternative to affect the character after it.
	let afterThis = last;
	while (afterThis >= 0 && afterThis < elements.length && isZeroLength(elements[afterThis])) {
		afterThis -= inc;
	}

	if (afterThis >= 0 && afterThis < elements.length) {
		return getFirstCharAfter(elements[afterThis], direction, flags);
	} else {
		return FirstConsumedChars.toLook(getFirstConsumedCharPlusAfter(alternative, direction, flags));
	}
}
