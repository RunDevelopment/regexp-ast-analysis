import { CharSet } from "refa";
import { Alternative, Element, Node } from "regexpp/ast";
import { ReadonlyFlags } from "./flags";

/**
 * A cache that functions may use to store results.
 *
 * A cache implements the {@link ReadonlyFlags} interface. All functions that take a {@link ReadonlyFlags} objects can
 * be given a cache instead to utilize the cache. Example:
 *
 * ```js
 * const flags: ReadonlyFlags = getFlags();
 * const cache = createCache(flags);
 *
 * toCharSet(element, flags); // uncached
 * toCharSet(element, cache); // cached
 * ```
 *
 * Whether the cache is actually utilized depends on the implementation of the function.
 *
 * To create a new cache, use the {@link createCache} function.
 *
 * ### Assumption
 *
 * Caches assume that the regexpp AST of cached nodes is immutable. If this assumption is broken, then the cache may
 * return old or incorrect results.
 *
 * The AST may be changed before the cache first sees a node of the AST and after the cached last sees a node of the
 * AST. Changes are allowed as long as the AST appears to be immutable from the perspective of the cache.
 *
 * ### Memory
 *
 * The cache uses regexpp `Node` objects as keys in
 * [`WeakMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)s internally.
 * They will not cause memory leaks.
 *
 * This means that caches may out-live the nodes they cache information for.
 */
export interface Cache extends Required<ReadonlyFlags> {
	readonly __cache?: never;
}

/**
 * This will create a new cache instance for the given flags.
 *
 * This operation will always create a new cache. If you want to transparently reuse cache instances, use
 * {@link toCache} instead.
 *
 * See {@link Cache} from more information about using caches.
 *
 * @see {@link Cache}
 * @see {@link toCache}
 */
export function createCache(flags: ReadonlyFlags): Cache {
	return new CacheInstance(flags);
}

/**
 * Returns a cache instance for the given flags.
 *
 * If the given flags are a cache instance, the cache instance will be returned. Otherwise a new cache instance will
 * be created using {@link createCache}.
 *
 * See {@link Cache} from more information about using caches.
 *
 * @see {@link Cache}
 * @see {@link createCache}
 */
export function toCache(flags: ReadonlyFlags): Cache {
	if (flags instanceof CacheInstance) {
		return flags;
	} else {
		return createCache(flags);
	}
}

/** @internal */
export class CacheInstance implements Cache {
	readonly dotAll: boolean;
	readonly global: boolean;
	readonly hasIndices: boolean;
	readonly ignoreCase: boolean;
	readonly multiline: boolean;
	readonly sticky: boolean;
	readonly unicode: boolean;

	readonly toCharSet = new WeakMap<Node, CharSet>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly getFirstConsumedCharLTR = new WeakMap<Element | Alternative, any>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly getFirstConsumedCharRTL = new WeakMap<Element | Alternative, any>();

	constructor(flags: ReadonlyFlags) {
		this.dotAll = !!flags.dotAll;
		this.global = !!flags.global;
		this.hasIndices = !!flags.hasIndices;
		this.ignoreCase = !!flags.ignoreCase;
		this.multiline = !!flags.multiline;
		this.sticky = !!flags.sticky;
		this.unicode = !!flags.unicode;
	}
}
