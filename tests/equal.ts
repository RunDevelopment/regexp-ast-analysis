import { RegExpParser } from "regexpp";
import * as RAA from "../src";
import { assert } from "chai";

describe(RAA.structurallyEqual.name, function () {
	interface TestCase {
		a: RegExp;
		b: RegExp;
		expected?: boolean;
	}

	test([
		{ a: /\babc$/, b: /\babc$/ },
		{ a: /\babc$/, b: /abc$/, expected: false },

		{ a: /(?:abc|(a)\1)/, b: /(?:abc|(a)\1)/ },
		{ a: /(?:abc|(a)\1)/, b: /(?:abc|(a)\1)/i, expected: false },

		{ a: /a+/, b: /a+/ },
		{ a: /a+/, b: /a+?/, expected: false },
		{ a: /(?:)+/, b: /(?:)*/, expected: false },

		{ a: /\w\s./, b: /\w\s./ },
		{ a: /\w\s./, b: /\W\S./, expected: false },
		{ a: /\w\s./, b: /\w\s./s, expected: false },
		{ a: /\p{L}/u, b: /\p{L}/u },
		{ a: /\p{L}/u, b: /\p{L}/, expected: false },
		{ a: /\p{L}/u, b: /\P{L}/u, expected: false },

		{ a: /a/, b: /a/ },
		{ a: /a/, b: /\x61/ },
		// eslint-disable-next-line no-useless-escape
		{ a: /a/, b: /\a/ },
		{ a: /a/i, b: /A/i, expected: false },

		{ a: /[]/, b: /[]/ },
		{ a: /[^]/, b: /[^]/ },
		{ a: /[]/, b: /[^]/, expected: false },
		{ a: /[\s]/, b: /[\s]/ },
		{ a: /[\s]/, b: /[\s\s]/, expected: false },
		{ a: /[a-f]/, b: /[a-f]/ },
		{ a: /[a-f]/, b: /[a-fa]/, expected: false },
		{ a: /[a-f]/, b: /[a-e]/, expected: false },

		{ a: /$/, b: /(?!.)/, expected: false },
		{ a: /\b/, b: /\B/, expected: false },
		{ a: /(?=a)/, b: /(?=a)/ },
		{ a: /(?=a)/, b: /(?!a)/, expected: false },
		{ a: /(?=a)/, b: /(?<=a)/, expected: false },
	]);

	function test(cases: TestCase[]): void {
		for (const { a, b, expected } of cases) {
			it(`${a} == ${b}`, function () {
				const l1 = new RegExpParser().parseLiteral(a.toString());
				const l2 = new RegExpParser().parseLiteral(b.toString());

				assert.equal(RAA.structurallyEqual(l1, l2), expected ?? true);

				// trivially
				assert.isTrue(RAA.structurallyEqual(l1, l1));
				assert.isTrue(RAA.structurallyEqual(l2, l2));
			});
		}
	}
});
