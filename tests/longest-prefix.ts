/* eslint-disable no-useless-backreference */
import { assert } from "chai";
import { JS } from "refa";
import { RegExpParser, visitRegExpAST } from "@eslint-community/regexpp";
import { Alternative } from "@eslint-community/regexpp/ast";
import * as RAA from "../src";
import { MatchingDirection } from "../src";
import { selectNamedGroups } from "./helper/select";
import { assertSnapshot } from "./helper/snapshot";

describe(RAA.getLongestPrefix.name, function () {
	const options: Required<RAA.GetLongestPrefixOptions>[] = [
		{ includeAfter: false, onlyInside: false, looseGroups: false },
		{ includeAfter: false, onlyInside: false, looseGroups: true },
		{ includeAfter: true, onlyInside: false, looseGroups: false },
		{ includeAfter: true, onlyInside: false, looseGroups: true },
		{ includeAfter: true, onlyInside: true, looseGroups: false },
		{ includeAfter: true, onlyInside: true, looseGroups: true },
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
		/^(?<this>(?:a|ab))c/u,
		/^(?:(?<this>a)|ab)c/u,

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
					const parsed = new RegExpParser().parseLiteral(regex.toString());
					const { pattern } = parsed;
					const flags = RAA.toCache(parsed.flags);
					if (!JS.isFlags(flags)) {
						throw new Error("Invalid flags");
					}

					const parent = selectNamedGroups(pattern, /^this$/)[0] ?? pattern;
					const alternatives: Alternative[] = [];
					visitRegExpAST(parent, {
						onAlternativeEnter(a) {
							if (a.parent.type === "Assertion") return;
							alternatives.push(a);
						},
					});

					const actual: Record<string, Record<string, RegExp>> = {};
					for (const alternative of alternatives) {
						const a = (actual[`${alternative.start}: ${alternative.raw}`] ??= {});

						const hasGroups = RAA.hasSomeDescendant(
							alternative,
							d => d.type === "Group" || d.type === "CapturingGroup"
						);

						for (const o of options) {
							if (!hasGroups && o.looseGroups) {
								const loose = RAA.getLongestPrefix(alternative, direction, flags, o);
								const strict = RAA.getLongestPrefix(alternative, direction, flags, {
									...o,
									looseGroups: false,
								});

								assert.deepStrictEqual(loose, strict);
								continue;
							}

							const prefix = RAA.getLongestPrefix(alternative, direction, flags, o);

							const literal = JS.toLiteral(
								{
									type: "Concatenation",
									elements: prefix.map(cs => ({ type: "CharacterClass", characters: cs })),
								},
								{ flags }
							);
							const key = `insideAfter:${o.includeAfter} onlyInside:${o.onlyInside} looseG:${o.looseGroups}`;
							a[key] = RegExp(literal.source, literal.flags);
						}
					}

					assertSnapshot(actual);
				});
			}
		}
	}
});
