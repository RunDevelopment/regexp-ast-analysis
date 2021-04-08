import { Character, CharacterClass, CharacterSet, Pattern } from "regexpp/ast";

export function selectSingleChar(pattern: Pattern): Character | CharacterClass | CharacterSet {
	if (pattern.alternatives.length === 1 && pattern.alternatives[0].elements.length === 1) {
		const element = pattern.alternatives[0].elements[0];
		if (element.type === "Character" || element.type === "CharacterClass" || element.type === "CharacterSet") {
			return element;
		}
	}
	throw new Error("Cannot find char in `" + pattern.raw + "`");
}
