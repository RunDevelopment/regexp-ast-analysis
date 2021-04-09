import { CharSet, JS } from "refa";
import { Character, CharacterClass, CharacterClassRange, CharacterSet } from "regexpp/ast";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";
import { MaxChar } from "./max-char";
import { assertNever } from "./util";

/**
 * All possible element types that are accepted by {@link toCharSet}.
 *
 * @see {@link toCharSet}
 */
export type ToCharSetElement = Character | CharacterClassRange | CharacterSet | CharacterClass;

/**
 * Converts the given element or array of elements into a refa {@link CharSet}.
 *
 * If an array is given, all the character sets of all elements will be unioned. This means that for any two element `a`
 * and `b`, the results of `toCharSet([a, b])` and `toCharSet(a).union(toCharSet(b))` will be the same.
 */
export function toCharSet(elements: ToCharSetElement | readonly ToCharSetElement[], flags: ReadonlyFlags): CharSet {
	const { positive, negated } = categorizeElements(elements);

	if (negated) {
		if (positive) {
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
	} else if (positive) {
		return JS.createCharSet(makeRefaCompatible(positive), flags);
	} else {
		return Chars.empty(flags);
	}
}

interface CategorizedElements {
	positive: readonly (Character | CharacterClassRange | CharacterSet)[] | undefined;
	negated: readonly CharacterClass[] | undefined;
}
function categorizeElements(elements: ToCharSetElement | readonly ToCharSetElement[]): CategorizedElements {
	if (Array.isArray(elements)) {
		const all = elements as readonly ToCharSetElement[];
		if (areAllPositive(all)) {
			return { positive: all, negated: undefined };
		} else if (areAllNegated(all)) {
			return { positive: undefined, negated: all };
		} else {
			const positive: (Character | CharacterClassRange | CharacterSet)[] = [];
			const negated: CharacterClass[] = [];

			for (let i = 0, l = all.length; i < l; i++) {
				const e = all[i];
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
	} else {
		const e = elements as ToCharSetElement;
		if (e.type === "CharacterClass") {
			if (e.negate) {
				return { positive: undefined, negated: [e] };
			} else {
				return { positive: e.elements, negated: undefined };
			}
		} else {
			return { positive: [e], negated: undefined };
		}
	}
}
function areAllPositive(
	elements: readonly ToCharSetElement[]
): elements is readonly (Character | CharacterClassRange | CharacterSet)[] {
	for (let i = 0, l = elements.length; i < l; i++) {
		if (elements[i].type === "CharacterClass") {
			return false;
		}
	}
	return true;
}
function areAllNegated(elements: readonly ToCharSetElement[]): elements is readonly CharacterClass[] {
	for (let i = 0, l = elements.length; i < l; i++) {
		const e = elements[i];
		if (e.type !== "CharacterClass" || !e.negate) {
			return false;
		}
	}
	return true;
}

type IterableItem<T extends Iterable<unknown>> = T extends Iterable<infer I> ? I : never;
function makeRefaCompatible(
	elements: readonly (Character | CharacterClassRange | CharacterSet)[]
): IterableItem<Parameters<typeof JS.createCharSet>[0]>[] {
	return elements.map(e => {
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
	});
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
			return JS.createCharSet([char], flags).isAll;
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
			return JS.createCharSet([char], flags).isEmpty;
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
