import { RegExpParser } from "@eslint-community/regexpp";
import * as RAA from "../src";
import { assertSnapshot } from "./helper/snapshot";
import { TEST_REGEXES } from "./helper/data";

describe(RAA.getConsumedChars.name, function () {
	for (const regex of TEST_REGEXES) {
		it(regex.toString(), function () {
			const { pattern, flags } = new RegExpParser().parseLiteral(regex.toString());

			assertSnapshot(RAA.getConsumedChars(pattern, flags));
		});
	}
});
