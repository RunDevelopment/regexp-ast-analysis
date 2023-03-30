import { assert } from "chai";
import { RegExpParser } from "@eslint-community/regexpp";
import { OptionalMatchingDirection } from "../src";
import { getDeterminismEqClasses } from "../src/determinism";
import { assertSnapshot } from "./helper/snapshot";
import { visitParents } from "./helper/util";

describe(getDeterminismEqClasses.name, function () {
	const directionIndependentRegexes: RegExp[] = [
		/abc/,
		/a|b|c|d/,
		/a|aa|aaa|b|bb|bbb/,
		/a|b|c|d|[a-c]/,
		/ab|bc|ca/,
		/\bcircle|ellipse|closest|farthest|contain|cover\b/,
		/\p{L}|[a-z]|\d+/u,
		/(int|integer)\b/,
		/device_ios_(?:ipad|ipad_retina|iphone|iphone5|iphone6|iphone6plus|iphone_retina|unknown)\b/,

		// this is an interesting example because a naive algorithm might
		// take 2^20 steps
		/aaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbb|[^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^][^]/,
		/a{20}|b{20}|[^]{20}/,
		/a{20}c|b{20}a|[^]{20}b/,
		/(?:script|source)_foo|sample/,
	];
	const directionalRegexes: RegExp[] = [
		/abc|a/,
		/aa\d+|ba\d+/,
		/a.*b|b.*b|c.*a/,
		/a.*b|b.*b|b.*a/,
		/int|integer/,
		/a{20}c|b{20}a|[^]{19}b/,

		/anchor_1_x|anchor_1_y|anchor_2_x|anchor_2_y|reaction_force_x|reaction_force_y|reaction_torque|motor_speed|angle|motor_torque|max_motor_torque|translation|speed|motor_force|max_motor_force|length_1|length_2|damping_ratio|frequency|lower_angle_limit|upper_angle_limit|angle_limits|max_length|max_torque|max_force/,
		/>>=?|<<=?|->|--|\+\+|&&|\|\||[?:~]|<=>|[-+*/%&|^!=<>]=?|\b(?:and|and_eq|bitand|bitor|not|not_eq|or|or_eq|xor|xor_eq)\b/,
	];

	type AllEqClasses = Record<OptionalMatchingDirection, Record<string, string[]>>;

	function getAllEqClasses(regex: RegExp): AllEqClasses {
		const directions: OptionalMatchingDirection[] = ["ltr", "rtl", "unknown"];
		const result: AllEqClasses = { ltr: {}, rtl: {}, unknown: {} };

		const { pattern, flags } = new RegExpParser().parseLiteral(regex.toString());

		visitParents(pattern, parent => {
			for (const dir of directions) {
				const classes = getDeterminismEqClasses(parent.alternatives, dir, flags);

				assert.equal(
					classes.reduce((p, c) => p + c.length, 0),
					parent.alternatives.length,
					"expected the number of returned alternatives to be the same as the number of input alternatives."
				);

				result[dir][parent.raw] = classes
					.map(eq =>
						[...eq]
							.sort((a, b) => a.start - b.start)
							.map(a => a.raw)
							.join("|")
					)
					.sort();
			}
		});

		return result;
	}

	for (const regex of directionIndependentRegexes) {
		it(regex.toString(), function () {
			const actual = getAllEqClasses(regex);
			assert.deepEqual(actual.ltr, actual.unknown, "expected ltr to be equal to unknown direction");
			assert.deepEqual(actual.rtl, actual.unknown, "expected rtl to be equal to unknown direction");
			assertSnapshot(actual.ltr);
		});
	}

	for (const regex of directionalRegexes) {
		it(regex.toString(), function () {
			const actual = getAllEqClasses(regex);
			assertSnapshot(actual);
		});
	}
});
