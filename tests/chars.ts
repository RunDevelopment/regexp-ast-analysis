import { RegExpParser } from "@eslint-community/regexpp";
import { selectSingleChar } from "./helper/select";
import * as RAA from "../src";
import { assert } from "chai";

describe("Chars", function () {
	it(RAA.Chars.empty.name, function () {
		[/[]/, /[]/u, /[^\s\S]/, /[^\s\S]/u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.empty(flags).isEmpty);
				assert.isTrue(RAA.Chars.empty(flags).equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars));
			});
	});

	it(RAA.Chars.all.name, function () {
		[/[^]/, /[^]/u, /./s, /./su]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.all(flags).isAll);
				assert.isTrue(RAA.Chars.all(flags).equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars));
			});
	});

	it(RAA.Chars.word.name, function () {
		[/\w/, /\w/u, /\w/i, /\w/iu]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.word(flags).equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars));
			});
	});

	it(RAA.Chars.digit.name, function () {
		[/\d/, /\d/u, /\d/i, /\d/iu]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.digit(flags).equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars));
			});
	});

	it(RAA.Chars.space.name, function () {
		[/\s/, /\s/u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(RAA.Chars.space(flags).equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars));
			});
	});

	it(RAA.Chars.lineTerminator.name, function () {
		[/./, /./u]
			.map(r => new RegExpParser().parseLiteral(r.toString()))
			.forEach(({ pattern, flags }) => {
				assert.isTrue(
					RAA.Chars.lineTerminator(flags)
						.negate()
						.equals(RAA.toUnicodeSet(selectSingleChar(pattern), flags).chars)
				);
			});
	});
});
