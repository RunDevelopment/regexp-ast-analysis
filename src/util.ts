import { CharSet } from "refa";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";

export function assertNever(value: never, message?: string): never {
	throw new Error(message || value);
}

export const isReadonlyArray: (value: unknown) => value is readonly unknown[] = Array.isArray;

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
