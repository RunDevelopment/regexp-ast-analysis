import { CharSet } from "refa";
import { Chars } from "./chars";
import { ReadonlyFlags } from "./flags";

export function assertNever(value: never, message?: string): never {
	throw new Error(message || value);
}

export const isReadonlyArray: (value: unknown) => value is readonly unknown[] = Array.isArray;

export class CharUnion {
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

	add(char: CharSet, exact: boolean): void {
		if (exact) {
			this._exactChars = this._exactChars.union(char);
		} else {
			this._inexactChars = this._inexactChars.union(char);
		}
	}

	static fromFlags(flags: ReadonlyFlags): CharUnion {
		return new CharUnion(Chars.empty(flags));
	}
	static fromMaximum(maximum: number): CharUnion {
		return new CharUnion(CharSet.empty(maximum));
	}
}
