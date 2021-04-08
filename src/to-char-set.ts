import { CharSet, JS } from "refa";
import { Character, CharacterClass, CharacterClassRange, CharacterSet } from "regexpp/ast";
import { ReadonlyFlags } from "./flags";
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
 * If an array is given, all the character sets of all elements will be unioned.
 */
export function toCharSet(elements: ToCharSetElement | readonly ToCharSetElement[], flags: ReadonlyFlags): CharSet {
	const positiveElements: (Character | CharacterClassRange | CharacterSet)[] = [];
	const negatedElements: (Character | CharacterClassRange | CharacterSet)[] = [];
	const addElement = (e: Character | CharacterClassRange | CharacterSet | CharacterClass): void => {
		if (e.type === "CharacterClass") {
			if (e.negate) {
				negatedElements.push(...e.elements);
			} else {
				positiveElements.push(...e.elements);
			}
		} else {
			positiveElements.push(e);
		}
	};

	if (Array.isArray(elements)) {
		(elements as readonly ToCharSetElement[]).forEach(addElement);
	} else {
		addElement(elements as ToCharSetElement);
	}

	if (positiveElements.length === 0) {
		return JS.createCharSet(makeRefaCompatible(negatedElements), flags).negate();
	} else if (negatedElements.length === 0) {
		return JS.createCharSet(makeRefaCompatible(positiveElements), flags);
	} else {
		return JS.createCharSet(makeRefaCompatible(positiveElements), flags).union(
			JS.createCharSet(makeRefaCompatible(negatedElements), flags).negate()
		);
	}
}
type IterableItem<T extends Iterable<unknown>> = T extends Iterable<infer I> ? I : never;
function makeRefaCompatible(
	elements: (Character | CharacterClassRange | CharacterSet)[]
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
		return char.min.value === 0 && char.max.value === (flags.unicode ? 0x10ffff : 0xffff);
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
