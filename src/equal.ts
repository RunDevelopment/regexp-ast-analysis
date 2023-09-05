import {
	Node,
	Group,
	CapturingGroup,
	Alternative,
	LookaroundAssertion,
	Quantifier,
	Pattern,
	CharacterClass,
	CharacterClassRange,
	Character,
	RegExpLiteral,
	Flags,
	Backreference,
	CharacterSet,
	Assertion,
	ClassStringDisjunction,
	StringAlternative,
	ExpressionCharacterClass,
	ClassSubtraction,
	ClassIntersection,
} from "@eslint-community/regexpp/ast";
import { isStrictBackreference } from "./basic";
import { assertNever } from "./util";

/**
 * Returns whether two nodes are structurally equivalent.
 *
 * If two elements are structurally equivalent, they must also semantically equivalent. However, two semantically
 * equivalent elements might not be structurally equivalent (e.g. `/[ab]/` !=<sub>struct</sub> `/[ba]/`).
 */
export function structurallyEqual(x: Node | null, y: Node | null): boolean {
	if (x == y) {
		return true;
	}
	if (!x || !y || x.type != y.type) {
		return false;
	}

	switch (x.type) {
		case "Alternative":
		case "StringAlternative": {
			const other = y as Alternative | StringAlternative;
			return manyAreStructurallyEqual(x.elements, other.elements);
		}

		case "Assertion": {
			const other = y as Assertion;

			if (x.kind === other.kind) {
				if (x.kind === "lookahead" || x.kind === "lookbehind") {
					const otherLookaround = y as LookaroundAssertion;
					return (
						x.negate === otherLookaround.negate &&
						manyAreStructurallyEqual(x.alternatives, otherLookaround.alternatives)
					);
				} else {
					return x.raw === other.raw;
				}
			}
			return false;
		}

		case "Backreference": {
			const other = y as Backreference;
			return (
				structurallyEqual(x.resolved, other.resolved) &&
				isStrictBackreference(x) == isStrictBackreference(other)
			);
		}

		case "Character": {
			const other = y as Character;
			return x.value === other.value;
		}

		case "CharacterClass": {
			const other = y as CharacterClass;
			return (
				x.negate === other.negate &&
				x.unicodeSets === other.unicodeSets &&
				manyAreStructurallyEqual(x.elements, other.elements)
			);
		}

		case "CharacterClassRange": {
			const other = y as CharacterClassRange;
			return structurallyEqual(x.min, other.min) && structurallyEqual(x.max, other.max);
		}

		case "CharacterSet": {
			const other = y as CharacterSet;

			if (x.kind === "property" && other.kind === "property") {
				return x.negate === other.negate && x.key === other.key && x.value === other.value;
			} else {
				return x.raw === other.raw;
			}
		}

		case "ExpressionCharacterClass": {
			const other = y as ExpressionCharacterClass;
			return x.negate === other.negate && structurallyEqual(x.expression, other.expression);
		}

		case "ClassIntersection":
		case "ClassSubtraction": {
			const other = y as ClassIntersection | ClassSubtraction;
			return structurallyEqual(x.left, other.left) && structurallyEqual(x.right, other.right);
		}

		case "Flags": {
			const other = y as Flags;
			return (
				x.dotAll === other.dotAll &&
				x.global === other.global &&
				x.ignoreCase === other.ignoreCase &&
				x.multiline === other.multiline &&
				x.sticky === other.sticky &&
				x.unicode === other.unicode &&
				x.unicodeSets === other.unicodeSets
			);
		}

		case "ClassStringDisjunction":
		case "CapturingGroup":
		case "Group":
		case "Pattern": {
			const other = y as CapturingGroup | Group | Pattern | ClassStringDisjunction;
			return manyAreStructurallyEqual(x.alternatives, other.alternatives);
		}

		case "Quantifier": {
			const other = y as Quantifier;
			return (
				x.min === other.min &&
				x.max === other.max &&
				x.greedy === other.greedy &&
				structurallyEqual(x.element, other.element)
			);
		}

		case "RegExpLiteral": {
			const other = y as RegExpLiteral;
			return structurallyEqual(x.flags, other.flags) && structurallyEqual(x.pattern, other.pattern);
		}

		default:
			throw assertNever(x);
	}
}
function manyAreStructurallyEqual(a: readonly Node[], b: readonly Node[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (!structurallyEqual(a[i], b[i])) {
			return false;
		}
	}
	return true;
}
