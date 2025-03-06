# @cipherstash/jseql

## 6.1.0

### Minor Changes

- 43e1acb: \* Added support for searching encrypted data
  - Added a schema strategy for defining your schema
  - Required schema to initialize the protect client

## 6.0.0

### Major Changes

- f4d8334: Released protectjs-ffi with toml file configuration support.
  Added a `withResult` pattern to all public facing functions for better error handling.
  Updated all documentation to reflect the new configuration pattern.

## 5.2.0

### Minor Changes

- 499c246: Implemented protectjs-ffi.

## 5.1.0

### Minor Changes

- 5a34e76: Rebranded logging context and fixed tests.

## 5.0.0

### Major Changes

- 76599e5: Rebrand jseql to protect.

## 4.0.0

### Major Changes

- 5c08fe5: Enforced lock context to be called as a proto function rather than an optional argument for crypto functions.
  There was a bug that caused the lock context to be interpreted as undefined when the users intention was to use it causing the encryption/decryption to fail.
  This is a breaking change for users who were using the lock context as an optional argument.
  To use the lock context, call the `withLockContext` method on the encrypt, decrypt, and bulk encrypt/decrypt functions, passing the lock context as a parameter rather than as an optional argument.

## 3.9.0

### Minor Changes

- e885975: Fixed improper use of throwing errors, and log with jseql logger.

## 3.8.0

### Minor Changes

- eeaec18: Implemented typing and import synatx for es6.

## 3.7.0

### Minor Changes

- 7b8ec52: Implement packageless logging framework.

## 3.6.0

### Minor Changes

- 7480cfd: Fixed node:util package bundling.

## 3.5.0

### Minor Changes

- c0123be: Replaced logtape with native node debuglog.

## 3.4.0

### Minor Changes

- 9a3132c: Implemented bulk encryption and decryptions.
- 9a3132c: Fixed the logtape peer dependency version.

## 3.3.0

### Minor Changes

- 80ee5af: Fixed bugs when implmenting the lock context with CTS v2 tokens.

## 3.2.0

### Minor Changes

- 0526f60: Use the latest jseql-ffi (0.4.0)
- fbb2bcb: Implemented CTS v2 for identity lock.

## 3.1.0

### Minor Changes

- 71ce612: Released support for LockContext initializer.
- e484718: Refactored init function to not require envrionment variables as arguments.
- e484718: Replaces jset with vitest for better typescript support.

## 3.0.0

### Major Changes

- 2eefb5f: Implemented jseql-ffi for inline crypto.

## 2.1.0

### Minor Changes

- 0536f03: Implemented new CsPlaintextV1Schema type and schema.

## 2.0.0

### Major Changes

- bea60c4: Added release management.

## 1.0.0

### Major Changes

- Released the initial version of jseql.
