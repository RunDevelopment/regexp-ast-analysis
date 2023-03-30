import { RegExpParser } from "@eslint-community/regexpp";
import { Character, CharacterClassRange, CharacterSet, Flags } from "@eslint-community/regexpp/ast";
import { select, selectSingleChar } from "./helper/select";
import * as RAA from "../src";
import { assert } from "chai";
import { CharSet, JS } from "refa";

describe("Chars", function () {
	it(RAA.Chars.empty.name, function () {
		[/[]/, /[]/u, /[^\s\S]/, /[^\s\S]/u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.empty(flags).isEmpty);
				assert.isTrue(RAA.Chars.empty(flags).equals(RAA.toCharSet(selectSingleChar(pattern), flags)));
			});
	});

	it(RAA.Chars.all.name, function () {
		[/[^]/, /[^]/u, /./s, /./su]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.all(flags).isAll);
				assert.isTrue(RAA.Chars.all(flags).equals(RAA.toCharSet(selectSingleChar(pattern), flags)));
			});
	});

	it(RAA.Chars.word.name, function () {
		[/\w/, /\w/u, /\w/i, /\w/iu]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.word(flags).equals(RAA.toCharSet(selectSingleChar(pattern), flags)));
			});
	});

	it(RAA.Chars.digit.name, function () {
		[/\d/, /\d/u, /\d/i, /\d/iu]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.digit(flags).equals(RAA.toCharSet(selectSingleChar(pattern), flags)));
			});
	});

	it(RAA.Chars.space.name, function () {
		[/\s/, /\s/u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.space(flags).equals(RAA.toCharSet(selectSingleChar(pattern), flags)));
			});
	});

	it(RAA.Chars.lineTerminator.name, function () {
		[/./, /./u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(
					RAA.Chars.lineTerminator(flags)
						.negate()
						.equals(RAA.toCharSet(selectSingleChar(pattern), flags))
				);
			});
	});
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
	});
});
