import { visitRegExpAST } from "regexpp";
import {
	Node,
	Group,
	CapturingGroup,
	Element,
	Alternative,
	LookaroundAssertion,
	Quantifier,
	Pattern,
	CharacterClassElement,
	CharacterClass,
	CharacterClassRange,
	Character,
	RegExpLiteral,
	Flags,
	Backreference,
	CharacterSet,
	EdgeAssertion,
	BranchNode,
} from "regexpp/ast";
import { assertNever } from "./util";

function isInvokeEvery(
	element: Element | Alternative | readonly Alternative[],
	fn: (e: Element | Alternative) => boolean
): boolean {
	if (Array.isArray(element)) {
		const alternatives = element as readonly Alternative[];
		return alternatives.length > 0 && alternatives.every(fn);
	} else {
		return fn(element as Element | Alternative);
	}
}
function isInvokeSome(
	element: Element | Alternative | readonly Alternative[],
	fn: (e: Element | Alternative) => boolean
): boolean {
	if (Array.isArray(element)) {
		return (element as readonly Alternative[]).some(fn);
	} else {
		return fn(element as Element | Alternative);
	}
}
/**
 * Returns whether all (but at least one of the) paths of the given element do not consume characters.
 *
 * If this function returns `true`, then {@link isPotentiallyZeroLength} is guaranteed to return `true`.
 *
 * ## Backreferences
 *
 * This function uses the same condition for backreferences as {@link isEmpty}.
 *
 * ## Relations
 *
 * - `isZeroLength(e) -> isPotentiallyZeroLength(e)`
 * - `isZeroLength(e) -> (getLengthRange(e) !== undefined && getLengthRange(e).max == 0)`
 *
 * @see {@link isPotentiallyZeroLength}
 * @see {@link isEmpty}
 * @see {@link isPotentiallyEmpty}
 * @see {@link getLengthRange}
 */
export function isZeroLength(element: Element | Alternative | readonly Alternative[]): boolean {
	return isInvokeEvery(element, isZeroLengthImpl);
}
function isZeroLengthImpl(element: Element | Alternative): boolean {
	switch (element.type) {
		case "Alternative":
			return element.elements.every(isZeroLengthImpl);

		case "Assertion":
			return true;

		case "Character":
		case "CharacterClass":
		case "CharacterSet":
			return false;

		case "Quantifier":
			return element.max === 0 || isZeroLengthImpl(element.element);

		case "Backreference":
			return isEmptyBackreference(element);

		case "CapturingGroup":
		case "Group":
			return element.alternatives.length > 0 && element.alternatives.every(isZeroLengthImpl);

		default:
			throw assertNever(element);
	}
}
/**
 * Returns whether at least one path of the given element does not consume characters.
 *
 * ## Backreferences
 *
 * This function uses the same condition for backreferences as {@link isPotentiallyEmpty}.
 *
 * ## Relations
 *
 * - `isPotentiallyZeroLength(e) -> (getLengthRange(e) !== undefined && getLengthRange(e).min == 0)`
 *
 * @see {@link isZeroLength}
 * @see {@link isEmpty}
 * @see {@link isPotentiallyEmpty}
 * @see {@link getLengthRange}
 */
export function isPotentiallyZeroLength(element: Element | Alternative | readonly Alternative[]): boolean {
	return isInvokeSome(element, e => isPotentiallyZeroLengthImpl(e, e));
}
function isPotentiallyZeroLengthImpl(e: Element | Alternative, root: Element | Alternative): boolean {
	return impl(e);

	function impl(element: Element | Alternative): boolean {
		switch (element.type) {
			case "Alternative":
				return element.elements.every(impl);

			case "Assertion":
				return true;

			case "Backreference":
				return backreferenceIsPotentiallyEmpty(element, root);

			case "Character":
			case "CharacterClass":
			case "CharacterSet":
				return false;

			case "CapturingGroup":
			case "Group":
				return element.alternatives.some(impl);

			case "Quantifier":
				return element.min === 0 || impl(element.element);

			default:
				throw assertNever(element);
		}
	}
}

/**
 * Returns whether all (but at least one of the) paths of the given element do not consume characters and accept do not
 * assert characters.
 *
 * If this function returns `true`, then {@link isZeroLength} and {@link isPotentiallyEmpty} are guaranteed to return
 * `true`.
 *
 * ## Backreferences
 *
 * A backreferences will only be considered potentially empty, iff it is empty by the definition of
 * {@link isEmptyBackreference}.
 *
 * ## Relations
 *
 * - `isEmpty(e) -> isZeroLength(e)`
 * - `isEmpty(e) -> isPotentiallyEmpty(e)`
 *
 * @see {@link isZeroLength}
 * @see {@link isPotentiallyZeroLength}
 * @see {@link isPotentiallyEmpty}
 * @see {@link getLengthRange}
 */
export function isEmpty(element: Element | Alternative | readonly Alternative[]): boolean {
	return isInvokeEvery(element, isEmptyImpl);
}
function isEmptyImpl(element: Element | Alternative): boolean {
	switch (element.type) {
		case "Alternative":
			return element.elements.every(isEmptyImpl);

		case "Assertion":
			return false;

		case "Backreference":
			return isEmptyBackreference(element);

		case "Character":
		case "CharacterClass":
		case "CharacterSet":
			return false;

		case "CapturingGroup":
		case "Group":
			return element.alternatives.length > 0 && element.alternatives.every(isEmptyImpl);

		case "Quantifier":
			return element.max === 0 || isEmptyImpl(element.element);

		default:
			throw assertNever(element);
	}
}
/**
 * Returns whether at least one path of the given element does not consume characters and accept does not assert
 * characters.
 *
 * ## Backreferences
 *
 * A backreferences will only be considered potentially empty, iff at least one of the following conditions is true:
 *
 * - The backreference is trivially always empty. (see {@link isEmptyBackreference})
 * - The referenced capturing group is a descendant of the given element and at least one of the following conditions is
 *   true:
 *   * The referenced capturing group is potentially zero-length.
 *   * The backreferences is not always after its referenced capturing group.
 *     (see {@link backreferenceAlwaysAfterGroup})
 *
 * ## Relations
 *
 * - `isPotentiallyEmpty(e) -> isPotentiallyZeroLength(e)`
 *
 * @see {@link isZeroLength}
 * @see {@link isPotentiallyZeroLength}
 * @see {@link isEmpty}
 * @see {@link getLengthRange}
 */
export function isPotentiallyEmpty(element: Element | Alternative | readonly Alternative[]): boolean {
	return isInvokeSome(element, isPotentiallyEmptyImpl);
}
function isPotentiallyEmptyImpl(root: Element | Alternative): boolean {
	return impl(root);

	function impl(element: Element | Alternative): boolean {
		switch (element.type) {
			case "Alternative":
				return element.elements.every(impl);

			case "Assertion":
				return false;

			case "Backreference":
				return backreferenceIsPotentiallyEmpty(element, root);

			case "Character":
			case "CharacterClass":
			case "CharacterSet":
				return false;

			case "CapturingGroup":
			case "Group":
				return element.alternatives.some(impl);

			case "Quantifier":
				return element.min === 0 || impl(element.element);

			default:
				throw assertNever(element);
		}
	}
}
function backreferenceIsPotentiallyEmpty(back: Backreference, root: Element | Alternative): boolean {
	if (isEmptyBackreference(back)) {
		return true;
	} else if (hasSomeAncestor(back.resolved, a => a === root)) {
		return !isStrictBackreference(back) || isPotentiallyZeroLengthImpl(back.resolved, root);
	} else {
		return false;
	}
}

/**
 * Returns the type of all possible ancestor nodes of the given node type.
 *
 * @see {@link hasSomeAncestor}
 */
export type Ancestor<T extends Node> = AncestorImpl<T>;
type AncestorImpl<T extends Node> =
	| (T extends CharacterSet ? T["parent"] | AlternativeAncestors : never)
	| (T extends Character ? T["parent"] | AlternativeAncestors : never)
	| (T extends CharacterClassRange ? T["parent"] | AlternativeAncestors : never)
	| (T extends Exclude<Element, Character | CharacterSet> ? AlternativeAncestors : never)
	| (T extends Alternative ? AlternativeAncestors : never)
	| (T extends Pattern ? RegExpLiteral : never)
	| (T extends Flags ? RegExpLiteral : never)
	| (T extends RegExpLiteral ? never : never);
type AlternativeAncestors = Alternative["parent"] | Quantifier | Alternative | RegExpLiteral;

/**
 * Returns whether any of the ancestors of the given node fulfills the given condition.
 *
 * The ancestors will be iterated in the order from closest to farthest.
 * The condition function will not be called on the given node.
 */
export function hasSomeAncestor<T extends Node>(node: T, conditionFn: (ancestor: Ancestor<T>) => boolean): boolean {
	let parent: Ancestor<Node> | null = node.parent;
	while (parent) {
		if (conditionFn(parent as Ancestor<T>)) {
			return true;
		}
		parent = parent.parent;
	}
	return false;
}

/**
 * Returns the type of all possible ancestor nodes of the given node type. This trivially includes the given type.
 *
 * @see {@link hasSomeDescendant}
 */
export type Descendant<T extends Node> = T | DescendantsImpl<T>;
type DescendantsImpl<T extends Node> =
	| (T extends Alternative | CapturingGroup | Group | LookaroundAssertion | Quantifier | Pattern
			? Element | CharacterClassElement
			: never)
	| (T extends CharacterClass ? CharacterClassElement : never)
	| (T extends CharacterClassRange ? Character : never)
	| (T extends RegExpLiteral ? Flags | Pattern | Element | CharacterClassElement : never);
/**
 * Returns whether any of the descendants of the given node fulfill the given condition.
 *
 * The descendants will be iterated in a DFS top-to-bottom manner from left to right with the first node being the
 * given node.
 *
 * This function is short-circuited, so as soon as any `conditionFn` returns `true`, `true` will be returned.
 *
 * @param node
 * @param conditionFn
 * @param descentConditionFn An optional function to decide whether the descendant of the given node will be checked as
 * well.
 */
export function hasSomeDescendant<T extends Node>(
	node: T & Node,
	conditionFn: (descendant: Descendant<T>) => boolean,
	descentConditionFn?: (descendant: Descendant<T>) => boolean
): boolean {
	if (conditionFn(node)) {
		return true;
	}

	if (descentConditionFn && !descentConditionFn(node)) {
		return false;
	}

	switch (node.type) {
		case "Alternative":
			return node.elements.some(e => hasSomeDescendant(e, conditionFn, descentConditionFn));
		case "Assertion":
			if (node.kind === "lookahead" || node.kind === "lookbehind") {
				return node.alternatives.some(a => hasSomeDescendant(a, conditionFn, descentConditionFn));
			}
			return false;
		case "CapturingGroup":
		case "Group":
		case "Pattern":
			return node.alternatives.some(a => hasSomeDescendant(a, conditionFn, descentConditionFn));
		case "CharacterClass":
			return node.elements.some(e => hasSomeDescendant(e, conditionFn, descentConditionFn));
		case "CharacterClassRange":
			return (
				hasSomeDescendant(node.min, conditionFn, descentConditionFn) ||
				hasSomeDescendant(node.max, conditionFn, descentConditionFn)
			);
		case "Quantifier":
			return hasSomeDescendant(node.element, conditionFn, descentConditionFn);
		case "RegExpLiteral":
			return (
				hasSomeDescendant(node.pattern, conditionFn, descentConditionFn) ||
				hasSomeDescendant(node.flags, conditionFn, descentConditionFn)
			);
	}
	return false;
}

/**
 * Returns the one-based number of the given capturing group.
 *
 * This is the number needed to refer to the capturing group via backreferences.
 */
export function getCapturingGroupNumber(group: CapturingGroup): number {
	let found = 0;
	try {
		visitRegExpAST(getPattern(group), {
			onCapturingGroupEnter(node) {
				found++;
				if (node === group) {
					// throw an error to end early
					throw new Error();
				}
			},
		});
		throw new Error("Unable to find the given capturing group in its parent pattern.");
	} catch (error) {
		return found;
	}
}

/**
 * Returns the pattern node of the JS RegExp of a given node.
 *
 * This operation is guaranteed to always success for all node types except for flags nodes. Flags nodes have an
 * optional `parent` which, if not set, means that this function can't access the pattern node. If the function can't
 * access the pattern node from a flags node, an error will be thrown.
 */
export function getPattern(node: Node): Pattern {
	switch (node.type) {
		case "RegExpLiteral":
			return node.pattern;
		case "Pattern":
			return node;
		case "Flags":
			if (node.parent) {
				return node.parent.pattern;
			} else {
				throw new Error("Unable to find the pattern of flags without a RegExp literal.");
			}
		default: {
			let p:
				| LookaroundAssertion
				| Quantifier
				| Group
				| CapturingGroup
				| CharacterClass
				| Alternative
				| CharacterClassRange
				| Pattern = node.parent;
			while (p.type !== "Pattern") {
				p = p.parent;
			}
			return p;
		}
	}
}

/**
 * The correct matching direction of alternatives. This can be either `ltr` (left to right) or `rtl` (right to left).
 *
 * `ltr` is the matching direction of lookaheads and the default matching direction of JavaScript RegExps. `rtl` is the
 * matching direction of lookbehinds.
 *
 * The current matching direction of an element is determined by the closest lookaround (lookahead or lookbehind)
 * ancestor. If the closest lookaround ancestor is a lookahead, the matching direction is `ltr`. Likewise, if it's a
 * lookbehind, it's `rtl`. If an element is not a descendant of a lookaround, the default matching direction `ltr` is
 * assumed.
 *
 * @see {@link getMatchingDirection}
 * @see {@link invertMatchingDirection}
 * @see {@link assertionKindToMatchingDirection}
 */
export type MatchingDirection = "ltr" | "rtl";

/**
 * Returns the direction which which the given node will be matched relative to the closest parent alternative.
 *
 * If the given node is a lookaround, then the result of `getMatchingDirection(lookaround)` will be the same as
 * `getMatchingDirection(lookaround.parent)`.
 */
export function getMatchingDirection(node: Node): MatchingDirection {
	let closestLookaround: LookaroundAssertion | undefined;
	hasSomeAncestor(node, a => {
		if (a.type === "Assertion") {
			closestLookaround = a;
			return true;
		}
		return false;
	});

	if (closestLookaround === undefined) {
		// left-to-right matching is assumed
		return "ltr";
	} else if (closestLookaround.kind === "lookahead") {
		return "ltr";
	} else {
		return "rtl";
	}
}
/**
 * Returns the opposite matching direction of the given matching direction.
 *
 * If `ltr` is given, `rtl` will be returned and vise versa.
 */
export function invertMatchingDirection(direction: MatchingDirection): MatchingDirection {
	return direction === "ltr" ? "rtl" : "ltr";
}
/**
 * Converts a given assertion kind into a matching direction.
 *
 * For lookaheads and lookbehinds, the returned matching direction will be the matching direction of their children.
 * I.e. the result of `lookahead` is `ltr` and the result of `lookbehind` is `rtl`.
 *
 * For edge assertions (`^` and `$`), the returned value is the direction of the character the edge assertion asserts.
 * I.e. the result of `^` is `rtl` (because it asserts the previous character) and the result of `$` is `ltr` (because
 * it asserts the next character).
 */
export function getMatchingDirectionFromAssertionKind(
	kind: LookaroundAssertion["kind"] | EdgeAssertion["kind"]
): MatchingDirection {
	return kind === "end" || kind === "lookahead" ? "ltr" : "rtl";
}

/**
 * Returns whether the given backreference will always be replaced with the empty string.
 *
 * There are two reasons why a backreference might always be replaced with the empty string:
 *
 * 1. The referenced capturing group does not consume characters.
 *
 *    This is the trivial case. If the referenced capturing group never consumes any characters, then a backreference to
 *    that group must be replaced with the empty string.
 *
 *    E.g. `/(\b)a\1/`
 *
 * 2. The backreference is not after the referenced capturing group.
 *
 *    A backreference can only be replaced with a non-empty string if the referenced capturing group has captured text
 *    before the backreference is matched. There are multiple reasons why the capturing group might be unable to capture
 *    text before a backreference to it is reached.
 *
 *    - The capturing group might be in a different alternative. E.g. `/(a)b|\1/`.
 *    - The backreference might be *inside* the capturing group. E.g. `/(a\1)/`.
 *    - The backreference might be before the capturing group. E.g. `/\1(a)/`, `/(?:\1(a))+/`, `/(?<=(a)\1)b/`
 */
export function isEmptyBackreference(backreference: Backreference): boolean {
	const group = backreference.resolved;

	if (hasSomeAncestor(backreference, a => a === group)) {
		// if the backreference is element of the referenced group
		return true;
	}

	if (isZeroLength(group)) {
		// If the referenced group can only match doesn't consume characters, then it can only capture the empty
		// string.
		return true;
	}

	// Now for the hard part:
	// If there exists a path through the regular expression which connect the group and the backreference, then
	// the backreference can capture the group iff we only move up, down, or right relative to the group.

	function findBackreference(node: Element): boolean {
		const parent = node.parent;

		switch (parent.type) {
			case "Alternative": {
				// if any elements right to the given node contain or are the backreference, we found it.
				const index = parent.elements.indexOf(node);

				// we have to take the current matching direction into account
				let next;
				if (getMatchingDirection(node) === "ltr") {
					// the next elements to match will be right to the given node
					next = parent.elements.slice(index + 1);
				} else {
					// the next elements to match will be left to the given node
					next = parent.elements.slice(0, index);
				}

				if (next.some(e => hasSomeDescendant(e, d => d === backreference))) {
					return true;
				}

				// no luck. let's go up!
				const parentParent = parent.parent;
				if (parentParent.type === "Pattern") {
					// can't go up.
					return false;
				} else {
					return findBackreference(parentParent);
				}
			}

			case "Quantifier":
				return findBackreference(parent);

			default:
				throw new Error("What happened?");
		}
	}

	return !findBackreference(group);
}

/**
 * Returns whether the given backreference is a strict backreference.
 *
 * Strict backreferences are backreferences that are always matched __after__ the referenced group was matched. If there
 * exists any path that goes through a backreference but not through the referenced capturing group, that backreference
 * is not strict.
 *
 * ## Examples
 *
 * In the follow examples, `\1` is a strict backreference:
 *
 * - `/(a)\1/`
 * - `/(a)(?:b|\1)/`
 * - `/(a)\1?/`
 * - `/(?<=\1(a))b/`
 *
 * In the follow examples, `\1` is not a strict backreference:
 *
 * - `/(a)|\1/`
 * - `/(?:(a)|b)\1/`
 * - `/(a)?\1/`
 * - `/(?<=(a)\1)b/`
 */
export function isStrictBackreference(backreference: Backreference): boolean {
	const group = backreference.resolved;

	if (hasSomeAncestor(backreference, a => a === group)) {
		// if the backreference is element of the referenced group
		return false;
	}

	function findBackreference(node: Element): boolean {
		const parent = node.parent;

		switch (parent.type) {
			case "Alternative": {
				// if any elements right to the given node contain or are the backreference, we found it.
				const index = parent.elements.indexOf(node);

				// we have to take the current matching direction into account
				let next;
				if (getMatchingDirection(node) === "ltr") {
					// the next elements to match will be right to the given node
					next = parent.elements.slice(index + 1);
				} else {
					// the next elements to match will be left to the given node
					next = parent.elements.slice(0, index);
				}

				if (next.some(e => hasSomeDescendant(e, d => d === backreference))) {
					return true;
				}

				// no luck. let's go up!
				const parentParent = parent.parent;
				if (parentParent.type === "Pattern") {
					// can't go up.
					return false;
				} else {
					if (parentParent.alternatives.length > 1) {
						// e.g.: (?:a|(a))+b\1
						return false;
					}
					return findBackreference(parentParent);
				}
			}

			case "Quantifier":
				if (parent.min === 0) {
					// e.g.: (a+)?b\1
					return false;
				}
				return findBackreference(parent);

			default:
				throw new Error("What happened?");
		}
	}

	return findBackreference(group);
}

/**
 * The length range of string accepted. All string that are accepted by have a length of `min <= length <= max`.
 *
 * @see {@link getLengthRange}
 */
export interface LengthRange {
	readonly min: number;
	readonly max: number;
}
const ZERO_LENGTH_RANGE: LengthRange = { min: 0, max: 0 };
const ONE_LENGTH_RANGE: LengthRange = { min: 1, max: 1 };
/**
 * Returns how many characters the given element can consume at most and has to consume at least.
 *
 * If `undefined` is returned, then the given element can't consume any characters.
 *
 * **Note:** `undefined` is only returned for empty alternative arrays. All characters classes/sets are assumed to
 * consume at least one characters and all assertions are assumed to have some accepting path.
 *
 * ## Backreferences
 *
 * While {@link isPotentiallyEmpty} generally assumes the worst-case for backreferences that references capturing group
 * outside the given element, this function does not/cannot. The length range of a backreference only depends on the
 * referenced capturing group and the relative positions of the backreference and the capturing group within the
 * pattern. It does not depend on the given element.
 *
 * This is an important distinction because it means that `isPotentiallyEmpty(e) -> getLengthRange(e).min == 0` is
 * guaranteed but `getLengthRange(e).min == 0 -> isPotentiallyEmpty(e)` is only guaranteed if `e` does not contain
 * backreferences.
 *
 * @see {@link isZeroLength}
 * @see {@link isPotentiallyZeroLength}
 * @see {@link isEmpty}
 * @see {@link isPotentiallyEmpty}
 */
export function getLengthRange(element: Element | Alternative | readonly Alternative[]): LengthRange | undefined {
	if (Array.isArray(element)) {
		return getLengthRangeAlternativesImpl(element as readonly Alternative[]);
	} else {
		return getLengthRangeElementImpl(element as Element | Alternative);
	}
}
function getLengthRangeAlternativesImpl(alternatives: readonly Alternative[]): LengthRange | undefined {
	let min = Infinity;
	let max = 0;

	for (const a of alternatives) {
		const eRange = getLengthRangeElementImpl(a);
		if (eRange) {
			min = Math.min(min, eRange.min);
			max = Math.max(max, eRange.max);
		}
	}

	if (min > max) {
		return undefined;
	} else {
		return { min, max };
	}
}
function getLengthRangeElementImpl(element: Element | Alternative): LengthRange | undefined {
	switch (element.type) {
		case "Assertion":
			return ZERO_LENGTH_RANGE;

		case "Character":
		case "CharacterClass":
		case "CharacterSet":
			return ONE_LENGTH_RANGE;

		case "Quantifier": {
			if (element.max === 0) {
				return ZERO_LENGTH_RANGE;
			}
			const elementRange = getLengthRangeElementImpl(element.element);
			if (!elementRange) {
				return element.min === 0 ? ZERO_LENGTH_RANGE : undefined;
			} else if (elementRange.max === 0) {
				return ZERO_LENGTH_RANGE;
			} else {
				return { min: elementRange.min * element.min, max: elementRange.max * element.max };
			}
		}

		case "Alternative": {
			let min = 0;
			let max = 0;

			for (const e of element.elements) {
				const eRange = getLengthRangeElementImpl(e);
				if (!eRange) {
					return undefined;
				}
				min += eRange.min;
				max += eRange.max;
			}

			return { min, max };
		}

		case "CapturingGroup":
		case "Group":
			return getLengthRangeAlternativesImpl(element.alternatives);

		case "Backreference": {
			if (isEmptyBackreference(element)) {
				return ZERO_LENGTH_RANGE;
			} else {
				const resolvedRange = getLengthRangeElementImpl(element.resolved);
				if (!resolvedRange) {
					if (isStrictBackreference(element)) {
						return ZERO_LENGTH_RANGE;
					} else {
						return undefined;
					}
				} else if (resolvedRange.min > 0 && !isStrictBackreference(element)) {
					return { min: 0, max: resolvedRange.max };
				} else {
					return resolvedRange;
				}
			}
		}

		default:
			throw assertNever(element);
	}
}

/**
 * Returns the closest ancestor of the given nodes.
 *
 * If the two nodes are the same node, the given node will be returned.
 */
export function getClosestAncestor<A extends Node, B extends Node>(a: A, b: B): (A | Ancestor<A>) & (B | Ancestor<B>);
export function getClosestAncestor(a: Node, b: Node): Node {
	if (a === b) {
		return a;
	} else if (a.parent && a.parent === b.parent) {
		return a.parent;
	} else if (hasSomeAncestor(a, an => an === b)) {
		return b;
	} else if (hasSomeAncestor(b, an => an === a)) {
		return a;
	} else {
		if (a.parent && b.parent) {
			const aAncestors: BranchNode[] = [];
			const bAncestors: BranchNode[] = [];

			for (let an: BranchNode | null = a.parent; an; an = an.parent) {
				aAncestors.push(an);
			}
			for (let an: BranchNode | null = b.parent; an; an = an.parent) {
				bAncestors.push(an);
			}

			while (aAncestors.length && bAncestors.length) {
				if (aAncestors[aAncestors.length - 1] === bAncestors[bAncestors.length - 1]) {
					aAncestors.pop();
					bAncestors.pop();
				} else {
					break;
				}
			}

			if (aAncestors.length === 0) {
				return a.parent;
			}
			if (bAncestors.length === 0) {
				return b.parent;
			}

			const p = aAncestors.pop()!.parent;
			if (p) {
				return p;
			}
		}
		throw new Error("The two nodes are not part of the same tree.");
	}
}

/**
 * Returns how many times the regex engine can match the given element at most.
 *
 * This method will treat elements inside lookarounds differently. Elements inside lookarounds will ignore everything
 * outside the lookaround.
 *
 * ## Examples
 *
 * - `/a?/`: This will return 1 for `a`.
 * - `/a+/`: This will return infinity for `a` and 1 for the quantifier `a+`.
 * - `/((a{0,8}){0,8}){0,8}/`: This will return 512 for `a`.
 * - `/(ba{0})+/`: This will return 0 for `a` and infinity for the quantifier `a{0}`.
 * - `/(\w(?!a{3}b))+/`: This will return 3 for `a` because `a` is inside a lookaround and therefore unaffected by the
 *   `(\w(?!a{3}b)))+` quantifier.
 */
export function getEffectiveMaximumRepetition(element: Node): number {
	let max = 1;
	for (let n: Node | null = element.parent; n; n = n.parent) {
		if (n.type === "Quantifier") {
			max *= n.max;
			if (max === 0) {
				return 0;
			}
		} else if (n.type === "Assertion") {
			break;
		}
	}
	return max;
}
