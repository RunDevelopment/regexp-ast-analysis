import { RegExpParser } from "@eslint-community/regexpp";
import {
	Character,
	CharacterClass,
	CharacterSet,
	ExpressionCharacterClass,
	Flags,
	Pattern,
} from "@eslint-community/regexpp/ast";
import { select, selectSingleChar } from "./helper/select";
import * as RAA from "../src";
import { Model, Predicate, testModel } from "./helper/model";
import { assert } from "chai";

describe("matches {no,all} characters", function () {
	interface CharMatchCase {
		regexp: string;
		pattern: Pattern;
		flags: Flags;
		element: Character | CharacterClass | CharacterSet | ExpressionCharacterClass;
	}
	function toCharMatchCase(regexp: RegExp | string): CharMatchCase {
		regexp = regexp.toString();
		const { pattern, flags } = new RegExpParser().parseLiteral(regexp);
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
	const hasStrings = new Predicate<CharMatchCase>("hasStrings", ({ element, flags }) =>
		RAA.hasStrings(element, flags)
	);
	const lengthIsOne = new Predicate<CharMatchCase>("lengthIsOne", ({ element, flags }) => {
		const range = RAA.getLengthRange(element, flags);
		return range.min === 1 && range.max === 1;
	});
	const toUnicodeSetIsAll = new Predicate<CharMatchCase>(
		"toUnicodeSet(e).chars.isAll",
		({ element, flags }) => RAA.toUnicodeSet(element, flags).chars.isAll
	);
	const toUnicodeSetIsEmpty = new Predicate<CharMatchCase>(
		"toUnicodeSet(e).isEmpty",
		({ element, flags }) => RAA.toUnicodeSet(element, flags).isEmpty
	);

	const model = new Model<CharMatchCase>();

	model.equivalence(matchesAll, toUnicodeSetIsAll);
	model.equivalence(matchesNone, toUnicodeSetIsEmpty);
	model.equivalence(lengthIsOne, hasStrings.not());

	model.implication(matchesAll, matchesNone.not());
	model.implication(matchesNone, matchesAll.not());
	model.implication(matchesNone, hasStrings.not());

	model.add(
		matchesAll,
		[
			/./s,
			/[^]/,
			/[\s\S]/,
			/[\w\D]/,
			/[\0-\uFFFF]/,
			/[\0-\u{10FFFF}]/u,
			/[\0-\xFF\P{ASCII}]/u,
			String.raw`/[\0-\xFF\P{ASCII}]/v`,
			String.raw`/[\s\S\q{abc}]/v`,
			String.raw`/[[\s\S\q{}]&&[^]]/v`,
		].map(toCharMatchCase)
	);
	model.add(
		matchesNone,
		[
			/[]/,
			/[^\s\S]/,
			/[^\w\D]/,
			/[^\0-\uFFFF]/,
			/[^\0-\u{10FFFF}]/u,
			/[^\0-\xFF\P{ASCII}]/u,
			String.raw`/[^\0-\xFF\P{ASCII}]/v`,
			String.raw`/[^\s\S]/v`,
			String.raw`/[a&&b]/v`,
			String.raw`/[a--\w]/v`,
		].map(toCharMatchCase)
	);

	model.add(
		[matchesAll.not(), matchesNone.not()],
		[
			/a/,
			/\s/,
			/\S/,
			/./,
			/[.]/s,
			/\p{ASCII}/u,
			/[\0-\uFFFF]/u,
			String.raw`/[^a]/v`,
			String.raw`/[\q{}]/v`,
			String.raw`/[a&&\w]/v`,
			String.raw`/\p{Basic_Emoji}/v`,
			String.raw`/[\p{Basic_Emoji}&&[\s\S]]/v`,
		].map(toCharMatchCase)
	);

	model.add(
		[lengthIsOne],
		[
			/a/,
			/\s/,
			/\S/,
			/./,
			/[.]/s,
			/\p{ASCII}/u,
			/[\0-\uFFFF]/u,
			String.raw`/[^a]/v`,
			String.raw`/[a&&\w]/v`,
			String.raw`/[\p{Basic_Emoji}&&[\s\S]]/v`,
		].map(toCharMatchCase)
	);

	model.add(
		[hasStrings],
		[String.raw`/[\q{}]/v`, String.raw`/[\q{abc}]/v`, String.raw`/\p{Basic_Emoji}/v`].map(toCharMatchCase)
	);

	testModel(model, ({ regexp }) => regexp);
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
				const expected = RAA.toCharSet(c, flags);
				const actual1 = RAA.toCharSet([c], flags);
				const actual2 = RAA.toCharSet([c, c], flags);

				assert.isTrue(expected.equals(actual1));
				assert.isTrue(expected.equals(actual2));
			});
		}

		it(`empty`, function () {
			assert.isTrue(RAA.toCharSet([], {}).isEmpty);
			assert.isTrue(RAA.toCharSet([], { unicode: true }).isEmpty);
		});
	});
});

describe(RAA.toUnicodeSet.name, function () {
	const { pattern, flags } = new RegExpParser().parseLiteral(/.[.a\w\s\p{ASCII}a-f][^a][^\S][^][]/u.toString());
	const elements = select(
		pattern,
		(e): e is RAA.ToCharSetElement =>
			e.type === "Character" ||
			e.type === "CharacterClass" ||
			e.type === "CharacterClassRange" ||
			e.type === "CharacterSet"
	);

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
				const expected = RAA.toUnicodeSet(c, flags);
				const actual1 = RAA.toUnicodeSet([c], flags);
				const actual2 = RAA.toUnicodeSet([c, c], flags);

				assert.isTrue(expected.equals(actual1));
				assert.isTrue(expected.equals(actual2));
			});
		}

		it(`empty`, function () {
			assert.isTrue(RAA.toUnicodeSet([], {}).isEmpty);
			assert.isTrue(RAA.toUnicodeSet([], { unicode: true }).isEmpty);
			assert.isTrue(RAA.toUnicodeSet([], { unicodeSets: true }).isEmpty);
		});
	});
});
