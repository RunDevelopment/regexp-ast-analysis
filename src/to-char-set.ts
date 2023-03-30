import { CharSet, JS } from "refa";
import { Character, CharacterClass, CharacterClassRange, CharacterSet } from "@eslint-community/regexpp/ast";
import { CacheInstance } from "./cache";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";
import { MaxChar } from "./max-char";
import { assertNever, isReadonlyArray } from "./util";

/**
 * All possible element types that are accepted by {@link toCharSet}.
 *
 * @see {@link toCharSet}
 */
export type ToCharSetElement = Character | CharacterClassRange | CharacterSet | CharacterClass;

/**
 * Converts the given element or array of elements into a refa CharSet.
 *
 * If an array is given, all the character sets of all elements will be unioned. This means that for any two element `a`
 * and `b`, the results of `toCharSet([a, b])` and `toCharSet(a).union(toCharSet(b))` will be the same.
 */
export function toCharSet(elements: ToCharSetElement | readonly ToCharSetElement[], flags: ReadonlyFlags): CharSet {
	if (!isReadonlyArray(elements)) {
		return toCharSetSimpleCached(elements, flags);
	} else if (elements.length === 1) {
		return toCharSetSimpleCached(elements[0], flags);
	}

	const { positive, negated } = categorizeElements(elements);

	if (negated.length) {
		if (positive.length) {
			return JS.createCharSet(makeRefaCompatible(positive), flags).union(
				...negated.map(c => JS.createCharSet(makeRefaCompatible(c.elements), flags).negate())
			);
		} else {
			if (negated.length === 1) {
				return JS.createCharSet(makeRefaCompatible(negated[0].elements), flags).negate();
			} else {
				return Chars.empty(flags).union(
					...negated.map(c => JS.createCharSet(makeRefaCompatible(c.elements), flags).negate())
				);
			}
		}
	} else if (positive.length) {
		return JS.createCharSet(makeRefaCompatible(positive), flags);
	} else {
		return Chars.empty(flags);
	}
}

function toCharSetSimpleCached(element: ToCharSetElement, flags: ReadonlyFlags): CharSet {
	if (flags instanceof CacheInstance) {
		let cached = flags.toCharSet.get(element);
		if (cached === undefined) {
			cached = toCharSetSimple(element, flags);
			flags.toCharSet.set(element, cached);
		}
		return cached;
	} else {
		return toCharSetSimple(element, flags);
	}
}
function toCharSetSimple(element: ToCharSetElement, flags: ReadonlyFlags): CharSet {
	if (element.type === "CharacterClass") {
		const cs = JS.createCharSet(makeRefaCompatible(element.elements), flags);
		return element.negate ? cs.negate() : cs;
	}

	return JS.createCharSet([toRefaCharElement(element)], flags);
}

interface CategorizedElements {
	positive: readonly (Character | CharacterClassRange | CharacterSet)[];
	negated: readonly CharacterClass[];
}
function categorizeElements(elements: readonly ToCharSetElement[]): CategorizedElements {
	const positive: (Character | CharacterClassRange | CharacterSet)[] = [];
	const negated: CharacterClass[] = [];

	for (const e of elements) {
		if (e.type === "CharacterClass") {
			if (e.negate) {
				negated.push(e);
			} else {
				positive.push(...e.elements);
			}
		} else {
			positive.push(e);
		}
	}

	return { positive, negated };
}

type IterableItem<T extends Iterable<unknown>> = T extends Iterable<infer I> ? I : never;
type RefaChar = IterableItem<Parameters<typeof JS.createCharSet>[0]>;
function makeRefaCompatible(elements: readonly (Character | CharacterClassRange | CharacterSet)[]): RefaChar[] {
	return elements.map(toRefaCharElement);
}
function toRefaCharElement(e: Character | CharacterClassRange | CharacterSet): RefaChar {
	switch (e.type) {
		case "Character":
			return e.value;
		case "CharacterClassRange":
			return { min: e.min.value, max: e.max.value };
		case "CharacterSet":
			return e;
		default:
			throw assertNever(e);
	}
}

/**
 * Returns whether the given character class/set matches all characters.
 *
 * This is guaranteed to be equivalent to `toCharSet(char).isAll` but is implemented more efficiently.
 */
export function matchesAllCharacters(char: ToCharSetElement, flags: ReadonlyFlags): boolean {
	if (char.type === "Character") {
		return false;
	} else if (char.type === "CharacterClassRange") {
		return char.min.value === 0 && char.max.value === (flags.unicode ? MaxChar.UNICODE : MaxChar.UTF16);
	} else if (char.type === "CharacterSet") {
		if (char.kind === "property") {
			return toCharSet(char, flags).isAll;
		} else if (char.kind === "any") {
			return !!flags.dotAll;
		} else {
			return false;
		}
	} else {
		if (char.negate && char.elements.length === 0) {
			return true;
		} else {
			if (char.negate) {
				return toCharSet(char.elements, flags).isEmpty;
			} else {
				return toCharSet(char.elements, flags).isAll;
			}
		}
	}
}
/**
 * Returns whether the given character class/set matches no characters.
 *
 * This is guaranteed to be equivalent to `toCharSet(char).isEmpty` but is implemented more efficiently.
 */
export function matchesNoCharacters(char: ToCharSetElement, flags: ReadonlyFlags): boolean {
	if (char.type === "Character" || char.type === "CharacterClassRange") {
		// both are guaranteed to match at least one character
		return false;
	} else if (char.type === "CharacterSet") {
		if (char.kind === "property") {
			return toCharSet(char, flags).isEmpty;
		} else {
			return false;
		}
	} else {
		if (!char.negate && char.elements.length === 0) {
			return true;
		} else {
			if (char.negate) {
				return toCharSet(char.elements, flags).isAll;
			} else {
				return toCharSet(char.elements, flags).isEmpty;
			}
		}
	}
}
