import { Alternative, Element, Quantifier } from "regexpp/ast";
import { getMatchingDirectionFromAssertionKind, getMatchingDirection, MatchingDirection } from "./basic";
import { assertNever } from "./util";

/**
 * A set of operations that determine how state is propagated and changed.
 *
 * @see {@link followPaths}
 */
export interface FollowOperations<S> {
	/**
	 * Split off a new path from the given one.
	 *
	 * This function should not modify the given state.
	 *
	 * If the state is immutable, then `fork` may be implemented as the identify function in regard to `state`. If the
	 * function is omitted, it will default to the identify function.
	 *
	 * If the state is mutable, then `fork` must be implemented.
	 *
	 * @default x => x
	 */
	fork?: (state: S, direction: MatchingDirection) => S;
	/**
	 * Joins any number of paths to create a combined path.
	 */
	join(states: S[], direction: MatchingDirection): S;
	/**
	 * This function is called when dealing to general lookarounds (it will __not__ be called for predefined assertion -
	 * `^`, `$`, `\b`, `\B`).
	 */
	assert?: (state: S, direction: MatchingDirection, assertion: S, assertionDirection: MatchingDirection) => S;

	enter?: (element: Element, state: S, direction: MatchingDirection) => S;
	leave?: (element: Element, state: S, direction: MatchingDirection) => S;
	endPath?: (state: S, direction: MatchingDirection, reason: "pattern" | "assertion") => S;

	/**
	 * Whether the current path should go into the given element (return `true`) or whether it should be skipped
	 * (return `false`). If the element is skipped, the given state will not be changed and passed as-is to the `leave`
	 * function.
	 *
	 * You shouldn't modify state in this function. Modify state in the `enter` function instead.
	 */
	continueInto?: (element: Element, state: S, direction: MatchingDirection) => boolean;
	/**
	 * Whether the current path should continue after the given element (return `true`) or whether all elements that
	 * follow this element should be skipped (return `false`).
	 *
	 * If the current path is a fork path, then only the elements until the fork is joined will be skipped. A stopped
	 * fork path will be joined with all other forks like normal.
	 *
	 * You shouldn't modify state in this function. Modify state in the `leave` function instead.
	 */
	continueAfter?: (element: Element, state: S, direction: MatchingDirection) => boolean;
}

/**
 * This function goes to all elements reachable from the given `start` element.
 *
 * ## Paths
 *
 * The function uses _paths_. A path is an [execution path](https://en.wikipedia.org/wiki/Symbolic_execution) that
 * describes a sequence of regex elements.
 *
 * I.e. there are two paths to go from `a` to `b` in the pattern `/a(\w|dd)b/`. The first path is `a \w b` and the
 * second path is `a d d b`.
 *
 * However, the problem with paths is that there can be exponentially many because of combinatorial explosion (e.g. the
 * pattern `/(a|b)(a|b)(a|b)(a|b)(a|b)/` has 32 paths). To solve this problem, paths can be _joined_ together again.
 *
 * I.e. in the pattern `/a(\w|dd)b/`, first element of all paths will be `a`. After `a`, the path splits into two. We
 * call each of the split paths a _fork_. The two forks will be `a ( \w` and `a ( d d`. The `(` is used to indicate that
 * a fork was made. Since both paths come together after the group ends, they will be _joined_. The joined path of
 * `a ( \w` and `a ( d d` will be written as `a ( \w | d d )`. The `)` is used to indicate that forks have been joined.
 * The final path will be `a ( \w | d d ) b`.
 *
 * This method of forking and joining works for alternations but it won't work for quantifiers. This is why quantifiers
 * will be treated as single elements that can be entered. By default, a quantifier `q` will be interpreted as `( q | )`
 * if its minimum is zero and as `( q )` otherwise.
 *
 * I.e. in the pattern `/ab*c/`, the paths are `a ( b* | ) c`, and in `/ab+c/`, the path is `a b+ c`.
 *
 * ### State
 *
 * Paths are thought of as a sequence of elements and they are represented by state (type parameter `S`). All operations
 * that fork, join, or assert paths will operate on state and not a sequence of elements.
 *
 * State allows operations to be implemented more efficiently and ensures that only necessary data is passed around.
 * An analysis of paths usually tracks properties and analyses how these properties change, the current value of these
 * properties is state.
 *
 * ## Operations
 *
 * Operations act upon state and are specific to the type of state. They define how state changes when
 * entering/leaving/asserting elements and how paths fork, join, and continue.
 *
 * ### Operation sequence
 *
 * To follow all paths, two methods are necessary: one method that enters elements and one that determines the next
 * element. These methods will be called `Enter` and `Next` respectively. These methods will call the given operations
 * roughly like this:
 *
 * ```text
 * function Enter(element, state):
 *     operations.enter
 *     if operations.continueInto:
 *         if element.type == GROUP:
 *             operations.join(
 *                 element.alternatives.map(e => Enter(e, operations.fork(state)))
 *             )
 *         if element.type == QUANTIFIER:
 *             if element.max == 0:
 *                 // do nothing
 *             else if element.min == 0:
 *                 operations.join([
 *                     state,
 *                     Enter(quantifier, operations.fork(state))
 *                 ])
 *             else:
 *                 Enter(quantifier, operations.fork(state))
 *         if element.type == LOOKAROUND:
 *             operations.assert(
 *                 state,
 *                 operations.join(
 *                     element.alternatives.map(e => Enter(e, operations.fork(state)))
 *                 )
 *             )
 *     operations.leave
 *     Next(element, state)
 *
 * function Next(element, state):
 *     if operations.continueAfter:
 *         if noNextElement:
 *             operations.endPath
 *         else:
 *             Enter(nextElement, state)
 * ```
 *
 * (This is just simplified pseudo code but the general order of operations will be the same.)
 *
 * ## Runtime
 *
 * If `n` elements can be reached from the given starting element, then the average runtime will be `O(n)` and the
 * worst-case runtime will be `O(n^2)`.
 *
 * @param start
 * @param startMode If "enter", then the first element to be entered will be the starting element. If "leave", then the
 * first element to continue after will be the starting element.
 * @param initialState
 * @param operations
 * @param direction The direction in which paths will be followed. If undefined, then the natural matching direction
 * ({@link getMatchingDirection}) of the start element will be used.
 *
 * @typeParam S The type of the state.
 */
export function followPaths<S>(
	start: Element,
	startMode: "enter" | "next",
	initialState: S,
	operations: FollowOperations<S>,
	direction?: MatchingDirection
): S {
	function opEnter(element: Element, state: S, direction: MatchingDirection): S {
		if (operations.enter) {
			state = operations.enter(element, state, direction);
		}

		const continueInto = operations.continueInto?.(element, state, direction) ?? true;
		if (continueInto) {
			switch (element.type) {
				case "Assertion": {
					if (element.kind === "lookahead" || element.kind === "lookbehind") {
						const assertionDirection = getMatchingDirectionFromAssertionKind(element.kind);
						const assertion = operations.join(
							element.alternatives.map(a =>
								enterAlternative(a, doFork(operations, state, direction), assertionDirection)
							),
							assertionDirection
						);
						if (operations.endPath) {
							state = operations.endPath(state, assertionDirection, "assertion");
						}
						if (operations.assert) {
							state = operations.assert(state, direction, assertion, assertionDirection);
						}
					}
					break;
				}
				case "Group":
				case "CapturingGroup": {
					state = operations.join(
						element.alternatives.map(a =>
							enterAlternative(a, doFork(operations, state, direction), direction)
						),
						direction
					);
					break;
				}
				case "Quantifier": {
					if (element.max === 0) {
						// do nothing
					} else if (element.min === 0) {
						state = operations.join(
							[state, opEnter(element.element, doFork(operations, state, direction), direction)],
							direction
						);
					} else {
						state = opEnter(element.element, state, direction);
					}
					break;
				}
			}
		}

		if (operations.leave) {
			state = operations.leave(element, state, direction);
		}
		return state;
	}
	function enterAlternative(alternative: Alternative, state: S, direction: MatchingDirection): S {
		let i = direction === "ltr" ? 0 : alternative.elements.length - 1;
		const increment = direction === "ltr" ? +1 : -1;
		let element: Element | undefined;
		for (; (element = alternative.elements[i]); i += increment) {
			state = opEnter(element, state, direction);

			const continueAfter = operations.continueAfter?.(element, state, direction) ?? true;
			if (!continueAfter) {
				break;
			}
		}

		return state;
	}

	function opNext(element: Element, state: S, direction: MatchingDirection): S {
		type NextElement = false | Element | "pattern" | "assertion" | [Quantifier, NextElement];
		function getNextElement(element: Element): NextElement {
			const parent = element.parent;
			if (parent.type === "CharacterClass" || parent.type === "CharacterClassRange") {
				throw new Error("The given element cannot be part of a character class.");
			}

			const continuePath = operations.continueAfter?.(element, state, direction) ?? true;
			if (!continuePath) {
				return false;
			}

			if (parent.type === "Quantifier") {
				// This is difficult.
				// The main problem is that paths coming out of the quantifier might loop back into itself. This means that
				// we have to consider the path that leaves the quantifier and the path that goes back into the quantifier.
				if (parent.max <= 1) {
					// Can't loop, so we only have to consider the path going out of the quantifier.
					return getNextElement(parent);
				} else {
					return [parent, getNextElement(parent)];
				}
			} else {
				const nextIndex = parent.elements.indexOf(element) + (direction === "ltr" ? +1 : -1);
				const nextElement: Element | undefined = parent.elements[nextIndex];

				if (nextElement) {
					return nextElement;
				} else {
					const parentParent = parent.parent;
					if (parentParent.type === "Pattern") {
						return "pattern";
					} else if (parentParent.type === "Assertion") {
						return "assertion";
					} else if (parentParent.type === "CapturingGroup" || parentParent.type === "Group") {
						return getNextElement(parentParent);
					}
					throw assertNever(parentParent);
				}
			}
		}

		// eslint-disable-next-line no-constant-condition
		while (true) {
			let after = getNextElement(element);
			while (Array.isArray(after)) {
				const [quant, other] = after;
				state = operations.join(
					[state, opEnter(quant, doFork(operations, state, direction), direction)],
					direction
				);
				after = other;
			}

			if (after === false) {
				return state;
			} else if (after === "assertion" || after === "pattern") {
				if (operations.endPath) {
					state = operations.endPath(state, direction, after);
				}
				return state;
			} else {
				state = opEnter(after, state, direction);
				element = after;
			}
		}
	}

	if (!direction) {
		direction = getMatchingDirection(start);
	}
	if (startMode === "enter") {
		initialState = opEnter(start, initialState, direction);
	}
	return opNext(start, initialState, direction);
}

function doFork<S>(operations: FollowOperations<S>, state: S, direction: MatchingDirection): S {
	if (operations.fork) {
		return operations.fork(state, direction);
	} else {
		return state;
	}
}
