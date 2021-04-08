import { RegExpParser, visitRegExpAST } from "regexpp";
import { Alternative, Element, Flags, Pattern, RegExpLiteral } from "regexpp/ast";
import * as RAA from "../src";
import { Predicate, Model, testModel } from "./helper/model";

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
	({ selected }) => (RAA.getLengthRange(selected) ?? { min: Infinity, max: Infinity }).min === 0
);
const isLengthMaxZero = new Predicate<PredicateTestCaseInfo>(
	"getLengthRange(e).max == 0",
	({ selected }) => (RAA.getLengthRange(selected) ?? { min: Infinity, max: Infinity }).max === 0
);

const model = new Model<PredicateTestCaseInfo>();

model.implication(isEmpty, isPotentiallyEmpty);
model.implication(isEmpty, isZeroLength);
model.implication(isZeroLength, isPotentiallyZeroLength);
model.implication(isZeroLength, isLengthMaxZero);
model.implication(isPotentiallyEmpty, isPotentiallyZeroLength);
model.implication(isPotentiallyZeroLength, isLengthMinZero);

// test cases

model.add(
	isEmpty,
	true,
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
	isEmpty,
	false,
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
	true,
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
	isPotentiallyEmpty,
	false,
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
	true,
	casesToInfos([
		{ regexp: /\b/, whole: true },
		{ regexp: /(?:\b)+/, whole: true },
		{ regexp: /(?:\b){4}/, whole: true },
	])
);
model.add(
	isZeroLength,
	false,
	casesToInfos([
		{ regexp: /foo|\b/, whole: true },
		{ regexp: /(a)\1|\b/, whole: true },
	])
);

model.add(
	isPotentiallyZeroLength,
	true,
	casesToInfos([
		{ regexp: /foo|\b/, whole: true },
		{ regexp: /\b|\b/, whole: true },
	])
);
model.add(
	isPotentiallyZeroLength,
	false,
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

export interface PredicateTestCase {
	regexp: RegExp;
	raw?: string;
	whole?: boolean;
}
export interface PredicateTestCaseInfo {
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
