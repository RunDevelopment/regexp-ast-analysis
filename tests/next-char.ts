import { assert } from "chai";
import { RegExpParser, visitRegExpAST } from "regexpp";
import * as RAA from "../src";
import { MatchingDirection } from "../src";
import { selectNamedGroups } from "./helper/select";
import { assertSnapshot } from "./helper/snapshot";

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
	}

	test([
		{ regexp: /a/ },
		{ regexp: /a/i },
		{ regexp: /[a-z]/i },
		{ regexp: /[\0-\uFFFF]/ },
		{ regexp: /[\0-\u{10FFFF}]/u },

		{ regexp: /abc/ },
		{ regexp: /abc/, direction: "ltr" },
		{ regexp: /abc/, direction: "rtl" },

		{ regexp: [/a?/, /a??/, /a|/, /|a/, /a*/, /a+|(|)/, /(?:a+){0,4}/, /a?b{0}/] },

		{ regexp: /(?:)/ },

		// backreferences

		{ regexp: /(a)\1/ },
		{ regexp: /(a)\1/, direction: "rtl" },
		{ regexp: /(?:(a)|b)\1/, direction: "rtl" },
		{ regexp: /(a)b\1/ },
		{ regexp: /\1(a)/ },
		{ regexp: /\1a|a(b)/ },

		// assertions

		{ regexp: /^/ },
		{ regexp: /^/, direction: "rtl" },
		{ regexp: /$/ },
		{ regexp: /$/, direction: "rtl" },

		{ regexp: /^/m },
		{ regexp: /$/m },

		{ regexp: /(?=a)/m },
		{ regexp: /(?!a)/m },
		{ regexp: /(?=abc)/m },
		{ regexp: /(?!abc)/m },

		{ regexp: /(?=$)/m },
		{ regexp: /(?!$)/m },

		{ regexp: /(?!a)[ab]/ },
		{ regexp: /(?![])[ab]/ },
		{ regexp: /(?!a?b)[ab]/ },
		{ regexp: /(?!abba)[ab]/ },
		{ regexp: /(?=a)[ab]/ },
		{ regexp: /(?=a?)[ab]/ },
		{ regexp: /(?<!a)[ab]/ },
		{ regexp: /(?<=a)[ab]/ },
		{ regexp: /\b[ab]/ },

		{ regexp: /\b/ },
		{ regexp: /\B/ },
		{ regexp: /^\b/ },
		{ regexp: /^\B/ },

		// make exact again
		{ regexp: /\b[ab]|[ab]/ },
		{ regexp: /\b[ab]|a|b/ },

		// trivially rejecting
		{ regexp: /(?!a?)[ab]/ },

		{ regexp: /(?!a)|b|(?=n)/ },
		{ regexp: /(?<!a)|b|(?=n)/ },

		// This is interesting because the `(?=b)` and `(?=c)` contradict which causes `a` to be the first char
		{ regexp: /(?:a|(?=b))(?=c)/ },
		{ regexp: /(?:a|(?=b))(?!b)/ },
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr" } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					assertSnapshot(RAA.getFirstConsumedChar(pattern.alternatives, direction, flags));
					// assert.deepEqual(RAA.getFirstConsumedChar(pattern.alternatives, direction, flags), expected);
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
	}

	test([
		{ regexp: /(?<afterThis>)a/ },
		{ regexp: /(?<afterThis>)a/i },

		{ regexp: /a(?<afterThis>)bc/ },
		{ regexp: /a(?<afterThis>)bc/, direction: "ltr" },
		{ regexp: /a(?<afterThis>)bc/, direction: "rtl" },

		{ regexp: /(?<afterThis>)(?:a?|b)cd/ },

		{ regexp: /(abc(?<afterThis>)){0,1}e/ },
		{ regexp: /(abc(?<afterThis>)){0,2}e/ },
		{ regexp: /(?:a(?:b(?<afterThis>)){2}){2}z/ },

		{
			// This is interesting because `followPaths` used to be implemented in a way that caused this pattern to
			// create exponentially many paths, taking exponentially much time.
			regexp: /(a(b(c(d(e(f(g(h(i(j(k(l(m(n(o(p(q(r(s(t(u(v(w(x(y(?<afterThis>)){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}){2}z/,
		},

		{ regexp: /(?<afterThis>)/ },
		{ regexp: /(?=(?<afterThis>))/ },

		// word boundary assertions
		{ regexp: /(?<afterThis>a|b)\b/ },
		{ regexp: /(?:a|b)(?<afterThis>)\b/ },
		{ regexp: /(?:a|b(?<afterThis>))\b/ },
		{ regexp: /;(?<afterThis>)\b[\d.]+/ },
		{ regexp: /;(?<afterThis>)\b\b\b\b\b\b[\d.]+/ },
		{ regexp: /;(?<afterThis>)\B[\d.]+/ },
		{ regexp: /;(?<afterThis>)\B\B\B[\d.]+/ },
		{ regexp: /^(?<afterThis>)\b/ },
		{ regexp: /a(?=(?<afterThis>)b)/, direction: "ltr" },
		{ regexp: /a(?=(?<afterThis>)b)/, direction: "rtl" },

		{ regexp: /(a)(?<afterThis>)\1/ },
		{ regexp: /(a|b)(?<afterThis>)\1/ },
		{ regexp: /(a|b)|(?<afterThis>)\1/ },
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr" } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					const [marker] = selectNamedGroups(pattern, /^afterThis$/);

					const actual = RAA.getFirstConsumedCharAfter(marker, direction, flags);
					assertSnapshot(actual);

					assert.deepEqual(
						RAA.getFirstConsumedCharAfterWithContributors(marker, direction, flags).char,
						actual
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
	}

	test([
		{ regexp: /(?<afterThis>)a/ },
		{ regexp: /(?<afterThis>)a/i },

		// The implementation of `getFirstCharAfter` is extremely boring.
		// Its correctness is already ensured by the tests above.
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, direction = "ltr" } of cases) {
			for (const r of iter(regexp)) {
				it(`${r} (${direction})`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(r.toString());

					const [marker] = selectNamedGroups(pattern, /^afterThis$/);

					const actual = RAA.getFirstCharAfter(marker, direction, flags);
					assertSnapshot(actual);
					assert.deepEqual(RAA.getFirstCharAfterWithContributors(marker, direction, flags).char, actual);
				});
			}
		}
	}
});
