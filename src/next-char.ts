import { CharSet } from "refa";
import { Alternative, Assertion, Element, WordBoundaryAssertion } from "regexpp/ast";
import {
	getMatchingDirectionFromAssertionKind,
	isStrictBackreference,
	getLengthRange,
	hasSomeDescendant,
	isEmptyBackreference,
	MatchingDirection,
	invertMatchingDirection,
} from "./basic";
import { toCharSet } from "./to-char-set";
import { followPaths } from "./follow";
import { ReadonlyFlags } from "./flags";
import { assertNever, CharUnion, intersectInexact, isReadonlyArray, unionInexact } from "./util";
import { Chars } from "./chars";
import { CacheInstance } from "./cache";

/**
 * The first character after some point.
 *
 * This is not constrained to some specific element. This is conceptually how a lookaround sees the input string.
 *
 * ## Example
 *
 * In the regex `/ab?/` the first look character after `a` is `{ char: all, edge: true, exact: true }`. It accepts all
 * characters because the `b` is optional, so there may be any character after `a`. `exact` is `true` because we know
 * that *exactly* all characters are allowed after `a`. `edge` is `true` because the input string is also allowed to
 * just end after `a` (i.e. the string `"a"` is accepted).
 *
 * ## Equivalent regexes
 *
 * The regex an instance of this type is equivalent to depends only on the `char` and `edge` properties. The equivalent
 * regex is:
 *
 * - `edge: true`: `(?=[char]|$)` or `(?<=[char]|^)`
 * - `edge: false`: `(?=[char])` or `(?<=[char])`
 *
 * (`$` and `^` denote the end and start of the input string respectively.)
 *
 * Note that `FirstLookChar` doesn't distinguish between lookaheads and lookbehinds. It can express either.
 *
 * ### Import values
 *
 * There are a few important values:
 *
 * - Accept all: The instance `{ char: all, exact: true, edge: true }` is guaranteed to be equivalent to an
 *   assertion that accepts all input strings (`(?=[\s\S]|$)`).
 * - Reject all: The instance `{ char: empty, edge: false }` (`exact` doesn't matter) is guaranteed to be equivalent to
 *   an assertion that rejects all input strings (`(?=[])`).
 * - Edge assertion: The instance `{ char: empty, edge: true }` (`exact` doesn't matter) is guaranteed to be equivalent
 *   to an edge assertion (either `^` or `$`).
 *
 * @see {@link FirstLookChars}
 */
export interface FirstLookChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	readonly char: CharSet;
	/**
	 * If `true`, then the first character can be the start/end of the string.
	 */
	readonly edge: boolean;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	readonly exact: boolean;
}
/**
 * This namespace contains methods for working with {@link FirstLookChar}s.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FirstLookChars {
	/**
	 * Returns a {@link FirstLookChar} that is equivalent to a trivially accepting lookaround.
	 *
	 * The returned look is semantically equivalent to `(?=)` == `(?=[^]|$)` or `(?<=)` == `(?<=[^]|^)`.
	 */
	export function all(flags: ReadonlyFlags): FirstLookChar {
		return {
			char: Chars.all(flags),
			exact: true,
			edge: true,
		};
	}
	/**
	 * Returns a {@link FirstLookChar} that is equivalent to an assertion that only accepts the start/end of the input
	 * string.
	 *
	 * The returned look is semantically equivalent to `$` == `(?=[]|$)` or `^` == `(?<=[]|^)`.
	 */
	export function edge(flags: ReadonlyFlags): FirstLookChar {
		return {
			char: Chars.empty(flags),
			exact: true,
			edge: true,
		};
	}

	/**
	 * Converts the given {@link FirstLookChar} to a {@link FirstConsumedChar}.
	 *
	 * This is semantically equivalent to `(?=b|$)` -> `[]|(?=b|$)`.
	 *
	 * Note: This operation will typically return a {@link FirstPartiallyConsumedChar}. It will only return a
	 * {@link FirstFullyConsumedChar} if the given `char` is empty and `edge: false`. This is because
	 * `(?=[])` -> `[]|(?=[])` == `[]`.
	 */
	export function toConsumed(look: FirstLookChar): FirstConsumedChar {
		if (!look.edge && look.char.isEmpty) {
			// the given look trivially rejects everything
			return {
				char: CharSet.empty(look.char.maximum),
				exact: true,
				empty: false,
			};
		} else {
			return {
				char: CharSet.empty(look.char.maximum),
				exact: true,
				empty: true,
				look,
			};
		}
	}
}

/**
 * The first character consumed by some element.
 *
 * The first character can either be fully consumed or partially consumed.
 *
 * @see {@link getFirstConsumedChar}
 * @see {@link FirstConsumedChars}
 */
export type FirstConsumedChar = FirstFullyConsumedChar | FirstPartiallyConsumedChar;
/**
 * This is equivalent to a regex fragment `[char]`.
 *
 * @see {@link FirstConsumedChar}
 */
export interface FirstFullyConsumedChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	readonly char: CharSet;
	/**
	 * If `true`, then the first character also includes the empty word.
	 */
	readonly empty: false;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	readonly exact: boolean;
}
/**
 * This is equivalent to a regex fragment `[char]|(?=[look.char])` or `[char]|(?=[look.char]|$)` depending on
 * {@link FirstLookChar.edge}.
 *
 * @see {@link FirstConsumedChar}
 */
export interface FirstPartiallyConsumedChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	readonly char: CharSet;
	/**
	 * If `true`, then the first character also includes the empty word.
	 */
	readonly empty: true;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	readonly exact: boolean;
	/**
	 * A set of characters that may come after the consumed character
	 */
	readonly look: FirstLookChar;
}
/**
 * This namespace contains methods for working with {@link FirstConsumedChar}s.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FirstConsumedChars {
	/**
	 * Returns a {@link FirstConsumedChar} that is equivalent to the empty concatenation.
	 */
	export function emptyConcat(flags: ReadonlyFlags): FirstPartiallyConsumedChar {
		return {
			char: Chars.empty(flags),
			exact: true,
			empty: true,
			look: FirstLookChars.all(flags),
		};
	}
	/**
	 * Returns a {@link FirstConsumedChar} that is equivalent to the empty union (or empty set).
	 */
	export function emptyUnion(flags: ReadonlyFlags): FirstFullyConsumedChar {
		return {
			char: Chars.empty(flags),
			exact: true,
			empty: false,
		};
	}

	/**
	 * Converts the given {@link FirstConsumedChar} to a {@link FirstLookChar}.
	 *
	 * This is conceptually equivalent to wrapping the given consumed character into a lookaround.
	 *
	 * This is semantically equivalent to `a|(?=b|$)` -> `(?=a|(?=b|$))` == `(?=[ab]|$)`.
	 */
	export function toLook(consumed: FirstConsumedChar): FirstLookChar {
		if (consumed.empty) {
			// We have 2 cases:
			//   (1) (?=a|(?=b))
			//       (?=a|b)
			//       (?=[ab])
			//   (2) (?=a|(?=b|$))
			//       (?=a|b|$)
			//       (?=[ab]|$)
			const union = unionInexact(consumed, consumed.look);

			return {
				char: union.char,
				exact: union.exact,
				edge: consumed.look.edge,
			};
		} else {
			// It's already in the correct form:
			//   (?=a)
			return {
				char: consumed.char,
				exact: consumed.exact,
				edge: false,
			};
		}
	}

	/**
	 * Creates the union of all the given {@link FirstConsumedChar}s.
	 *
	 * The result is independent of the order in which the characters are given.
	 */
	export function union(chars: Iterable<FirstConsumedChar>, flags: ReadonlyFlags): FirstConsumedChar {
		const union = CharUnion.fromFlags(flags);
		const looks: FirstLookChar[] = [];

		for (const itemChar of chars) {
			union.add(itemChar);
			if (itemChar.empty) {
				looks.push(itemChar.look);
			}
		}

		if (looks.length > 0) {
			if (looks.length === 1) {
				return {
					char: union.char,
					exact: union.exact,
					empty: true,
					look: looks[0],
				};
			}

			// This means that the unioned elements look something like this:
			//   (a|(?=g)|b?|x)
			//
			// Adding the trivially accepting look after all all alternatives that can be empty, we'll get:
			//   (a|(?=g)|b?|x)
			//   (a|(?=g)|b?(?=[^]|$)|x)
			//   (a|(?=g)|b(?=[^]|$)|(?=[^]|$)|x)
			//
			// Since we are only interested in the first character, the look in `b(?=[^]|$)` can be removed.
			//   (a|(?=g)|b|(?=[^]|$)|x)
			//   (a|b|x|(?=g)|(?=[^]|$))
			//   ([abx]|(?=g)|(?=[^]|$))
			//
			// To union the looks, we can simply use the fact that `(?=a)|(?=b)` == `(?=a|b)`
			//   ([abx]|(?=g)|(?=[^]|$))
			//   ([abx]|(?=g|[^]|$))
			//   ([abx]|(?=[^]|$))
			//
			// And with that we are done. This is exactly the form of a first partial char. Getting the exactness of the
			// union of normal chars and look chars follows the same rules.

			const lookUnion = CharUnion.fromFlags(flags);
			let edge = false;
			for (const look of looks) {
				lookUnion.add(look);
				edge = edge || look.edge;
			}
			return {
				char: union.char,
				exact: union.exact,
				empty: true,
				look: { char: lookUnion.char, exact: lookUnion.exact, edge },
			};
		} else {
			return { char: union.char, exact: union.exact, empty: false };
		}
	}

	/**
	 * Creates the concatenation of all the given {@link FirstConsumedChar}s.
	 *
	 * The given char iterable is evaluated **lazily**. The implementation will try to iterate as few chars as possible.
	 */
	export function concat(chars: Iterable<FirstConsumedChar>, flags: ReadonlyFlags): FirstConsumedChar {
		const union = CharUnion.fromFlags(flags);
		let look = FirstLookChars.all(flags);

		for (const item of chars) {
			union.add(intersectInexact(item, look));

			if (item.empty) {
				// This is the hard case. We need to convert the expression
				//   (a|(?=b))(c|(?=d))
				// into an expression
				//   e|(?=f)
				// (we will completely ignore edge assertions for now)
				//
				// To do that, we'll use the following idea:
				//   (a|(?=b))(c|(?=d))
				//   a(c|(?=d))|(?=b)(c|(?=d))
				//   ac|a(?=d)|(?=b)c|(?=b)(?=d)
				//
				// Since we are only interested in the first char, we can remove the `c` in `ac` and the `(?=d)` in
				// `a(?=d)`. Furthermore, `(?=b)c` is a single char, so let's call it `C` for now.
				//   ac|a(?=d)|(?=b)c|(?=b)(?=d)
				//   a|a|C|(?=b)(?=d)
				//   [aC]|(?=b)(?=d)
				//   [aC]|(?=(?=b)d)
				//
				// This is *almost* the desired form. We now have to convert `(?=(?=b)d)` to an expression of the form
				// `(?=f)`. This is the point where we can't ignore edge assertions any longer. Let's look at all possible
				// cases and see how it plays out. Also, let `D` be the char intersection of `b` and `d`.
				//   (1) (?=(?=b)d)
				//       (?=D)
				//
				//   (2) (?=(?=b)(d|$))
				//       (?=(?=b)d|(?=b)$)
				//       (?=D)
				//
				//   (3) (?=(?=b|$)d)
				//       (?=((?=b)|$)d)
				//       (?=(?=b)d|$d)
				//       (?=D)
				//
				//   (4) (?=(?=b|$)(d|$))
				//       (?=((?=b)|$)(d|$))
				//       (?=(?=b)(d|$)|$(d|$))
				//       (?=(?=b)d|(?=b)$|$d|$$)
				//       (?=D|$)
				//
				// As we can see, the look char is always `D` and the edge is only accepted if it's accepted by both.

				const lookIntersection = intersectInexact(look, item.look);
				look = {
					char: lookIntersection.char,
					exact: lookIntersection.exact,
					edge: look.edge && item.look.edge,
				};

				if (!look.edge && look.char.isEmpty) {
					// The look trivially rejects everything
					return { char: union.char, exact: union.exact, empty: false };
				}
			} else {
				return { char: union.char, exact: union.exact, empty: false };
			}
		}

		return { char: union.char, exact: union.exact, empty: true, look };
	}

	/**
	 * Makes the given consumed character optional.
	 *
	 * This is semantically equivalent to `a|(?=b|$)` -> `a?`.
	 */
	export function makeOptional(consumed: FirstConsumedChar): FirstPartiallyConsumedChar {
		return {
			char: consumed.char,
			exact: consumed.exact,
			empty: true,
			look: { char: CharSet.all(consumed.char.maximum), exact: true, edge: true },
		};
	}
}

class ImplOptions {
	private readonly _currentWordBoundaries: WordBoundaryAssertion[] = [];
	private readonly _ltrCache: WeakMap<Element | Alternative, FirstConsumedChar>;
	private readonly _rtlCache: WeakMap<Element | Alternative, FirstConsumedChar>;

	constructor(flags: ReadonlyFlags) {
		// We need a cache to avoid an exponential worst case regarding boundary assertions.
		// If the current flags are a cache instance, we'll use the cache from there and if not, then we'll create a
		// new cache.
		if (flags instanceof CacheInstance) {
			this._ltrCache = flags.getFirstConsumedCharLTR;
			this._rtlCache = flags.getFirstConsumedCharRTL;
		} else {
			this._ltrCache = new WeakMap();
			this._rtlCache = new WeakMap();
		}
	}

	isCurrentWordBoundary(element: WordBoundaryAssertion): boolean {
		return this._currentWordBoundaries.some(e => e === element);
	}
	pushWordBoundary(element: WordBoundaryAssertion): void {
		this._currentWordBoundaries.push(element);
	}
	popWordBoundary(): void {
		this._currentWordBoundaries.pop();
	}

	getCached(element: Element | Alternative, dir: MatchingDirection): FirstConsumedChar | undefined {
		if (dir === "ltr") {
			return this._ltrCache.get(element);
		} else {
			return this._rtlCache.get(element);
		}
	}
	setCached(element: Element | Alternative, dir: MatchingDirection, result: FirstConsumedChar): void {
		if (dir === "ltr") {
			this._ltrCache.set(element, result);
		} else {
			this._rtlCache.set(element, result);
		}
	}
}

/**
 * If a character is returned, it guaranteed to be a super set of the actual character. If the given element is
 * always of zero length, then the empty character set will be returned.
 *
 * If `exact` is `true` then it is guaranteed that the returned character is guaranteed to be the actual
 * character at all times if this element is not influenced by lookarounds outside itself.
 *
 * ## Partially consumed
 *
 * Only the given element and its children are processed. This is important when considering partially consumed first
 * characters. The lookaround is derived only from the assertions inside the given element.
 *
 * E.g. In `/b?a/`, the result for `b?` is `{ char: 'b', empty: true, look: { char: all, edge: true } }`. The
 * lookaround accepts all characters because it doesn't take the `a` after `b?` into consideration.
 */
export function getFirstConsumedChar(
	element: Element | Alternative | readonly Alternative[],
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstConsumedChar {
	const options = new ImplOptions(flags);

	if (isReadonlyArray(element)) {
		return getFirstConsumedCharAlternativesImpl(element, direction, flags, options);
	} else {
		return getFirstConsumedCharImpl(element, direction, flags, options);
	}
}
function getFirstConsumedCharAlternativesImpl(
	alternatives: readonly Alternative[],
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstConsumedChar {
	return FirstConsumedChars.union(
		alternatives.map(e => getFirstConsumedCharImpl(e, direction, flags, options)),
		flags
	);
}
function getFirstConsumedCharImpl(
	element: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstConsumedChar {
	let result = options.getCached(element, direction);
	if (result === undefined) {
		result = getFirstConsumedCharUncachedImpl(element, direction, flags, options);
		options.setCached(element, direction, result);
	}
	return result;
}
function getFirstConsumedCharAssertionImpl(
	element: Assertion,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstConsumedChar {
	switch (element.kind) {
		case "word":
			if (options.isCurrentWordBoundary(element)) {
				// this means that the value of a word boundary assertion depends on itself indirectly.
				// we have to stop the recursion here because infinite recursion is possible otherwise.
				return misdirectedAssertion();
			} else {
				options.pushWordBoundary(element);
				const before = getFirstCharAfterImpl(element, invertMatchingDirection(direction), flags, options);
				options.popWordBoundary();

				// Remember:
				//   \B == (?<=\w)(?=\w)|(?<!\w)(?!\w)
				//   \b == (?<!\w)(?=\w)|(?<=\w)(?!\w)

				const word = Chars.word(flags);

				if (before.edge) {
					// this forces our hand a little. Since the previous "character" might be the start/end of
					// the string, we have to enter the alternative that starts with `(?<!\w)`
					if (before.char.isDisjointWith(word)) {
						return wordAssertion(element.negate);
					} else {
						// it might be either of the alternatives
						return misdirectedAssertion();
					}
				} else {
					if (before.char.isDisjointWith(word)) {
						return wordAssertion(element.negate);
					} else if (before.char.isSubsetOf(word)) {
						return wordAssertion(!element.negate);
					} else {
						// it might be either of the alternatives
						return misdirectedAssertion();
					}
				}
			}
		case "end":
		case "start":
			if (getMatchingDirectionFromAssertionKind(element.kind) === direction) {
				if (flags.multiline) {
					return lineAssertion();
				} else {
					return edgeAssertion();
				}
			} else {
				return misdirectedAssertion();
			}
		case "lookahead":
		case "lookbehind":
			if (getMatchingDirectionFromAssertionKind(element.kind) === direction) {
				if (element.negate) {
					// A little note about negative:
					//
					// Negation is hard because it throws the idea of exactness on its heads. The interface defines
					// exactness in a way that means: "we only guarantee that the returned characters are a superset of
					// the actual (=correct) characters." Negation is incompatible with that definition of exactness
					// because negating a _superset_ means that we can only guarantee a _subset_. So we can only do
					// _exact_ negation. This is a big limitation.
					//
					// So what negations can be done _exactly_?
					// Single-character negations, e.g. `(?!a)` or `(?!a|b|\d)`. That's it. All other negated assertions
					// are not doable _in general_.

					if (hasSomeDescendant(element, d => d !== element && d.type === "Assertion")) {
						return misdirectedAssertion();
					}
					const firstChar = getFirstConsumedCharAlternativesImpl(
						element.alternatives,
						direction,
						flags,
						options
					);
					const range = getLengthRange(element.alternatives);
					if (firstChar.empty || !range) {
						// trivially rejecting
						return { char: Chars.empty(flags), empty: false, exact: true };
					}

					if (!firstChar.exact || range.max !== 1) {
						// the goal to to convert `(?![a])` to `(?=[^a]|$)` but this negation is only correct
						// if the characters are exact and if the assertion asserts at most one character
						// E.g. `(?![a][b])` == `(?=$|[^a]|[a][^b])`
						return misdirectedAssertion();
					} else {
						return FirstLookChars.toConsumed({ char: firstChar.char.negate(), edge: true, exact: true });
					}
				} else {
					const firstChar = getFirstConsumedCharAlternativesImpl(
						element.alternatives,
						direction,
						flags,
						options
					);
					return FirstLookChars.toConsumed(FirstConsumedChars.toLook(firstChar));
				}
			} else {
				return misdirectedAssertion();
			}
		default:
			throw assertNever(element);
	}

	/**
	 * The result for an assertion that (partly) assert for the wrong matching direction.
	 */
	function misdirectedAssertion(): FirstConsumedChar {
		return FirstLookChars.toConsumed({
			char: Chars.all(flags),
			edge: true,
			// This is the important part.
			// Since the allowed chars depend on the previous chars, we don't know which will be allowed.
			exact: false,
		});
	}
	function edgeAssertion(): FirstConsumedChar {
		return FirstLookChars.toConsumed(FirstLookChars.edge(flags));
	}
	function lineAssertion(): FirstConsumedChar {
		return FirstLookChars.toConsumed({
			char: Chars.lineTerminator(flags),
			edge: true,
			exact: true,
		});
	}
	function wordAssertion(negate: boolean): FirstConsumedChar {
		const word = Chars.word(flags);

		return FirstLookChars.toConsumed({
			char: negate ? word.negate() : word,
			edge: negate,
			exact: true,
		});
	}
}
function getFirstConsumedCharUncachedImpl(
	element: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstConsumedChar {
	switch (element.type) {
		case "Assertion":
			return getFirstConsumedCharAssertionImpl(element, direction, flags, options);

		case "Character":
		case "CharacterSet":
		case "CharacterClass":
			return { char: toCharSet(element, flags), empty: false, exact: true };

		case "Quantifier": {
			if (element.max === 0) {
				return FirstConsumedChars.emptyConcat(flags);
			}

			const firstChar = getFirstConsumedCharImpl(element.element, direction, flags, options);
			if (element.min === 0) {
				return FirstConsumedChars.makeOptional(firstChar);
			} else {
				return firstChar;
			}
		}

		case "Alternative": {
			let elements = element.elements;
			if (direction === "rtl") {
				elements = [...elements];
				elements.reverse();
			}

			return FirstConsumedChars.concat(
				(function* (): Iterable<FirstConsumedChar> {
					for (const e of elements) {
						yield getFirstConsumedCharImpl(e, direction, flags, options);
					}
				})(),
				flags
			);
		}

		case "CapturingGroup":
		case "Group":
			return getFirstConsumedCharAlternativesImpl(element.alternatives, direction, flags, options);

		case "Backreference": {
			if (isEmptyBackreference(element)) {
				return FirstConsumedChars.emptyConcat(flags);
			}
			let resolvedChar = getFirstConsumedCharImpl(element.resolved, direction, flags, options);

			// the resolved character is only exact if it is only a single character.
			// i.e. /(\w)\1/ here the (\w) will capture exactly any word character, but the \1 can only match
			// one word character and that is the only (\w) matched.
			if (resolvedChar.exact && resolvedChar.char.size > 1) {
				resolvedChar = { ...resolvedChar, exact: false };
			}

			if (isStrictBackreference(element)) {
				return resolvedChar;
			} else {
				// there is at least one path through which the backreference will (possibly) be replaced with the
				// empty string
				return FirstConsumedChars.makeOptional(resolvedChar);
			}
		}

		default:
			throw assertNever(element);
	}
}

export function getFirstConsumedCharAfter(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstConsumedChar {
	return getFirstConsumedCharAfterImpl(afterThis, direction, flags, new ImplOptions(flags));
}
function getFirstConsumedCharAfterImpl(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstConsumedChar {
	type State = FirstConsumedChar;
	const result = followPaths<State>(
		afterThis,
		"next",
		FirstConsumedChars.emptyConcat(flags),
		{
			join(states): State {
				return FirstConsumedChars.union(states, flags);
			},
			enter(element, state, direction): State {
				const first = getFirstConsumedCharImpl(element, direction, flags, options);
				return FirstConsumedChars.concat([state, first], flags);
			},
			continueInto(): boolean {
				return false;
			},
			continueAfter(_, state): boolean {
				return state.empty;
			},
			continueOutside(element, _, direction): boolean {
				return getMatchingDirectionFromAssertionKind(element.kind) !== direction;
			},
		},
		direction
	);

	return result;
}

/**
 * Returns the first character after the given element.
 *
 * What "after" means depends the on the given direction which will be interpreted as the current matching
 * direction. You can use this to get the previous character of an element as well.
 */
export function getFirstCharAfter(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstLookChar {
	return getFirstCharAfterImpl(afterThis, direction, flags, new ImplOptions(flags));
}
function getFirstCharAfterImpl(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	options: ImplOptions
): FirstLookChar {
	return FirstConsumedChars.toLook(getFirstConsumedCharAfterImpl(afterThis, direction, flags, options));
}

/**
 * A wrapper around a character value that adds which elements contributed to the character value.
 */
export interface WithContributors<Char> {
	char: Char;
	/**
	 * A list of elements that all contributed to the result. All sub-elements of the listed elements also contribute.
	 */
	contributors: Element[];
}

/**
 * This function behaves exactly like {@link getFirstConsumedCharAfter} but it also tracks what elements contribute to
 * the result.
 */
export function getFirstConsumedCharAfterWithContributors(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): WithContributors<FirstConsumedChar> {
	return getFirstConsumedCharAfterWithContributorsImpl(afterThis, direction, flags, new ImplOptions(flags));
}
function getFirstConsumedCharAfterWithContributorsImpl(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	option: ImplOptions
): WithContributors<FirstConsumedChar> {
	type State = Readonly<WithContributors<FirstConsumedChar>>;
	const result = followPaths<State>(
		afterThis,
		"next",
		{ char: FirstConsumedChars.emptyConcat(flags), contributors: [] },
		{
			join(states): State {
				const contributors = new Set<Element>();
				states.forEach(s => s.contributors.forEach(e => contributors.add(e)));

				return {
					char: FirstConsumedChars.union(
						states.map(s => s.char),
						flags
					),
					contributors: [...contributors],
				};
			},

			enter(element, state, direction): State {
				const first = getFirstConsumedCharImpl(element, direction, flags, option);
				return {
					char: FirstConsumedChars.concat([state.char, first], flags),
					contributors: [...state.contributors, element],
				};
			},

			continueInto(): boolean {
				return false;
			},
			continueAfter(_, state): boolean {
				return state.char.empty;
			},
			continueOutside(element, _, direction): boolean {
				return getMatchingDirectionFromAssertionKind(element.kind) !== direction;
			},
		},
		direction
	);

	return result;
}
/**
 * This function behaves exactly like {@link getFirstCharAfter} but it also tracks what elements contribute to the
 * result.
 */
export function getFirstCharAfterWithContributors(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): WithContributors<FirstLookChar> {
	return getFirstCharAfterWithContributorsImpl(afterThis, direction, flags, new ImplOptions(flags));
}
function getFirstCharAfterWithContributorsImpl(
	afterThis: Element | Alternative,
	direction: MatchingDirection,
	flags: ReadonlyFlags,
	option: ImplOptions
): WithContributors<FirstLookChar> {
	const { char, contributors } = getFirstConsumedCharAfterWithContributorsImpl(afterThis, direction, flags, option);
	return { char: FirstConsumedChars.toLook(char), contributors };
}
