import { CharSet } from "refa";
import { Alternative, Element } from "regexpp/ast";
import {
	assertionKindToMatchingDirection,
	backreferenceAlwaysAfterGroup,
	getLengthRange,
	hasSomeDescendant,
	isEmptyBackreference,
	MatchingDirection,
} from "./basic";
import { toCharSet } from "./to-char-set";
import { followPaths } from "./follow";
import { ReadonlyFlags } from "./flags";
import { assertNever } from "./util";
import { Chars } from "./chars";

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
 * - Accept all: The instance `{ char: all, edge: true }` (`edge` doesn't matter) is guaranteed to be equivalent to an
 *   assertion that accepts all input strings (`(?=[\s\S]|$)`).
 * - Reject all: The instance `{ char: empty, edge: false }` (`edge` doesn't matter) is guaranteed to be equivalent to
 *   an assertion that rejects all input strings (`(?=[])`).
 * - Edge assertion: The instance `{ char: empty, edge: true }` (`edge` doesn't matter) is guaranteed to be equivalent
 *   to an edge assertion (either `^` or `$`).
 */
export interface FirstLookChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	char: CharSet;
	/**
	 * If `true`, then the first character can be the start/end of the string.
	 */
	edge: boolean;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	exact: boolean;
}
/**
 * The first character consumed by some element.
 *
 * The first character can either be fully consumed or partially consumed. A fully consumed character means that all
 * input strings accepted by the element must start with this character. A partially consumed character means that the
 * element might not consumed characters.
 *
 * @see {@link getFirstConsumedChar}
 */
export type FirstConsumedChar = FirstFullyConsumedChar | FirstPartiallyConsumedChar;
/**
 * This is equivalent to a regex fragment `[char]`.
 */
export interface FirstFullyConsumedChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	char: CharSet;
	/**
	 * If `true`, then the first character also includes the empty word.
	 */
	empty: false;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	exact: boolean;
}
/**
 * This is equivalent to a regex fragment `[char]|(?=[look.char])` or `[char]|(?=[look.char]|$)` depending on
 * `look.edge`.
 */
export interface FirstPartiallyConsumedChar {
	/**
	 * A super set of the first character.
	 *
	 * We can usually only guarantee a super set because lookaround in the pattern may narrow down the actual character
	 * set.
	 */
	char: CharSet;
	/**
	 * If `true`, then the first character also includes the empty word.
	 */
	empty: true;
	/**
	 * If `true`, then `char` is guaranteed to be exactly the first character and not just a super set of it.
	 */
	exact: boolean;
	/**
	 * A set of characters that may come after the consumed character
	 */
	look: FirstLookChar;
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
	element: Element | Alternative | Alternative[],
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstConsumedChar {
	if (Array.isArray(element)) {
		return firstConsumedCharUnion(
			element.map(e => getFirstConsumedChar(e, direction, flags)),
			flags
		);
	}

	switch (element.type) {
		case "Assertion":
			switch (element.kind) {
				case "word":
					return misdirectedAssertion();
				case "end":
				case "start":
					if (assertionKindToMatchingDirection(element.kind) === direction) {
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
					if (assertionKindToMatchingDirection(element.kind) === direction) {
						if (element.negate) {
							// we can only meaningfully analyse negative lookarounds of the form `(?![a])`
							if (hasSomeDescendant(element, d => d !== element && d.type === "Assertion")) {
								return misdirectedAssertion();
							}
							const firstChar = getFirstConsumedChar(element.alternatives, direction, flags);
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
								return emptyWord({ char: firstChar.char.negate(), edge: true, exact: true });
							}
						} else {
							const firstChar = getFirstConsumedChar(element.alternatives, direction, flags);
							return emptyWord(firstConsumedToLook(firstChar));
						}
					} else {
						return misdirectedAssertion();
					}
				default:
					throw assertNever(element);
			}

		case "Character":
		case "CharacterSet":
		case "CharacterClass":
			return { char: toCharSet(element, flags), empty: false, exact: true };

		case "Quantifier": {
			if (element.max === 0) {
				return emptyWord();
			}

			const firstChar = getFirstConsumedChar(element.element, direction, flags);
			if (element.min === 0) {
				return firstConsumedCharUnion([emptyWord(), firstChar], flags);
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

			return firstConsumedCharConcat(
				(function* (): Iterable<FirstConsumedChar> {
					for (const e of elements) {
						yield getFirstConsumedChar(e, direction, flags);
					}
				})(),
				flags
			);
		}

		case "CapturingGroup":
		case "Group":
			return getFirstConsumedChar(element.alternatives, direction, flags);

		case "Backreference": {
			if (isEmptyBackreference(element)) {
				return emptyWord();
			}
			const resolvedChar = getFirstConsumedChar(element.resolved, direction, flags);

			// the resolved character is only exact if it is only a single character.
			// i.e. /(\w)\1/ here the (\w) will capture exactly any word character, but the \1 can only match
			// one word character and that is the only (\w) matched.
			resolvedChar.exact = resolvedChar.exact && resolvedChar.char.size <= 1;

			if (backreferenceAlwaysAfterGroup(element)) {
				return resolvedChar;
			} else {
				// there is at least one path through which the backreference will (possibly) be replaced with the
				// empty string
				return firstConsumedCharUnion([resolvedChar, emptyWord()], flags);
			}
		}

		default:
			throw assertNever(element);
	}

	/**
	 * The result for an assertion that (partly) assert for the wrong matching direction.
	 */
	function misdirectedAssertion(): FirstPartiallyConsumedChar {
		return emptyWord({
			char: Chars.all(flags),
			edge: true,
			// This is the important part.
			// Since the allowed chars depend on the previous chars, we don't know which will be allowed.
			exact: false,
		});
	}
	function edgeAssertion(): FirstPartiallyConsumedChar {
		return emptyWord(firstLookCharEdgeAccepting(flags));
	}
	function lineAssertion(): FirstPartiallyConsumedChar {
		return emptyWord({
			char: Chars.lineTerminator(flags),
			edge: true,
			exact: true,
		});
	}
	function emptyWord(look?: FirstLookChar): FirstPartiallyConsumedChar {
		return firstConsumedCharEmptyWord(flags, look);
	}
}
/**
 * Returns first-look-char that is equivalent to a trivially-accepting lookaround.
 */
function firstLookCharTriviallyAccepting(flags: ReadonlyFlags): FirstLookChar {
	return { char: Chars.all(flags), edge: true, exact: true };
}
/**
 * Returns first-look-char that is equivalent to `/$/`.
 */
function firstLookCharEdgeAccepting(flags: ReadonlyFlags): FirstLookChar {
	return { char: Chars.empty(flags), edge: true, exact: true };
}
/**
 * Returns first-consumed-char that is equivalent to consuming nothing (the empty word) followed by a trivially
 * accepting lookaround.
 */
function firstConsumedCharEmptyWord(flags: ReadonlyFlags, look?: FirstLookChar): FirstPartiallyConsumedChar {
	return {
		char: Chars.empty(flags),
		empty: true,
		exact: true,
		look: look ?? firstLookCharTriviallyAccepting(flags),
	};
}
class CharUnion {
	char: CharSet;
	exact: boolean;
	private constructor(char: CharSet) {
		this.char = char;
		this.exact = true;
	}
	add(char: CharSet, exact: boolean): void {
		// basic idea here is that the union or an exact superset with an inexact subset will be exact
		if (this.exact && !exact && !this.char.isSupersetOf(char)) {
			this.exact = false;
		} else if (!this.exact && exact && char.isSupersetOf(this.char)) {
			this.exact = true;
		}

		this.char = this.char.union(char);
	}
	static emptyFromFlags(flags: ReadonlyFlags): CharUnion {
		return new CharUnion(Chars.empty(flags));
	}
	static emptyFromMaximum(maximum: number): CharUnion {
		return new CharUnion(CharSet.empty(maximum));
	}
}
function firstConsumedCharUnion(iter: Iterable<Readonly<FirstConsumedChar>>, flags: ReadonlyFlags): FirstConsumedChar {
	const union = CharUnion.emptyFromFlags(flags);
	const looks: FirstLookChar[] = [];

	for (const itemChar of iter) {
		union.add(itemChar.char, itemChar.exact);
		if (itemChar.empty) {
			looks.push(itemChar.look);
		}
	}

	if (looks.length > 0) {
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

		const lookUnion = CharUnion.emptyFromFlags(flags);
		let edge = false;
		for (const look of looks) {
			lookUnion.add(look.char, look.exact);
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
function firstConsumedCharConcat(iter: Iterable<Readonly<FirstConsumedChar>>, flags: ReadonlyFlags): FirstConsumedChar {
	const union = CharUnion.emptyFromFlags(flags);
	let look = firstLookCharTriviallyAccepting(flags);

	for (const item of iter) {
		union.add(item.char.intersect(look.char), look.exact && item.exact);

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

			const charIntersection = look.char.intersect(item.look.char);
			look = {
				char: charIntersection,
				exact: (look.exact && item.look.exact) || charIntersection.isEmpty,
				edge: look.edge && item.look.edge,
			};
		} else {
			return { char: union.char, exact: union.exact, empty: false };
		}
	}
	return { char: union.char, exact: union.exact, empty: true, look };
}
/**
 * This wraps the first-consumed-char object in a look.
 */
function firstConsumedToLook(first: Readonly<FirstConsumedChar>): FirstLookChar {
	if (first.empty) {
		// We have 2 cases:
		//   (1) (?=a|(?=b))
		//       (?=a|b)
		//       (?=[ab])
		//   (2) (?=a|(?=b|$))
		//       (?=a|b|$)
		//       (?=[ab]|$)
		const union = CharUnion.emptyFromMaximum(first.char.maximum);
		union.add(first.char, first.exact);
		union.add(first.look.char, first.look.exact);

		return {
			char: union.char,
			exact: union.exact,
			edge: first.look.edge,
		};
	} else {
		// It's already in the correct form:
		//   (?=a)
		return {
			char: first.char,
			exact: first.exact,
			edge: false,
		};
	}
}

/**
 * The first character consumed after some element.
 *
 * @see {@link getFirstConsumedCharAfter}
 */
export interface FirstConsumedCharAfter {
	char: FirstConsumedChar;
	elements: Element[];
}
export function getFirstConsumedCharAfter(
	afterThis: Element,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstConsumedCharAfter {
	type State = Readonly<FirstConsumedCharAfter>;
	const result = followPaths<State>(
		afterThis,
		"next",
		{ char: firstConsumedCharEmptyWord(flags), elements: [] },
		{
			fork(state): State {
				return state;
			},
			join(states): State {
				const elements = new Set<Element>();
				states.forEach(s => s.elements.forEach(e => elements.add(e)));

				return {
					char: firstConsumedCharUnion(
						states.map(s => s.char),
						flags
					),
					elements: [...elements],
				};
			},

			enter(element, state, direction): State {
				const first = getFirstConsumedChar(element, direction, flags);
				return {
					char: firstConsumedCharConcat([state.char, first], flags),
					elements: [...state.elements, element],
				};
			},

			continueInto(): boolean {
				return false;
			},
			continueAfter(_, state): boolean {
				return state.char.empty;
			},
		},
		direction
	);

	return { char: result.char, elements: result.elements };
}

/**
 * @see {@link getFirstCharAfter}
 */
export interface FirstCharAfter {
	/**
	 * The first character after the given element.
	 */
	char: FirstLookChar;
	/**
	 * A list of elements that all contributed to the result. All sub-elements of the listed elements also contribute.
	 */
	elements: Element[];
}
/**
 * Returns the first character after the given element.
 *
 * What "after" means depends the on the given direction which will be interpreted as the current matching
 * direction. You can use this to get the previous character of an element as well.
 */
export function getFirstCharAfter(
	afterThis: Element,
	direction: MatchingDirection,
	flags: ReadonlyFlags
): FirstCharAfter {
	const result = getFirstConsumedCharAfter(afterThis, direction, flags);
	return { char: firstConsumedToLook(result.char), elements: [...result.elements] };
}
