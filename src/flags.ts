/**
 * A simple interface to represent JS RegExp flags.
 *
 * All properties are optional and assumed to be `false` by default.
 */
export interface ReadonlyFlags {
	/**
	 * The `s` flag.
	 *
	 * @default false
	 */
	readonly dotAll?: boolean;
	/**
	 * The `g` flag.
	 *
	 * @default false
	 */
	readonly global?: boolean;
	/**
	 * The `d` flag.
	 *
	 * @default false
	 */
	readonly hasIndices?: boolean;
	/**
	 * The `i` flag.
	 *
	 * @default false
	 */
	readonly ignoreCase?: boolean;
	/**
	 * The `m` flag.
	 *
	 * @default false
	 */
	readonly multiline?: boolean;
	/**
	 * The `y` flag.
	 *
	 * @default false
	 */
	readonly sticky?: boolean;
	/**
	 * The `u` flag.
	 *
	 * @default false
	 */
	readonly unicode?: boolean;
}
