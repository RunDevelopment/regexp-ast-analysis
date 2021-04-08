/**
 * A simple interface to represent JS RegExp flags.
 *
 * All properties are optional and assumed to be `false` by default.
 */
export interface ReadonlyFlags {
	/** @default false */
	readonly dotAll?: boolean;
	/** @default false */
	readonly global?: boolean;
	/** @default false */
	readonly ignoreCase?: boolean;
	/** @default false */
	readonly multiline?: boolean;
	/** @default false */
	readonly sticky?: boolean;
	/** @default false */
	readonly unicode?: boolean;
}
