import { Alternative, Element, Pattern } from "@eslint-community/regexpp/ast";
import { CharSet } from "refa";
import { ReadonlyFlags } from "./flags";
import { hasSomeDescendant, isEmptyBackreference } from "./basic";
import { Chars } from "./chars";
import { toUnicodeSet } from "./to-char-set";

export interface ConsumedChars {
	chars: CharSet;
	/**
	 * Whether `char` is exact.
	 *
	 * If `false`, then `char` is only guaranteed to be a superset of the
	 * actually possible characters.
	 */
	exact: boolean;
}

/**
 * Returns the union of all characters that can possibly be consumed by the
 * given element.
 */
export function getConsumedChars(element: Element | Pattern | Alternative, flags: ReadonlyFlags): ConsumedChars {
	const sets: CharSet[] = [];
	let exact = true;

	// we misuse hasSomeDescendant to iterate all relevant elements
	hasSomeDescendant(
		element,
		d => {
			if (
				d.type === "Character" ||
				d.type === "CharacterClass" ||
				d.type === "CharacterSet" ||
				d.type === "ExpressionCharacterClass"
			) {
				const c = toUnicodeSet(d, flags);

				sets.push(c.chars);
				if (!c.accept.isEmpty) {
					const chars = new Set<CharSet>();
					for (const word of c.accept.wordSets) {
						for (const char of word) {
							chars.add(char);
						}
					}
					sets.push(Chars.empty(flags).union(...chars));
				}

				exact = exact && !c.isEmpty;
			} else if (d.type === "Backreference" && !isEmptyBackreference(d, flags)) {
				const c = getConsumedChars(d.resolved, flags);
				sets.push(c.chars);
				exact = exact && c.exact && c.chars.size < 2;
			}

			// always continue to the next element
			return false;
		},
		// don't go into assertions
		d => {
			if (d.type === "CharacterClass" || d.type === "ExpressionCharacterClass") {
				return false;
			}
			if (d.type === "Assertion") {
				exact = false;
				return false;
			}
			return true;
		}
	);

	const chars = Chars.empty(flags).union(...sets);

	return { chars, exact };
}
