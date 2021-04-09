import {} from "regexpp";
import { Alternative, CapturingGroup, Character, CharacterClass, CharacterSet, Element, Pattern } from "regexpp/ast";
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

export function selectNamedGroups(pattern: Pattern, name: RegExp = /^/): CapturingGroup[] {
	return select(
		pattern,
		(e): e is CapturingGroup => e.type === "CapturingGroup" && e.name !== null && name.test(e.name)
	);
}

export function selectFirstWithRaw(pattern: Pattern, raw: string): Element | Alternative {
	let result: Element | Alternative | undefined;

	hasSomeDescendant(pattern, e => {
		if (e.type !== "Pattern" && e.type !== "CharacterClassRange" && e.raw === raw) {
			result = e;
			return true;
		}
		return false;
	});

	if (result) {
		return result;
	} else {
		throw new Error(`Cannot find element with raw \`${raw}\` in /${pattern.raw}/.`);
	}
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
