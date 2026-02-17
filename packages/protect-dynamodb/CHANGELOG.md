# @cipherstash/protect-dynamodb

## 9.0.0

### Patch Changes

- Updated dependencies [db72e2c]
- Updated dependencies [e769740]
  - @cipherstash/protect@10.5.0

## 8.0.0

### Patch Changes

- Updated dependencies [9ccaf68]
  - @cipherstash/protect@10.4.0

## 7.0.0

### Patch Changes

- Updated dependencies [a1fce2b]
- Updated dependencies [622b684]
  - @cipherstash/protect@10.3.0

## 6.0.1

### Patch Changes

- @cipherstash/protect@10.2.1

## 6.0.0

### Patch Changes

- Updated dependencies [de029de]
  - @cipherstash/protect@10.2.0

## 5.1.1

### Patch Changes

- Updated dependencies [ff4421f]
  - @cipherstash/protect@10.1.1

## 5.1.0

### Patch Changes

- Updated dependencies [6b87c17]
  - @cipherstash/protect@10.1.0

## 5.0.2

### Patch Changes

- @cipherstash/protect@10.0.2

## 5.0.1

### Patch Changes

- @cipherstash/protect@10.0.1

## 5.0.0

### Major Changes

- 788dbfc: Added JSON and INT data type support and update FFI to v0.17.1 with x86_64 musl environment platform support.

  - Update @cipherstash/protect-ffi from 0.16.0 to 0.17.1 with support for x86_64 musl platforms.
  - Add searchableJson() method to schema for JSON field indexing (the search operations still don't work but this interface exists)
  - Refactor type system: EncryptedPayload → Encrypted, add JsPlaintext
  - Add comprehensive test suites for JSON, integer, and basic encryption
  - Update encryption format to use 'k' property for searchable JSON
  - Remove deprecated search terms tests for JSON fields
  - Simplify schema data types to text, int, json only
  - Update model helpers to handle new encryption format
  - Fix type safety issues in bulk operations and model encryption

### Patch Changes

- Updated dependencies [788dbfc]
  - @cipherstash/protect@10.0.0

## 4.0.0

### Patch Changes

- Updated dependencies [c7ed7ab]
- Updated dependencies [211e979]
  - @cipherstash/protect@9.6.0

## 3.0.0

### Minor Changes

- 6f45b02: Fully implemented audit metadata functionality.

### Patch Changes

- Updated dependencies [6f45b02]
  - @cipherstash/protect@9.5.0

## 2.0.1

### Patch Changes

- @cipherstash/protect@9.4.1

## 2.0.0

### Patch Changes

- Updated dependencies [1cc4772]
  - @cipherstash/protect@9.4.0

## 1.0.0

### Minor Changes

- 01fed9e: Added audit support for all protect and protect-dynamodb interfaces.

### Patch Changes

- Updated dependencies [01fed9e]
  - @cipherstash/protect@9.3.0

## 0.3.0

### Minor Changes

- 2b63ee1: Support nested protect schema in dynamodb helper functions.
- e33fbaf: Fixed bug when handling schema definitions without an equality flag.

## 0.2.0

### Minor Changes

- 5fc0150: Fix build and publish.

## 1.0.0

### Minor Changes

- c8468ee: Released initial version of the DynamoDB helper interface.

### Patch Changes

- Updated dependencies [c8468ee]
  - @cipherstash/protect@9.1.0
