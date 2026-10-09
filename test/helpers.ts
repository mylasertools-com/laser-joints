import assert from 'node:assert/strict';
export function defined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'Expected a generated value.');
  return value;
}
/** Deliberately bypass compile-time input types to test runtime rejection. */
export function unchecked<Options, Result>(
  fn: (options: Options) => Result,
  input: unknown,
): Result {
  return fn(input as Options);
}
