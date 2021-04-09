import { RegExpParser } from "regexpp";
import { Backreference, CapturingGroup, Node } from "regexpp/ast";
import { select, selectFirstWithRaw, selectNamedGroups } from "./helper/select";
import * as RAA from "../src";
import { assert } from "chai";

describe(RAA.isStrictBackreference.name, function () {
	function test(expected: boolean, regexps: RegExp[]): void {
		describe(`${expected}`, function () {
			regexps
				.map(r => new RegExpParser().parseLiteral(r.toString()))
				.forEach(r => {
					it(`${r.raw}`, function () {
						const refs = select(r.pattern, (e): e is Backreference => e.type === "Backreference");
						for (const ref of refs) {
							assert.equal(RAA.isStrictBackreference(ref), expected);
						}
					});
				});
		});
	}

	test(true, [/(a)\1/, /(a)(?:b|\1)/, /(a)\1?/, /(?<=\1(a))b/]);
	test(false, [/(a)|\1/, /(a\1)/, /(?:(a)|b)\1/, /(a)?\1/, /(?<=(a)\1)b/, /(?=\1(a))/]);
});

describe(RAA.isEmptyBackreference.name, function () {
	function test(expected: boolean, regexps: RegExp[]): void {
		describe(`${expected}`, function () {
			regexps
				.map(r => new RegExpParser().parseLiteral(r.toString()))
				.forEach(r => {
					it(`${r.raw}`, function () {
						const refs = select(r.pattern, (e): e is Backreference => e.type === "Backreference");
						for (const ref of refs) {
							assert.equal(RAA.isEmptyBackreference(ref), expected);
						}
					});
				});
		});
	}

	test(true, [/(\b)a\1/, /(a)b|\1/, /(a\1)/, /\1(a)/, /(?:\1(a))+/, /(?<=(a)\1)b/]);
	test(false, [/(?:(a)|b)\1/, /(a)?\1/, /(a)\1/]);
});

describe(RAA.getCapturingGroupNumber.name, function () {
	function test(regexps: RegExp[]): void {
		for (const regexp of regexps) {
			it(`${regexp}`, function () {
				const { pattern } = new RegExpParser().parseLiteral(regexp.toString());

				const caps = select(pattern, (e): e is CapturingGroup => e.type === "CapturingGroup");
				for (const cap of caps) {
					assert.equal(RAA.getCapturingGroupNumber(cap), Number((cap.name || "").slice(1)));
				}
			});
		}
	}

	test([/(?<_1>)(?<_2>)(?<_3>)/, /(?<_1>)|(?<_2>)|(?<_3>)/, /(?<_1>(?<_2>(?<_3>)))/]);
});

describe(RAA.getPattern.name, function () {
	it("should work", function () {
		const literal = new RegExpParser().parseLiteral(/a+(?=f(?<name>o)o\b)|[\sa-f]/gi.toString());

		const nodes: Node[] = [];
		RAA.hasSomeDescendant(literal, e => {
			nodes.push(e);
			return false;
		});

		for (const n of nodes) {
			assert.equal(RAA.getPattern(n), literal.pattern);
		}
	});
});

describe(RAA.getEffectiveMaximumRepetition.name, function () {
	interface TestCase {
		regexp: RegExp;
		raw: string;
		expected: number;
	}

	test([
		{ regexp: /a/, raw: /a/.source, expected: 1 },
		{ regexp: /a?/, raw: /a/.source, expected: 1 },
		{ regexp: /a+/, raw: /a/.source, expected: Infinity },
		{ regexp: /a+/, raw: /a+/.source, expected: 1 },
		{ regexp: /((a{0,8}){0,8}){0,8}/, raw: /a/.source, expected: 512 },
		{ regexp: /(ba{0})+/, raw: /a/.source, expected: 0 },
		{ regexp: /(ba{0})+/, raw: /a{0}/.source, expected: Infinity },
		{ regexp: /(\w(?!a{3}b))+/, raw: /a/.source, expected: 3 },
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, raw, expected } of cases) {
			const { pattern } = new RegExpParser().parseLiteral(regexp.toString());
			const element = selectFirstWithRaw(pattern, raw);

			it(`${regexp}: \`${raw}\``, function () {
				assert.equal(RAA.getEffectiveMaximumRepetition(element), expected);
			});
		}
	}
});

describe(RAA.getClosestAncestor.name, function () {
	interface TestCase {
		regexp: RegExp;
		expected?: string;
		expectedType?: RAA.Ancestor<CapturingGroup>["type"];
	}

	test([
		{ regexp: /a(?<a>)(?<b>)b/, expected: /a(?<a>)(?<b>)b/.source, expectedType: "Alternative" },
		{ regexp: /a(?<a>(?<b>))/, expected: /(?<a>(?<b>))/.source, expectedType: "CapturingGroup" },
		{ regexp: /(?<a>)|(?<b>)/, expectedType: "Pattern" },
		{ regexp: /a(?:a(?:a(?<a>))a|a(?<b>))a/, expected: /(?:a(?:a(?<a>))a|a(?<b>))/.source, expectedType: "Group" },
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, expected, expectedType } of cases) {
			it(`${regexp}`, function () {
				const { pattern } = new RegExpParser().parseLiteral(regexp.toString());
				const [a, b] = selectNamedGroups(pattern, /^[ab]$/);
				const actual = RAA.getClosestAncestor(a, b);

				assert.equal(actual, RAA.getClosestAncestor(b, a));

				// trivial
				assert.equal(a, RAA.getClosestAncestor(a, a));
				assert.equal(b, RAA.getClosestAncestor(b, b));

				if (expectedType) {
					assert.equal(actual.type, expectedType);
				}
				if (expected) {
					const element = selectFirstWithRaw(pattern, expected) as RAA.Ancestor<CapturingGroup>;
					assert.equal(
						actual,
						element,
						`Expected ${element.type} \`${element.raw}\` but found ${actual.type} \`${actual.raw}\``
					);
				}
			});
		}
	}
});
