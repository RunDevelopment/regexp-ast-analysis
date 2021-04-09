import {} from "regexpp";
import { Character, CharacterClass, CharacterSet, Pattern } from "regexpp/ast";
import { Descendant, hasSomeDescendant } from "../../src";

export function select<T extends Descendant<Pattern>>(
	pattern: Pattern,
	conditionFn: (element: Descendant<Pattern>) => element is T
): T[] {
	const result: T[] = [];

	hasSomeDescendant(pattern, e => {
		if (conditionFn(e)) {
			result.push(e);
		}
		return false;
	});

	return result;
}

export function selectSingleChar(pattern: Pattern): Character | CharacterClass | CharacterSet {
	if (pattern.alternatives.length === 1 && pattern.alternatives[0].elements.length === 1) {
		const element = pattern.alternatives[0].elements[0];
		if (element.type === "Character" || element.type === "CharacterClass" || element.type === "CharacterSet") {
			return element;
		}
	}
	throw new Error("Cannot find char in `" + pattern.raw + "`");
}
