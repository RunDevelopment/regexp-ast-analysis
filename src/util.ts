import { CharSet } from "refa";
import { Alternative } from "@eslint-community/regexpp/ast";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";

export function assertNever(value: never, message?: string): never {
	throw new Error(message || value);
}

export function assertSameParent(alternatives: Iterable<Alternative>): void {
	let parent: Alternative["parent"] | null = null;
	for (const a of alternatives) {
		if (parent === null) {
			parent = a.parent;
		} else {
			if (a.parent !== parent) {
				throw new Error("Expected all alternatives to have the same parent");
			}
		}
	}
}

export const isReadonlyArray: (value: unknown) => value is readonly unknown[] = Array.isArray;

export function asReadonlySet<T>(iter: Iterable<T>): ReadonlySet<T> {
	if (iter instanceof Set) {
		return iter;
	}
	return new Set(iter);
}

export interface InexactCharSet {
	readonly char: CharSet;
	readonly exact: boolean;
}

export class CharUnion implements InexactCharSet {
	private _exactChars: CharSet;
	private _inexactChars: CharSet;

	get char(): CharSet {
		return this._exactChars.union(this._inexactChars);
	}
	get exact(): boolean {
		// basic idea here is that the union or an exact superset with an inexact subset will be exact
		return this._exactChars.isSupersetOf(this._inexactChars);
	}

	private constructor(empty: CharSet) {
		this._exactChars = empty;
		this._inexactChars = empty;
	}

	add(char: InexactCharSet): void {
		if (char.exact) {
			this._exactChars = this._exactChars.union(char.char);
		} else {
			this._inexactChars = this._inexactChars.union(char.char);
		}
	}

	static fromFlags(flags: ReadonlyFlags): CharUnion {
		return new CharUnion(Chars.empty(flags));
	}
	static fromMaximum(maximum: number): CharUnion {
		return new CharUnion(CharSet.empty(maximum));
	}
}

export function unionInexact(left: InexactCharSet, right: InexactCharSet): InexactCharSet {
	const char = left.char.union(right.char);

	let exact;
	if (left.exact) {
		if (right.exact) {
			exact = true;
		} else {
			exact = left.char.isSupersetOf(right.char);
		}
	} else {
		if (right.exact) {
			exact = right.char.isSupersetOf(left.char);
		} else {
			exact = false;
		}
	}

	return { char, exact };
}
export function intersectInexact(left: InexactCharSet, right: InexactCharSet): InexactCharSet {
	const char = left.char.intersect(right.char);
	const exact = (left.exact && right.exact) || char.isEmpty;

	return { char, exact };
}

export class SetEquivalence {
	private readonly _indexes: number[];

	readonly count: number;

	constructor(count: number) {
		this.count = count;
		this._indexes = [];
		for (let i = 0; i < count; i++) {
			this._indexes.push(i);
		}
	}

	makeEqual(a: number, b: number): void {
		// This works using the following idea:
		//  1. If the eq set of a and b is the same, then we can stop.
		//  2. If indexes[a] < indexes[b], then we want to make
		//     indexes[b] := indexes[a]. However, this means that we lose the
		//     information about the indexes[b]! So we will store
		//     oldB := indexes[b], then indexes[b] := indexes[a], and then
		//     make oldB == a.
		//  3. If indexes[a] > indexes[b], similar to 2.

		let aValue = this._indexes[a];
		let bValue = this._indexes[b];
		while (aValue !== bValue) {
			if (aValue < bValue) {
				this._indexes[b] = aValue;
				// eslint-disable-next-line no-param-reassign -- x
				b = bValue;
				bValue = this._indexes[b];
			} else {
				this._indexes[a] = bValue;
				// eslint-disable-next-line no-param-reassign -- x
				a = aValue;
				aValue = this._indexes[a];
			}
		}
	}

	/**
	 * This returns:
	 *
	 * 1. `eqSet.count`: How many different equivalence classes there are.
	 * 2. `eqSet.indexes`: A map (array) from each element (index) to the index
	 *    of its equivalence class.
	 *
	 * All equivalence class indexes `eqSet.indexes[i]` are guaranteed to
	 * be <= `eqSet.count`.
	 */
	getEquivalenceSets(): { count: number; indexes: number[] } {
		let counter = 0;
		for (let i = 0; i < this.count; i++) {
			if (i === this._indexes[i]) {
				this._indexes[i] = counter++;
			} else {
				this._indexes[i] = this._indexes[this._indexes[i]];
			}
		}
		return {
			count: counter,
			indexes: this._indexes,
		};
	}
}
