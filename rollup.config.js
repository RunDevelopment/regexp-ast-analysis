import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default /** @type {import('rollup').RollupOptions[]} */ ([
	{
		input: ".out/index.js",
		external: ["@eslint-community/regexpp", "refa"],
		output: {
			file: "index.js",
			format: "cjs",
			sourcemap: true
		},
		plugins: [
			nodeResolve(),
			terser({ compress: { pure_funcs: ['debugAssert'] } }),
		],
	},
]);

