# Changelog

## 0.5.1 (2022-04-18)

### Fixed

- Fixed `getLongestPrefix` not caching correctly.


## 0.5.0 (2022-04-18)

### Breaking

- `getLengthRange` will now throw a `RangeError` instead of returning `undefined` for empty arrays.

### Added

- Added `isLengthRangeMinZero` function that is equivalent to `getLengthRange(e).min === 0` but implemented more efficiently.
- Added `onlyInside` option for `getLongest` function.


## 0.4.1 (2022-04-17)

### Improved

- `canReorder` can now prove more alternatives to be safe to reorder.
- `canReorder` will now create a cache if none is provided.


## 0.4.0 (2022-04-16)

### Breaking

- Dropped support for NodeJS 10. The library will likely still work on this NodeJS version, but it won't be tested and NodeJS-10-specific bugs will be rejected.

### Added

- Added `containsCapturingGroup`.
- Added `getLongestPrefix`.
- Added `canReorder`.


## 0.3.0 (2021-09-04)

### Breaking

- The `FirstLookChar`, `FirstFullyConsumedChar`, and `FirstPartiallyConsumedChar` interfaces are now immutable.

### Added

- Added transparent caching for all functions taking flags.
- Added `FirstConsumedChars` and `FirstLookChars` namespaces. They contain methods for working with `FirstLookChar`s and `FirstConsumedChar`s.
- Added `FollowOperations.continueOutside` to improve analysis inside lookaround assertions.
- Added `FollowEndReason` type.
- `followPaths` now supports alternatives as the start element.
- The `getFirst{Consumed,}Char*` functions now supports alternatives as the after-this element.

### Improved

- The `getFirst{Consumed,}Char*` functions can now look outside of lookarounds to return better results.
- Improved how the `exact` property of `FirstConsumedChar`s is determined. `getFirstConsumedChar` will now return better results.
- Improved documentation.
- Lots of internal refactoring and improvements.

### Fixed

- Fixed that `getFirstConsumedChar` sometimes returned partially consumed chars with trivially rejecting looks instead of a fully consumed char.


## 0.2.4 (2021-08-12)

### Fixed

- Fixed `getFirst{Consumed,}Char*` functions taking exponential time for some word boundary assertions.


## 0.2.3 (2021-07-15)

### Changed

- Updated refa and regexpp.


## 0.2.2 (2021-06-03)

### Changed

- All `getFirst{Consumed,}Char*` functions can now handle word boundary assertions.


## 0.2.1 (2021-06-01)

### Changed

- Added support for `d` flag.


## 0.2.0 (2021-04-29)

### Breaking

- Private types aren't exported anymore. (They were never supposed to be exported in the first place.)

### Changed

- Updated refa to v0.8.


## 0.1.3 (2021-04-13)

### Fixed

- `isEmptyBackreference`: Fixed stack overflow for circular nested backreferences.

### Changed

- `is{Empty,Strict}Backreference`: More efficient implementation.
- `hasSome{Ancestor,Descendant}`: Node can now be given to the functions instead of condition functions.
- `getClosestAncestor`: The return type is now stricter and exported as `ClosestAncestor<A, B>`.


## 0.1.2 (2021-04-12)

### Fixed

- `is{Empty,Strict}Backreference`: These two functions will now properly account for capturing groups inside negated lookarounds.


## 0.1.1 (2021-04-09)

### Added

- Package meta information.


## 0.1.0 (2021-04-09)

Initial release.
