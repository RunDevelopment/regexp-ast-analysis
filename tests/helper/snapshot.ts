import { use, expect } from "chai";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";
import { CharSet } from "refa";

use(jestSnapshotPlugin({}));
expect.addSnapshotSerializer({
	test: cs => cs instanceof CharSet,
	print: cs => String(cs),
});

export function assertSnapshot(value: unknown, message?: string): void {
	expect(value, message).toMatchSnapshot();
}
