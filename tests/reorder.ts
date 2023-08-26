import { RegExpParser } from "@eslint-community/regexpp";
import { Alternative, Pattern } from "@eslint-community/regexpp/ast";
import * as RAA from "../src";
import { assertSnapshot } from "./helper/snapshot";
import { visitParents } from "./helper/util";
import { TEST_REGEXES } from "./helper/data";

describe(RAA.canReorder.name, function () {
	function iterateAlternatives(pattern: Pattern): Iterable<Alternative[]> {
		const result: Alternative[][] = [];

		visitParents(pattern, parent => {
			result.push(parent.alternatives);
		});

		return result;
	}

	const options: Required<RAA.CanReorderOptions>[] = [
		{ matchingDirection: "ltr", ignoreCapturingGroups: false },
		{ matchingDirection: "rtl", ignoreCapturingGroups: false },
		{ matchingDirection: "unknown", ignoreCapturingGroups: false },
		{ matchingDirection: "ltr", ignoreCapturingGroups: true },
		{ matchingDirection: "rtl", ignoreCapturingGroups: true },
		{ matchingDirection: "unknown", ignoreCapturingGroups: true },
	];

	for (const regex of TEST_REGEXES) {
		it(regex.toString(), function () {
			const { pattern, flags } = new RegExpParser().parseLiteral(regex.toString());

			const actual: Record<string, Record<string, Record<string, boolean>>> = {};
			for (const alternatives of iterateAlternatives(pattern)) {
				if (alternatives.length < 2) continue;

				const a = (actual[alternatives[0].parent.raw] ??= {});
				const o = (a[alternatives.map(a => a.raw).join("|")] ??= {});
				for (const opt of options) {
					const key = `dir:${opt.matchingDirection.padEnd(7)} ignoreCG:${String(
						opt.ignoreCapturingGroups
					).padEnd(5)}`;
					o[key] = RAA.canReorder(alternatives, flags, opt);
				}
			}

			assertSnapshot(actual);
		});
	}
});
