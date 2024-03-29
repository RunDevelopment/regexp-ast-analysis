/* eslint-disable @typescript-eslint/no-namespace */
import { Char, CharSet, JS } from "refa";
import { ReadonlyFlags } from "./flags";
import { MaxChar } from "./max-char";

function isUnicode(flags: ReadonlyFlags): boolean {
	return flags.unicode || !!flags.unicodeSets;
}

/**
 * A set of functions to get predefined character sets.
 */
export namespace Chars {
	/**
	 * Returns the maximum character for the given flags.
	 */
	export function maxChar(flags: ReadonlyFlags): Char {
		if (isUnicode(flags)) {
			return MaxChar.UNICODE;
		} else {
			return MaxChar.UTF16;
		}
	}

	const EMPTY_UTF16_CHARSET = CharSet.empty(MaxChar.UTF16);
	const EMPTY_UNICODE_CHARSET = CharSet.empty(MaxChar.UNICODE);
	/**
	 * Returns the empty character set for the given flags.
	 */
	export function empty(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			return EMPTY_UNICODE_CHARSET;
		} else {
			return EMPTY_UTF16_CHARSET;
		}
	}

	const ALL_UTF16_CHARSET = CharSet.all(MaxChar.UTF16);
	const ALL_UNICODE_CHARSET = CharSet.all(MaxChar.UNICODE);
	/**
	 * Returns the full character set for the given flags.
	 */
	export function all(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			return ALL_UNICODE_CHARSET;
		} else {
			return ALL_UTF16_CHARSET;
		}
	}

	const LINE_TERMINATOR_UTF16_CHARSET = JS.createCharSet([{ kind: "any" }], { unicode: false }).negate();
	const LINE_TERMINATOR_UNICODE_CHARSET = JS.createCharSet([{ kind: "any" }], { unicode: true }).negate();
	/**
	 * Returns the character set that contains only line terminators.
	 *
	 * This character set accepts all characters that the JS RegExp `.` rejects. The returned character set accepts
	 * all character that the regex `/^.$/` rejects.
	 */
	export function lineTerminator(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			return LINE_TERMINATOR_UNICODE_CHARSET;
		} else {
			return LINE_TERMINATOR_UTF16_CHARSET;
		}
	}

	const WORD_UTF16_CHARSET = JS.createCharSet([{ kind: "word", negate: false }], { unicode: false });
	const WORD_UNICODE_CHARSET = JS.createCharSet([{ kind: "word", negate: false }], {
		unicode: true,
		ignoreCase: false,
	});
	const WORD_UNICODE_IGNORE_CASE_CHARSET = JS.createCharSet([{ kind: "word", negate: false }], {
		unicode: true,
		ignoreCase: true,
	});
	/**
	 * Returns a character set that is equivalent to `\w` with the given flags.
	 *
	 * Note: `\w` is somewhat special because it has 3 values. All predefined character sets only have two values - one
	 * for Unicode mode and one for non-Unicode mode. This is because Unicode-mode changes the semantics of ignore case
	 * as well. This causes some of the ASCII letters to be ignore-case-equal to higher Unicode characters
	 * (e.g. K (Latin Capital Letter K, U+004b) == k (Latin Small Letter K, U+006b) == K (Kelvin Sign, U+212A)). As a
	 * result `\w` has 3 values: one for non-Unicode mode, one for case-sensitive Unicode-mode, and one for
	 * case-insensitive Unicode-mode.
	 */
	export function word(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			if (flags.ignoreCase) {
				return WORD_UNICODE_IGNORE_CASE_CHARSET;
			} else {
				return WORD_UNICODE_CHARSET;
			}
		} else {
			return WORD_UTF16_CHARSET;
		}
	}

	const DIGIT_UTF16_CHARSET = JS.createCharSet([{ kind: "digit", negate: false }], { unicode: false });
	const DIGIT_UNICODE_CHARSET = JS.createCharSet([{ kind: "digit", negate: false }], { unicode: true });
	/**
	 * Returns a character set that is equivalent to `\d` with the given flags.
	 */
	export function digit(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			return DIGIT_UNICODE_CHARSET;
		} else {
			return DIGIT_UTF16_CHARSET;
		}
	}

	const SPACE_UTF16_CHARSET = JS.createCharSet([{ kind: "space", negate: false }], { unicode: false });
	const SPACE_UNICODE_CHARSET = JS.createCharSet([{ kind: "space", negate: false }], { unicode: true });
	/**
	 * Returns a character set that is equivalent to `\s` with the given flags.
	 */
	export function space(flags: ReadonlyFlags): CharSet {
		if (isUnicode(flags)) {
			return SPACE_UNICODE_CHARSET;
		} else {
			return SPACE_UTF16_CHARSET;
		}
	}
}
