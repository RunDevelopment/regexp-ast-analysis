# Changelog

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
