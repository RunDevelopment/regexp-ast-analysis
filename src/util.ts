export function assertNever(value: never, message?: string): never {
	throw new Error(message || value);
}

export const isReadonlyArray: (value: unknown) => value is readonly unknown[] = Array.isArray;
