import { assert } from "chai";
import { CharSet } from "refa";
import { RegExpParser, visitRegExpAST } from "regexpp";
import * as RAA from "../src";
import { MatchingDirection } from "../src";
import { selectNamedGroups, selectSingleChar } from "./helper/select";

function toCharSet(regexp: RegExp): CharSet {
	const { pattern, flags } = new RegExpParser().parseLiteral(regexp.toString());
	return RAA.toCharSet(selectSingleChar(pattern), flags);
}

function* iter<T>(array: T | T[]): IterableIterator<T> {
	if (Array.isArray(array)) {
		yield* array;
	} else {
		yield array;
	}
}

describe(RAA.getFirstConsumedChar.name, function () {
	interface TestCase {
		regexp: RegExp | RegExp[];
		direction?: MatchingDirection;
		expected: RAA.FirstConsumedChar;
	}

	test([
		{ regexp: /a/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /a/i, expected: { char: toCharSet(/a/i), exact: true, empty: false } },
		{ regexp: /[a-z]/i, expected: { char: toCharSet(/[A-Z]/i), exact: true, empty: false } },
		{ regexp: /[\0-\uFFFF]/, expected: { char: toCharSet(/[^]/), exact: true, empty: false } },
		{ regexp: /[\0-\u{10FFFF}]/u, expected: { char: toCharSet(/[^]/u), exact: true, empty: false } },

		{ regexp: /abc/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /abc/, direction: "ltr", expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /abc/, direction: "rtl", expected: { char: toCharSet(/c/), exact: true, empty: false } },

		{
			regexp: [/a?/, /a??/, /a|/, /|a/, /a*/, /a+|(|)/, /(?:a+){0,4}/, /a?b{0}/],
			expected: {
				char: toCharSet(/a/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: true, edge: true },
			},
		},

		{
			regexp: /(?:)/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: true, edge: true },
			},
		},

		// backreferences

		{ regexp: /(a)\1/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /(a)\1/, direction: "rtl", expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /(?:(a)|b)\1/, direction: "rtl", expected: { char: toCharSet(/[ab]/), exact: true, empty: false } },
		{ regexp: /(a)b\1/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /\1(a)/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /\1a|a(b)/, expected: { char: toCharSet(/a/), exact: true, empty: false } },

		// assertions

		{
			regexp: /^/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},
		{
			regexp: /^/,
			direction: "rtl",
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[]/), exact: true, edge: true },
			},
		},
		{
			regexp: /$/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[]/), exact: true, edge: true },
			},
		},
		{
			regexp: /$/,
			direction: "rtl",
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},

		{
			regexp: /^/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},
		{
			regexp: /$/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\r\n\u2028\u2029]/), exact: true, edge: true },
			},
		},

		{
			regexp: /(?=a)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[a]/), exact: true, edge: false },
			},
		},
		{
			regexp: /(?!a)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^a]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?=abc)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[a]/), exact: true, edge: false },
			},
		},
		{
			regexp: /(?!abc)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},

		{
			regexp: /(?=$)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\r\n\u2028\u2029]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?!$)/m,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				// This is technically correct because of `exact: false` but we should do better.
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},

		{ regexp: /(?!a)[ab]/, expected: { char: toCharSet(/[b]/), exact: true, empty: false } },
		{ regexp: /(?![])[ab]/, expected: { char: toCharSet(/[ab]/), exact: true, empty: false } },
		{ regexp: /(?!a?b)[ab]/, expected: { char: toCharSet(/[ab]/), exact: false, empty: false } },
		{ regexp: /(?!abba)[ab]/, expected: { char: toCharSet(/[ab]/), exact: false, empty: false } },
		{ regexp: /(?=a)[ab]/, expected: { char: toCharSet(/[a]/), exact: true, empty: false } },
		{ regexp: /(?=a?)[ab]/, expected: { char: toCharSet(/[ab]/), exact: true, empty: false } },
		{ regexp: /(?<!a)[ab]/, expected: { char: toCharSet(/[ab]/), exact: false, empty: false } },
		{ regexp: /(?<=a)[ab]/, expected: { char: toCharSet(/[ab]/), exact: false, empty: false } },
		{ regexp: /\b[ab]/, expected: { char: toCharSet(/[ab]/), exact: false, empty: false } },

		{
			regexp: /\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},
		{
			regexp: /\B/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},
		{
			regexp: /^\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\w]/), exact: false, edge: false },
			},
		},
		{
			regexp: /^\B/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\W]/), exact: false, edge: true },
			},
		},

		// make exact again
		{ regexp: /\b[ab]|[ab]/, expected: { char: toCharSet(/[ab]/), exact: true, empty: false } },
		{ regexp: /\b[ab]|a|b/, expected: { char: toCharSet(/[ab]/), exact: true, empty: false } },

		{
			// trivially rejecting
			regexp: /(?!a?)[ab]/,
			expected: { char: toCharSet(/[]/), exact: true, empty: false },
		},

		{
			regexp: /(?!a)|b|(?=n)/,
			expected: {
				char: toCharSet(/[b]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^a]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?<!a)|b|(?=n)/,
			expected: {
				char: toCharSet(/[b]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: false, edge: true },
			},
		},

		{
			// This is interesting because the `(?=b)` and `(?=c)` contradict which causes `a` to be the first char
			regexp: /(?:a|(?=b))(?=c)/,
			expected: { char: toCharSet(/[a]/), exact: true, empty: false },
		},
		{
			// Same as above
			regexp: /(?:a|(?=b))(?!b)/,
			expected: { char: toCharSet(/[a]/), exact: true, empty: false },
		},
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr", expected } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					assert.deepEqual(RAA.getFirstConsumedChar(pattern.alternatives, direction, flags), expected);
				});
			}
		}
	}

	it("performance test", function () {
		this.timeout(1000);

		const monster = /(:\s*)(?!\s)(?:!?\s*(?:(?:\?|\bp>|(?:\[\]|\*(?!\*)|\*\*)(?:\s*a\)|\s*ct\b|\s*ve\b|\s*ao\b)*)\s*)*(?:\bpe\b|(?:\be\.)?\b(?!\bk\b)(?!\d)\w+\b(?:\.\b(?!\bk\b)(?!\d)\w+\b)*(?!\s+\b(?!\bk\b)(?!\d)\w+\b)))+(?=\s*(?:a\)\s*)?[=;,)])|(?!\s)(?:!?\s*(?:(?:\?|\bp>|(?:\[\]|\*(?!\*)|\*\*)(?:\s*a\)|\s*ct\b|\s*ve\b|\s*ao\b)*)\s*)*(?:\bpe\b|(?:\be\.)?\b(?!\bk\b)(?!\d)\w+\b(?:\.\b(?!\bk\b)(?!\d)\w+\b)*(?!\s+\b(?!\bk\b)(?!\d)\w+\b)))+(?=\s*(?:a\)\s*)?\{)/;

		const { pattern, flags } = new RegExpParser().parseLiteral(monster.toString());

		type WordAssertionResult = ["all" | "word", "all" | "word"];
		const expected: Record<number, WordAssertionResult> = {
			"30": ["all", "word"],
			"72": ["word", "all"],
			"80": ["word", "all"],
			"88": ["word", "all"],
			"101": ["all", "word"],
			"105": ["word", "all"],
			"111": ["all", "word"],
			"118": ["all", "word"],
			"123": ["word", "word"],
			"126": ["word", "all"],
			"138": ["word", "all"],
			"145": ["word", "word"],
			"150": ["word", "word"],
			"153": ["word", "all"],
			"165": ["word", "all"],
			"175": ["word", "word"],
			"180": ["word", "word"],
			"183": ["word", "all"],
			"195": ["word", "all"],
			"249": ["all", "word"],
			"291": ["word", "all"],
			"299": ["word", "all"],
			"307": ["word", "all"],
			"320": ["all", "word"],
			"324": ["word", "all"],
			"330": ["all", "word"],
			"337": ["all", "word"],
			"342": ["word", "word"],
			"345": ["word", "all"],
			"357": ["word", "all"],
			"364": ["word", "word"],
			"369": ["word", "word"],
			"372": ["word", "all"],
			"384": ["word", "all"],
			"394": ["word", "word"],
			"399": ["word", "word"],
			"402": ["word", "all"],
			"414": ["word", "all"],
		};
		const actual: Record<number, WordAssertionResult> = {};

		visitRegExpAST(pattern, {
			onAssertionEnter(node) {
				if (node.kind !== "word") return;

				const ltr = RAA.getFirstConsumedChar(node, "ltr", flags);
				const rtl = RAA.getFirstConsumedChar(node, "rtl", flags);
				if (!ltr.empty || !rtl.empty) {
					assert.fail("What?");
				}

				actual[node.start] = [ltr.look.char.isAll ? "all" : "word", rtl.look.char.isAll ? "all" : "word"];
			},
		});

		assert.deepStrictEqual(actual, expected);
	});
});

describe(RAA.getFirstConsumedCharAfter.name, function () {
	interface TestCase {
		regexp: RegExp | RegExp[];
		direction?: MatchingDirection;
		expected: RAA.FirstConsumedChar;
	}

	test([
		{ regexp: /(?<afterThis>)a/, expected: { char: toCharSet(/a/), exact: true, empty: false } },
		{ regexp: /(?<afterThis>)a/i, expected: { char: toCharSet(/a/i), exact: true, empty: false } },

		{
			regexp: /a(?<afterThis>)bc/,
			expected: { char: toCharSet(/b/), exact: true, empty: false },
		},
		{
			regexp: /a(?<afterThis>)bc/,
			direction: "ltr",
			expected: { char: toCharSet(/b/), exact: true, empty: false },
		},
		{
			regexp: /a(?<afterThis>)bc/,
			direction: "rtl",
			expected: { char: toCharSet(/a/), exact: true, empty: false },
		},

		{
			regexp: /(?<afterThis>)(?:a?|b)cd/,
			expected: { char: toCharSet(/[abc]/), exact: true, empty: false },
		},

		{
			regexp: /(abc(?<afterThis>)){0,1}e/,
			expected: { char: toCharSet(/[e]/), exact: true, empty: false },
		},
		{
			regexp: /(abc(?<afterThis>)){0,2}e/,
			expected: { char: toCharSet(/[ae]/), exact: true, empty: false },
		},
		{
			regexp: /(?:a(?:b(?<afterThis>)){2}){2}z/,
			expected: { char: toCharSet(/[abz]/), exact: true, empty: false },
		},
		{
			// This is interesting because `followPaths` used to be implemented in a way that caused this pattern to
			// create exponentially many paths, taking exponentially much time.
			regexp: /(a(b(c(d(e(f(g(h(i(j(k(l(m(n(o(p(q(r(s(t(u(v(w(x(y(?<afterThis>)){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}z/,
			expected: { char: toCharSet(/[a-z]/), exact: true, empty: false },
		},

		{
			regexp: /(?<afterThis>)/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?=(?<afterThis>))/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: true, edge: true },
			},
		},

		// word boundary assertions
		{
			regexp: /(?<afterThis>a|b)\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\W]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?:a|b)(?<afterThis>)\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\W]/), exact: true, edge: true },
			},
		},
		{
			regexp: /(?:a|b(?<afterThis>))\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\W]/), exact: true, edge: true },
			},
		},
		{
			regexp: /;(?<afterThis>)\b[\d.]+/,
			expected: {
				char: toCharSet(/[\d]/),
				exact: true,
				empty: false,
			},
		},
		{
			regexp: /;(?<afterThis>)\b\b\b\b\b\b[\d.]+/,
			expected: {
				char: toCharSet(/[\d]/),
				exact: true,
				empty: false,
			},
		},
		{
			regexp: /;(?<afterThis>)\B[\d.]+/,
			expected: {
				char: toCharSet(/[.]/),
				exact: true,
				empty: false,
			},
		},
		{
			regexp: /;(?<afterThis>)\B\B\B[\d.]+/,
			expected: {
				char: toCharSet(/[.]/),
				exact: true,
				empty: false,
			},
		},
		{
			regexp: /^(?<afterThis>)\b/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[\w]/), exact: true, edge: false },
			},
		},
		{
			regexp: /a(?=(?<afterThis>)b)/,
			direction: "ltr",
			expected: { char: toCharSet(/[b]/), exact: true, empty: false },
		},
		{
			regexp: /a(?=(?<afterThis>)b)/,
			direction: "rtl",
			expected: { char: toCharSet(/[a]/), exact: true, empty: false },
		},

		{
			regexp: /(a)(?<afterThis>)\1/,
			expected: { char: toCharSet(/[a]/), exact: true, empty: false },
		},
		{
			regexp: /(a|b)(?<afterThis>)\1/,
			expected: { char: toCharSet(/[ab]/), exact: false, empty: false },
		},
		{
			regexp: /(a|b)|(?<afterThis>)\1/,
			expected: {
				char: toCharSet(/[]/),
				exact: true,
				empty: true,
				look: { char: toCharSet(/[^]/), exact: true, edge: true },
			},
		},
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr", expected } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					const [marker] = selectNamedGroups(pattern, /^afterThis$/);

					assert.deepEqual(RAA.getFirstConsumedCharAfter(marker, direction, flags), expected);
					assert.deepEqual(
						RAA.getFirstConsumedCharAfterWithContributors(marker, direction, flags).char,
						expected
					);
				});
			}
		}
	}
});

describe(RAA.getFirstCharAfter.name, function () {
	interface TestCase {
		regexp: RegExp | RegExp[];
		direction?: MatchingDirection;
		expected: RAA.FirstLookChar;
	}

	test([
		{ regexp: /(?<afterThis>)a/, expected: { char: toCharSet(/a/), exact: true, edge: false } },
		{ regexp: /(?<afterThis>)a/i, expected: { char: toCharSet(/a/i), exact: true, edge: false } },

		// The implementation of `getFirstCharAfter` is extremely boring.
		// Its correctness is already ensured by the tests above.
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr", expected } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					const [marker] = selectNamedGroups(pattern, /^afterThis$/);

					assert.deepEqual(RAA.getFirstCharAfter(marker, direction, flags), expected);
					assert.deepEqual(RAA.getFirstCharAfterWithContributors(marker, direction, flags).char, expected);
				});
			}
		}
	}
});
