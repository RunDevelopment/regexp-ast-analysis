import { CharSet, JS } from "refa";
import {
	Character,
	CharacterClass,
	CharacterClassRange,
	CharacterSet,
	ClassRangesCharacterClass,
	ClassSetOperand,
	ExpressionCharacterClass,
	StringAlternative,
	StringsUnicodePropertyCharacterSet,
} from "@eslint-community/regexpp/ast";
import { CacheInstance } from "./cache";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";
import { assertNever, isReadonlyArray } from "./util";

/**
 * All possible element types that are accepted by {@link toCharSet}.
 *
 * @see {@link toCharSet}
 */
export type ToCharSetElement =
	| Character
	| CharacterClassRange
	| Exclude<CharacterSet, StringsUnicodePropertyCharacterSet>
	| ClassRangesCharacterClass;

/**
 * Converts the given element or array of elements into a refa `CharSet`.
 *
 * If an array is given, all the character sets of all elements will be unioned. This means that for any two element `a`
 * and `b`, the results of `toCharSet([a, b])` and `toCharSet(a).union(toCharSet(b))` will be the same.
 *
 * This is guaranteed to be equivalent to `toUnicodeSet(char).chars`.
 */
export function toCharSet(elements: ToCharSetElement | readonly ToCharSetElement[], flags: ReadonlyFlags): CharSet {
	if (!JS.isFlags(flags)) {
		throw new Error("Invalid flags.");
	}

	if (!isReadonlyArray(elements)) {
		return toCharSetSimpleCached(elements, flags);
	}

	if (elements.length === 0) {
		return Chars.empty(flags);
	} else if (elements.length === 1) {
		return toCharSetSimpleCached(elements[0], flags);
	} else {
		return Chars.empty(flags).union(...elements.map(e => toCharSetSimpleCached(e, flags)));
	}
}
function toCharSetSimpleCached(element: ToCharSetElement, flags: Readonly<JS.Flags>): CharSet {
	if (flags instanceof CacheInstance) {
		let cached = flags.toCharSet.get(element);
		if (cached === undefined) {
			cached = JS.parseCharSet(element, flags);
			flags.toCharSet.set(element, cached);
		}
		return cached;
	} else {
		return JS.parseCharSet(element, flags);
	}
}

/**
 * All possible element types that are accepted by {@link toCharSet}.
 *
 * @see {@link toCharSet}
 */
export type ToUnicodeSetElement =
	| ToCharSetElement
	| CharacterClass
	| CharacterSet
	| ClassSetOperand
	| ExpressionCharacterClass["expression"]
	| StringAlternative;

/**
 * Converts the given element or array of elements into a refa `UnicodeSet`.
 *
 * If an array is given, all the character sets of all elements will be unioned. This means that for any two element `a`
 * and `b`, the results of `toUnicodeSet([a, b])` and `toUnicodeSet(a).union(toUnicodeSet(b))` will be the same.
 */
export function toUnicodeSet(
	elements: ToUnicodeSetElement | readonly ToUnicodeSetElement[],
	flags: ReadonlyFlags
): JS.UnicodeSet {
	if (!JS.isFlags(flags)) {
		throw new Error("Invalid flags.");
	}

	if (!isReadonlyArray(elements)) {
		return toUnicodeSetSimpleCached(elements, flags);
	}

	if (elements.length === 0) {
		return JS.UnicodeSet.empty(Chars.maxChar(flags));
	} else if (elements.length === 1) {
		return toUnicodeSetSimpleCached(elements[0], flags);
	} else {
		return JS.UnicodeSet.empty(Chars.maxChar(flags)).union(
			...elements.map(e => toUnicodeSetSimpleCached(e, flags))
		);
	}
}
function toUnicodeSetSimpleCached(element: ToUnicodeSetElement, flags: Readonly<JS.Flags>): JS.UnicodeSet {
	if (flags instanceof CacheInstance) {
		let cached = flags.toUnicodeSet.get(element);
		if (cached === undefined) {
			cached = JS.parseUnicodeSet(element, flags);
			flags.toUnicodeSet.set(element, cached);
		}
		return cached;
	} else {
		return JS.parseUnicodeSet(element, flags);
	}
}

/**
 * Returns whether the given character class/set matches all characters.
 *
 * This is guaranteed to be equivalent to `toUnicodeSet(char).chars.isAll` but is implemented more efficiently.
 */
export function matchesAllCharacters(char: ToUnicodeSetElement, flags: ReadonlyFlags): boolean {
	switch (char.type) {
		case "Character":
		case "ClassStringDisjunction":
		case "StringAlternative":
			return false;

		case "CharacterClassRange":
			return char.min.value === 0 && char.max.value === Chars.maxChar(flags);

		case "CharacterSet":
			if (char.kind === "property") {
				if (char.strings) {
					// are currently no properties of strings that match all characters
					return false;
				}
				return toCharSet(char, flags).isAll;
			} else if (char.kind === "any") {
				return !!flags.dotAll;
			} else {
				return false;
			}

		case "CharacterClass":
			if (char.negate) {
				return char.elements.every(e => matchesNoCharacters(e, flags));
			} else {
				if (char.elements.length === 0) {
					return false;
				} else if (char.elements.length === 1) {
					return matchesAllCharacters(char.elements[0], flags);
				} else {
					return toUnicodeSet(char, flags).chars.isAll;
				}
			}

		case "ExpressionCharacterClass":
			return matchesAllCharacters(char.expression, flags);
		case "ClassIntersection":
			return matchesAllCharacters(char.left, flags) && matchesAllCharacters(char.right, flags);
		case "ClassSubtraction":
			return toUnicodeSet(char, flags).chars.isAll;

		default:
			return assertNever(char);
	}
}
/**
 * Returns whether the given character class/set matches no characters.
 *
 * This is guaranteed to be equivalent to `toUnicodeSet(char).isEmpty` but is implemented more efficiently.
 */
export function matchesNoCharacters(char: ToUnicodeSetElement, flags: ReadonlyFlags): boolean {
	switch (char.type) {
		case "Character":
		case "CharacterClassRange":
		case "ClassStringDisjunction":
		case "StringAlternative":
			// all are guaranteed to match at least one character
			return false;

		case "CharacterSet":
			if (char.kind === "property") {
				if (char.strings) {
					// are currently no properties of strings that match no characters
					return false;
				}
				return toCharSet(char, flags).isEmpty;
			} else {
				return false;
			}

		case "CharacterClass":
			if (char.negate) {
				if (char.elements.length === 0) {
					return false;
				} else if (char.elements.length === 1) {
					return matchesAllCharacters(char.elements[0], flags);
				} else {
					return toUnicodeSet(char, flags).isEmpty;
				}
			} else {
				return char.elements.every(e => matchesNoCharacters(e, flags));
			}

		case "ExpressionCharacterClass":
			return matchesNoCharacters(char.expression, flags);
		case "ClassIntersection":
		case "ClassSubtraction":
			return toUnicodeSet(char, flags).isEmpty;

		default:
			return assertNever(char);
	}
}

/**
 * Returns whether the given character elements contains strings.
 *
 * This is guaranteed to be equivalent to `!toUnicodeSet(char).accept.isEmpty` but is implemented more efficiently.
 */
export function hasStrings(char: ToUnicodeSetElement, flags: ReadonlyFlags): boolean {
	switch (char.type) {
		case "Character":
		case "CharacterClassRange":
			return false;

		case "CharacterSet":
			return char.kind === "property" && char.strings;

		case "CharacterClass":
			if (char.negate || !char.unicodeSets) {
				return false;
			} else {
				return char.elements.some(e => hasStrings(e, flags));
			}

		case "ExpressionCharacterClass":
			return hasStrings(char.expression, flags);
		case "ClassIntersection":
		case "ClassSubtraction":
			return !toUnicodeSet(char, flags).accept.isEmpty;

		case "ClassStringDisjunction":
			return char.alternatives.some(a => hasStrings(a, flags));
		case "StringAlternative":
			return char.elements.length !== 1;

		default:
			return assertNever(char);
	}
}
