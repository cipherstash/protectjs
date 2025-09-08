# @cipherstash/protect

## 9.6.0

### Minor Changes

- c7ed7ab: Support TypeORM example with ES2022.
- 211e979: Added support for ES2022 and later.

## 9.5.0

### Minor Changes

- 6f45b02: Fully implemented audit metadata functionality.

## 9.4.1

### Patch Changes

- Updated dependencies [d0b02ea]
  - @cipherstash/schema@0.1.0

## 9.4.0

### Minor Changes

- 1cc4772: Released support for bulk encryption and decryption.

## 9.3.0

### Minor Changes

- 01fed9e: Added audit support for all protect and protect-dynamodb interfaces.

## 9.2.0

### Minor Changes

- 587f222: Added support for deeply nested protect schemas to support more complex model objects.

## 9.1.0

### Minor Changes

- c8468ee: Released initial version of the DynamoDB helper interface.

## 9.0.0

### Major Changes

- 1bc55a0: Implemented a more configurable pattern for the Protect client.

  This release introduces a new `ProtectClientConfig` type that can be used to configure the Protect client.
  This is useful if you want to configure the Protect client specific to your application, and will future proof any additional configuration options that are added in the future.

  ```ts
  import { protect, type ProtectClientConfig } from "@cipherstash/protect";

  const config: ProtectClientConfig = {
    schemas: [users, orders],
    workspaceCrn: "your-workspace-crn",
    accessKey: "your-access-key",
    clientId: "your-client-id",
    clientKey: "your-client-key",
  };

  const protectClient = await protect(config);
  ```

  The now deprecated method of passing your tables to the `protect` client is no longer supported.

  ```ts
  import { protect, type ProtectClientConfig } from "@cipherstash/protect";

  // old method (no longer supported)
  const protectClient = await protect(users, orders);

  // required method
  const config: ProtectClientConfig = {
    schemas: [users, orders],
  };

  const protectClient = await protect(config);
  ```

## 8.4.0

### Minor Changes

- a471821: Fixed a bug in the model interface to correctly handle undefined and null values.

## 8.3.0

### Minor Changes

- 628acdc: Implemented createSearchTerms for a streamlined way of working with encrypted search terms.

## 8.2.0

### Minor Changes

- 0883e16: Fix cipherstash.toml and cipherstash.secret.toml file loading by bumping to @cipherstash/protect-ffi v0.14.2

## 8.1.0

### Minor Changes

- 95c891d: Implemented CipherStash CRN in favor of workspace ID.

  - Replaces the environment variable `CS_WORKSPACE_ID` with `CS_WORKSPACE_CRN`
  - Replaces `workspace_id` with `workspace_crn` in the `cipherstash.toml` file

- 18d3653: Fixed handling composite types for EQL v2.

## 8.0.0

### Major Changes

- 8a4ea80: Implement EQL v2 data structure.

  - Support for Protect.js searchable encryption when using Supabase.
  - Encrypted payloads are now composite types which support searchable encryption with EQL v2 functions.
  - The `data` property is an object that matches the EQL v2 data structure.

## 7.0.0

### Major Changes

- 2cb2d84: Replaced bulk operations with model operations.

## 6.3.0

### Minor Changes

- a564f21: Bumped versions of dependencies to address CWE-346.

## 6.2.0

### Minor Changes

- fe4b443: Added symbolic link for protect readme.

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
