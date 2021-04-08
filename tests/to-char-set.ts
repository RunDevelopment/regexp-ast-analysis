import { RegExpParser } from "regexpp";
import { Character, CharacterClass, CharacterSet, Flags, Pattern } from "regexpp/ast";
import { selectSingleChar } from "./helper/select";
import * as RAA from "../src";
import { Model, Predicate, testModel } from "./helper/model";

describe("to-char-set", function () {
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
