import { assert } from "chai";
import { RegExpParser, visitRegExpAST } from "@eslint-community/regexpp";
import { Alternative, Element, Flags, Pattern, RegExpLiteral } from "@eslint-community/regexpp/ast";
import * as RAA from "../src";
import { Predicate, Model, testModel } from "./helper/model";
import { selectNamedGroups } from "./helper/select";

describe("length", function () {
	const isEmpty = new Predicate<PredicateTestCaseInfo>("isEmpty(e)", ({ selected }) => RAA.isEmpty(selected));
	const isPotentiallyEmpty = new Predicate<PredicateTestCaseInfo>("isPotentiallyEmpty(e)", ({ selected }) =>
		RAA.isPotentiallyEmpty(selected)
	);
	const isZeroLength = new Predicate<PredicateTestCaseInfo>("isZeroLength(e)", ({ selected }) =>
		RAA.isZeroLength(selected)
	);
	const isPotentiallyZeroLength = new Predicate<PredicateTestCaseInfo>("isPotentiallyZeroLength(e)", ({ selected }) =>
		RAA.isPotentiallyZeroLength(selected)
	);
	const isLengthMinZero = new Predicate<PredicateTestCaseInfo>(
		"getLengthRange(e).min == 0",
		({ selected }) => RAA.getLengthRange(selected).min === 0
	);
	const isLengthMaxZero = new Predicate<PredicateTestCaseInfo>(
		"getLengthRange(e).max == 0",
		({ selected }) => RAA.getLengthRange(selected).max === 0
	);
	const isLengthRangeMinZero = new Predicate<PredicateTestCaseInfo>("isLengthRangeMinZero(e)", ({ selected }) =>
		RAA.isLengthRangeMinZero(selected)
	);

	const model = new Model<PredicateTestCaseInfo>();

	model.implication(isEmpty, isPotentiallyEmpty);
	model.implication(isEmpty, isZeroLength);
	model.implication(isZeroLength, isPotentiallyZeroLength);
	model.implication(isPotentiallyEmpty, isPotentiallyZeroLength);

	model.implication(isZeroLength, isLengthMaxZero);
	model.implication(isPotentiallyZeroLength, isLengthMinZero);

	model.implication(isLengthRangeMinZero, isLengthMinZero);
	model.implication(isLengthMinZero, isLengthRangeMinZero);

	// test cases

	model.add(
		isEmpty,
		casesToInfos([
			{ regexp: /||/, whole: true },
			{ regexp: /((?:)|()()())||/, whole: true },
			{ regexp: /a{0}/, whole: true },
			{ regexp: /a{0}a{0}a{0}/, whole: true },
			{ regexp: /(?:||)+/, whole: true },
			{ regexp: /(?:||){1000}/, whole: true },

			{ regexp: /(?:\b){0}/, whole: true },

			{ regexp: /()\1|\1/, whole: true },
			{ regexp: /(a)|\1/, raw: String.raw`\1` },
			{ regexp: /\1(a)/, raw: String.raw`\1` },
			{ regexp: /\1|(a)/, raw: String.raw`\1` },
			{ regexp: /(?<=(a)\1)/, raw: String.raw`\1` },
		])
	);
	model.add(
		isEmpty.not(),
		casesToInfos([
			{ regexp: /a?/, whole: true },
			{ regexp: /a*/, whole: true },
			{ regexp: /|a|/, whole: true },
			{ regexp: /foo|a*/, whole: true },

			{ regexp: /(?:\b)?/, whole: true },
			{ regexp: /(?:\b)*/, whole: true },
		])
	);

	model.add(
		isPotentiallyEmpty,
		casesToInfos([
			{ regexp: /a?/, whole: true },
			{ regexp: /a*/, whole: true },
			{ regexp: /|a|/, whole: true },
			{ regexp: /foo|a*/, whole: true },

			{ regexp: /(?:\b)?/, whole: true },
			{ regexp: /(?:\b)*/, whole: true },

			{ regexp: /(a)\1|\1/, whole: true },
			{ regexp: /(a?)\1/, whole: true },
			{ regexp: /(a)?\1/, whole: true },
			{ regexp: /(?:(a)|)\1/, whole: true },
		])
	);
	model.add(
		isPotentiallyEmpty.not(),
		casesToInfos([
			{ regexp: /\b/, whole: true },
			{ regexp: /(?:\b)+/, whole: true },
			{ regexp: /(?:\b){4}/, whole: true },

			{ regexp: /(?:(a)|b)\1/, whole: true },
			{ regexp: /(?:(a)|)\1/, raw: String.raw`\1` },
		])
	);

	model.add(
		isZeroLength,
		casesToInfos([
			{ regexp: /\b/, whole: true },
			{ regexp: /(?:\b)+/, whole: true },
			{ regexp: /(?:\b){4}/, whole: true },
		])
	);
	model.add(
		isZeroLength.not(),
		casesToInfos([
			{ regexp: /foo|\b/, whole: true },
			{ regexp: /(a)\1|\b/, whole: true },
		])
	);

	model.add(
		isPotentiallyZeroLength,
		casesToInfos([
			{ regexp: /foo|\b/, whole: true },
			{ regexp: /\b|\b/, whole: true },
		])
	);
	model.add(
		isPotentiallyZeroLength.not(),
		casesToInfos([
			{ regexp: /foo/, whole: true },
			{ regexp: /a+/, whole: true },
			{ regexp: /a{1}|b/, whole: true },

			{ regexp: /(a)\1/, whole: true },
			{ regexp: /(a)(\1|b)/, whole: true },

			{ regexp: /(a)?\1/, raw: String.raw`\1` },
		])
	);

	// run tests

	testModel(model, ({ regexp, selected }) => {
		const s = Array.isArray(selected) ? selected.map(e => e.raw).join("|") : selected.raw;
		return `${regexp}: \`${s}\``;
	});

	interface PredicateTestCase {
		regexp: RegExp;
		raw?: string;
		whole?: boolean;
	}
	interface PredicateTestCaseInfo {
		regexp: RegExp;
		selected: Element | Alternative | Alternative[];
		pattern: Pattern;
		flags: Flags;
		literal: RegExpLiteral;
	}
	function caseToInfo(testCase: PredicateTestCase): PredicateTestCaseInfo[] {
		const literal = new RegExpParser().parseLiteral(testCase.regexp.toString());

		const selectedNodes = new Set<Element | Alternative | Alternative[]>();
		const addSelected = (node: Element | Alternative | Pattern): void => {
			if (node.type === "Pattern") {
				selectedNodes.add(node.alternatives);
			} else {
				selectedNodes.add(node);
			}
		};

		if (testCase.whole) {
			addSelected(literal.pattern);
		}

		if (testCase.raw !== undefined) {
			const onNode = (node: Element | Alternative | Pattern): void => {
				if (node.raw === testCase.raw) {
					addSelected(node);
				}
			};
			visitRegExpAST(literal, {
				onAlternativeEnter: onNode,
				onAssertionEnter: onNode,
				onBackreferenceEnter: onNode,
				onCapturingGroupEnter: onNode,
				onCharacterClassEnter: onNode,
				onCharacterEnter: onNode,
				onCharacterSetEnter: onNode,
				onGroupEnter: onNode,
				onPatternEnter: onNode,
				onQuantifierEnter: onNode,
			});
		}

		if (selectedNodes.size === 0) {
			throw new Error("Couldn't find any elements.");
		}

		return [...selectedNodes].map(s => {
			return {
				literal,
				pattern: literal.pattern,
				flags: literal.flags,
				regexp: testCase.regexp,
				selected: s,
			};
		});
	}
	function casesToInfos(cases: Iterable<PredicateTestCase>): PredicateTestCaseInfo[] {
		const result: PredicateTestCaseInfo[] = [];
		for (const testCase of cases) {
			result.push(...caseToInfo(testCase));
		}
		return result;
	}
});

describe(RAA.getLengthRange.name, function () {
	it("should throw on empty array", function () {
		assert.throws(() => RAA.getLengthRange([]));
	});

	interface TestCase {
		regexp: RegExp;
		expected: RAA.LengthRange;
		selectNamed?: boolean | RegExp;
	}

	test([
		{ regexp: /abc/, expected: { min: 3, max: 3 } },
		{ regexp: /a|b|c/, expected: { min: 1, max: 1 } },
		{ regexp: /ab|c/, expected: { min: 1, max: 2 } },

		{ regexp: /b?/, expected: { min: 0, max: 1 } },
		{ regexp: /b??/, expected: { min: 0, max: 1 } },
		{ regexp: /b*/, expected: { min: 0, max: Infinity } },
		{ regexp: /b*?/, expected: { min: 0, max: Infinity } },
		{ regexp: /b+/, expected: { min: 1, max: Infinity } },
		{ regexp: /b+?/, expected: { min: 1, max: Infinity } },

		{ regexp: /ab?c?/, expected: { min: 1, max: 3 } },
		{ regexp: /(?:||){2,4}/, expected: { min: 0, max: 0 } },
		{ regexp: /(?:a+){0}/, expected: { min: 0, max: 0 } },
		{ regexp: /a{2,4}/, expected: { min: 2, max: 4 } },
		{ regexp: /a{2,4}b{5,8}/, expected: { min: 7, max: 12 } },
		{ regexp: /(?:b{2,4}){5,8}/, expected: { min: 10, max: 32 } },
		{ regexp: /(?:b{2,3}c?){5,8}/, expected: { min: 10, max: 32 } },
		{ regexp: /(?:b+){5,8}/, expected: { min: 5, max: Infinity } },

		// Backreferences
		{ regexp: /(a)\1/, expected: { min: 2, max: 2 } },
		{ regexp: /(a{1,3})\1/, expected: { min: 2, max: 6 } },
		{ regexp: /(a){2}\1/, expected: { min: 3, max: 3 } },
		{ regexp: /(a{2})\1/, expected: { min: 4, max: 4 } },
		{ regexp: /(a)\1{3}/, expected: { min: 4, max: 4 } },
		{ regexp: /(a)?\1/, expected: { min: 0, max: 2 } },
		{ regexp: /(\b)\1/, expected: { min: 0, max: 0 } },
		{ regexp: /(a)|\1/, expected: { min: 0, max: 1 } },
		{ regexp: /(?:(a)|)\1/, expected: { min: 0, max: 2 } },
		{ regexp: /(?:(a)|)(?<backref>\1)/, expected: { min: 0, max: 1 }, selectNamed: true },
		{ regexp: /(?:(a)|b)\1/, expected: { min: 1, max: 2 } },
		{ regexp: /(a*)(?<backref>\1)/, expected: { min: 0, max: Infinity }, selectNamed: true },

		// Limitations:
		// "All characters classes/sets are assumed to consume at least one characters and all assertions are assumed
		// to have some accepting path."
		{ regexp: /a[]/, expected: { min: 2, max: 2 } },
		{ regexp: /a\bb/, expected: { min: 2, max: 2 } },
		{ regexp: /\b\B/, expected: { min: 0, max: 0 } },
		{ regexp: /a(?!b)b/, expected: { min: 2, max: 2 } },
	]);

	function test(cases: TestCase[]): void {
		for (const { regexp, selectNamed, expected } of cases) {
			const { pattern } = new RegExpParser().parseLiteral(regexp.toString());
			let elements;
			if (selectNamed) {
				elements = selectNamedGroups(pattern, selectNamed === true ? undefined : selectNamed);
			} else {
				elements = [pattern.alternatives];
			}

			for (const e of elements) {
				it(
					e === pattern.alternatives
						? `${regexp}`
						: `${regexp}: \`${Array.isArray(e) ? e.join("|") : e.raw}\``,
					function () {
						assert.deepEqual(RAA.getLengthRange(e), expected);
					}
				);
			}
		}
	}
});

describe(RAA.isLengthRangeMinZero.name, function () {
	it("should throw on empty array", function () {
		assert.throws(() => RAA.isLengthRangeMinZero([]));
	});
});
