import { RegExpParser } from "regexpp";
import { Backreference, CapturingGroup } from "regexpp/ast";
import { select } from "./helper/select";
import * as RAA from "../src";
import { assert } from "chai";

describe(RAA.backreferenceAlwaysAfterGroup.name, function () {
	function test(expected: boolean, regexps: RegExp[]): void {
		describe(`${expected}`, function () {
			regexps
				.map(r => new RegExpParser().parseLiteral(r.toString()))
				.forEach(r => {
					it(`${r.raw}`, function () {
						const refs = select(r.pattern, (e): e is Backreference => e.type === "Backreference");
						for (const ref of refs) {
							assert.equal(RAA.backreferenceAlwaysAfterGroup(ref), expected);
						}
					});
				});
		});
	}

	test(true, [/(a)\1/, /(a)(?:b|\1)/, /(a)\1?/, /(?<=\1(a))b/]);
	test(false, [/(a)|\1/, /(?:(a)|b)\1/, /(a)?\1/, /(?<=(a)\1)b/]);
});

describe(RAA.isEmptyBackreference.name, function () {
	function test(expected: boolean, regexps: RegExp[]): void {
		describe(`${expected}`, function () {
			regexps
				.map(r => new RegExpParser().parseLiteral(r.toString()))
				.forEach(r => {
					it(`${r.raw}`, function () {
						const refs = select(r.pattern, (e): e is Backreference => e.type === "Backreference");
						for (const ref of refs) {
							assert.equal(RAA.isEmptyBackreference(ref), expected);
						}
					});
				});
		});
	}

	test(true, [/(\b)a\1/, /(a)b|\1/, /(a\1)/, /\1(a)/, /(?:\1(a))+/, /(?<=(a)\1)b/]);
	test(false, [/(?:(a)|b)\1/, /(a)?\1/, /(a)\1/]);
});

describe(RAA.getCapturingGroupNumber.name, function () {
	function test(regexps: RegExp[]): void {
		for (const regexp of regexps) {
			it(`${regexp}`, function () {
				const { pattern } = new RegExpParser().parseLiteral(regexp.toString());

				const caps = select(pattern, (e): e is CapturingGroup => e.type === "CapturingGroup");
				for (const cap of caps) {
					assert.equal(RAA.getCapturingGroupNumber(cap), Number((cap.name || "").slice(1)));
				}
			});
		}
	}

	test([/(?<_1>)(?<_2>)(?<_3>)/, /(?<_1>)|(?<_2>)|(?<_3>)/, /(?<_1>(?<_2>(?<_3>)))/]);
});
