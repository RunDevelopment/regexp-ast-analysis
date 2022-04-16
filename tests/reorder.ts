import { RegExpParser } from "regexpp";
import { Alternative, Pattern } from "regexpp/ast";
import * as RAA from "../src";
import { assertSnapshot } from "./helper/snapshot";
import { visitParents } from "./helper/util";

describe(RAA.canReorder.name, function () {
	const regexes: RegExp[] = [
		/abc|a/,
		/abc|a\b/,
		/a|b|c|d/,
		/a|aa|aaa|b|bb|bbb/,
		/a|b|c|d|[a-c]/,
		/ab|bc|ca/,
		/\bcircle|ellipse|closest|farthest|contain|cover\b/,
		/\p{L}|[a-z]|\d+/u,
		/\p{L}|[a-z]|\d+/iu,
		/(int|integer)\b/,
		/device_ios_(?:ipad|ipad_retina|iphone|iphone5|iphone6|iphone6plus|iphone_retina|unknown)\b/,
		/0|1|2|3/,
		/0|(1)|2|3/,
		/0|(1)|2|(3)/,
		/0|0|1|1|2|3|44/,
		/\b(a|b|aa|\w|\d)\b/,
		/foo|bar/,
		/int|integer/,
		/aaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbb|[^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^]/,
		/a{20}|b{20}|[^]{20}/,
		/a{20}c|b{20}a|[^]{20}b/,
		/(?:script|source)_foo|sample/,
		/aa\d+|ba\d+/,
		/a.*b|b.*b|c.*a/,
		/a.*b|b.*b|b.*a/,
		/a{20}c|b{20}a|[^]{19}b/,
		/a{20}c|b{20}a|[^]{19}b\b/,
		/anchor_1_x|anchor_1_y|anchor_2_x|anchor_2_y|reaction_force_x|reaction_force_y|reaction_torque|motor_speed|angle|motor_torque|max_motor_torque|translation|speed|motor_force|max_motor_force|length_1|length_2|damping_ratio|frequency|lower_angle_limit|upper_angle_limit|angle_limits|max_length|max_torque|max_force/,
		/anchor_1_x|anchor_1_y|anchor_2_x|anchor_2_y|reaction_force_x|reaction_force_y|reaction_torque|motor_speed|angle\b|motor_torque|max_motor_torque|translation|speed|motor_force|max_motor_force|length_1|length_2|damping_ratio|frequency|lower_angle_limit|upper_angle_limit|angle_limits|max_length|max_torque|max_force/,
		/>>=?|<<=?|->|--|\+\+|&&|\|\||[?:~]|<=>|[-+*/%&|^!=<>]=?|\b(?:and|and_eq|bitand|bitor|not|not_eq|or|or_eq|xor|xor_eq)\b/,
	];

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

	for (const regex of regexes) {
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
