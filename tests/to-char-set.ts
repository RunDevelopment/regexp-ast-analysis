import { RegExpParser } from "@eslint-community/regexpp";
import {
	Character,
	CharacterClass,
	CharacterClassRange,
	CharacterSet,
	Flags,
	Pattern,
} from "@eslint-community/regexpp/ast";
import { select, selectSingleChar } from "./helper/select";
import * as RAA from "../src";
import { Model, Predicate, testModel } from "./helper/model";
import { assert } from "chai";
import { CharSet, JS } from "refa";

describe("matches {no,all} characters", function () {
	interface CharMatchCase {
		regexp: RegExp;
		pattern: Pattern;
		flags: Flags;
		element: Character | CharacterClass | CharacterSet;
	}
	function toCharMatchCase(regexp: RegExp): CharMatchCase {
		const { pattern, flags } = new RegExpParser().parseLiteral(regexp.toString());
		return {
			regexp,
			pattern,
			flags,
			element: selectSingleChar(pattern),
		};
	}

	const matchesAll = new Predicate<CharMatchCase>("matchesAllCharacters", ({ element, flags }) =>
		RAA.matchesAllCharacters(element, flags)
	);
	const matchesNone = new Predicate<CharMatchCase>("matchesNoCharacters", ({ element, flags }) =>
		RAA.matchesNoCharacters(element, flags)
	);
	const toCharSetIsAll = new Predicate<CharMatchCase>(
		"toCharSet(e).isAll",
		({ element, flags }) => RAA.toCharSet(element, flags).isAll
	);
	const toCharSetIsEmpty = new Predicate<CharMatchCase>(
		"toCharSet(e).isEmpty",
		({ element, flags }) => RAA.toCharSet(element, flags).isEmpty
	);

	const model = new Model<CharMatchCase>();

	model.equivalence(matchesAll, toCharSetIsAll);
	model.equivalence(matchesNone, toCharSetIsEmpty);

	model.implication(matchesAll, matchesNone.not());
	model.implication(matchesNone, matchesAll.not());

	model.add(
		matchesAll,
		[/./s, /[^]/, /[\s\S]/, /[\w\D]/, /[\0-\uFFFF]/, /[\0-\u{10FFFF}]/u, /[\0-\xFF\P{ASCII}]/u].map(toCharMatchCase)
	);
	model.add(
		matchesNone,
		[/[]/, /[^\s\S]/, /[^\w\D]/, /[^\0-\uFFFF]/, /[^\0-\u{10FFFF}]/u, /[^\0-\xFF\P{ASCII}]/u].map(toCharMatchCase)
	);

	model.add(
		[matchesAll.not(), matchesNone.not()],
		[/a/, /\s/, /\S/, /./, /[.]/s, /\p{ASCII}/u, /[\0-\uFFFF]/u].map(toCharMatchCase)
	);

	testModel(model, ({ regexp }) => regexp.toString());
});

describe(RAA.toCharSet.name, function () {
	const { pattern, flags } = new RegExpParser().parseLiteral(/.[.a\w\s\p{ASCII}a-f][^a][^\S][^][]/u.toString());
	const elements = select(
		pattern,
		(e): e is RAA.ToCharSetElement =>
			e.type === "Character" ||
			e.type === "CharacterClass" ||
			e.type === "CharacterClassRange" ||
			e.type === "CharacterSet"
	);

	function elementsToCharSet(elements: (Character | CharacterSet | CharacterClassRange)[], flags: Flags): CharSet {
		return JS.createCharSet(
			elements.map(e => {
				if (e.type === "Character") {
					return { min: e.value, max: e.value };
				} else if (e.type === "CharacterClassRange") {
					return { min: e.min.value, max: e.max.value };
				} else {
					return e;
				}
			}),
			flags
		);
	}
	function simpleToCharSet(element: RAA.ToCharSetElement, flags: Flags): CharSet {
		if (element.type === "CharacterClass") {
			if (element.negate) {
				return elementsToCharSet(element.elements, flags).negate();
			} else {
				return elementsToCharSet(element.elements, flags);
			}
		} else {
			return elementsToCharSet([element], flags);
		}
	}

	describe("union", function () {
		for (const a of elements) {
			it(`${a.type} \`${a.raw}\``, function () {
				for (const b of elements) {
					const expected = RAA.toCharSet(a, flags).union(RAA.toCharSet(b, flags));
					const actual = RAA.toCharSet([a, b], flags);

					assert.isTrue(
						expected.equals(actual),
						`${a.type} \`${a.raw}\` and ${b.type} \`${b.raw}\`: Expected ${expected} but found ${actual}`
					);
				}
			});
		}
	});

	describe("correct", function () {
		for (const c of elements) {
			it(`${c.type} \`${c.raw}\``, function () {
				const expected = simpleToCharSet(c, flags);
				const actual1 = RAA.toCharSet(c, flags);
				const actual2 = RAA.toCharSet([c], flags);
				const actual3 = RAA.toCharSet([c, c], flags);

				assert.isTrue(expected.equals(actual1));
				assert.isTrue(expected.equals(actual2));
				assert.isTrue(expected.equals(actual3));
			});
		}

		it(`empty`, function () {
			assert.isTrue(RAA.toCharSet([], {}).isEmpty);
			assert.isTrue(RAA.toCharSet([], { unicode: true }).isEmpty);
		});
	});
});
