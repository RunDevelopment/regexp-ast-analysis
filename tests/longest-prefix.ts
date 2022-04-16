import { JS } from "refa";
import { RegExpParser } from "regexpp";
import * as RAA from "../src";
import { MatchingDirection } from "../src";
import { selectNamedGroups } from "./helper/select";
import { assertSnapshot } from "./helper/snapshot";

describe(RAA.getLongestPrefix.name, function () {
	const options: Required<RAA.GetLongestPrefixOptions>[] = [
		{ includeAfter: false, looseGroups: false },
		{ includeAfter: false, looseGroups: true },
		{ includeAfter: true, looseGroups: false },
		{ includeAfter: true, looseGroups: true },
	];

	test([
		/abc/,
		/a(?<this>bc)d/,

		// groups
		/a(foo|bar)z/,
		/a(b|c|d)z/,
		/a(b|c|de)z/,
		/(int|integer)/,
		/-(bets|bits)-/,
		/-(bets|bits|byte)-/,
		/=(script|source)/,
		/=(food|foot)-/,

		// assertions
		/^foo/,
		/foo$/,
		/a(?!c)b/,
		/(?<this>A)\b/,
		/^(?<this>A(?!a)(?!B))\w/m,
		/(?<this>A(?!a)(?:(?!B)|(?!C)))\w/,

		// quantifier
		/a?/,
		/a*/,
		/a+/,
		/a{4,7}/,
		/a{4,4}/,
		/a?b/,
		/a*b/,
		/a+b/,
		/a{4,7}b/,
		/a{4,4}b/,
		/a{0}b/,

		// backreference
		/(a)b(?<this>\1)c/,
		/(ab?)b(?<this>\1)c/,
		/(?:(a)|f)b(?<this>\1)c/,
		/(?<this>\1\2b)c(a)/,
	]);

	function test(regexes: RegExp[]): void {
		for (const direction of ["ltr", "rtl"] as MatchingDirection[]) {
			for (const regex of regexes) {
				it(`${regex} ${direction}`, function () {
					const { pattern, flags } = new RegExpParser().parseLiteral(regex.toString());
					const alternative = (selectNamedGroups(pattern, /^this$/)[0] ?? pattern).alternatives[0];
					const hasGroups = RAA.hasSomeDescendant(
						alternative,
						d => d.type === "Group" || d.type === "CapturingGroup"
					);

					const actual: Record<string, RegExp> = {};
					for (const o of options) {
						if (!hasGroups && o.looseGroups) continue;

						const prefix = RAA.getLongestPrefix(alternative, direction, flags, o);

						const literal = JS.toLiteral(
							{
								type: "Concatenation",
								elements: prefix.map(cs => ({ type: "CharacterClass", characters: cs })),
							},
							{ flags }
						);
						actual[JSON.stringify(o)] = RegExp(literal.source, literal.flags);
					}

					assertSnapshot(actual);
				});
			}
		}
	}
});
