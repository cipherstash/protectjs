# @cipherstash/stack

## 0.11.0

### Minor Changes

- b0e56b8: Upgrade protect-ffi to 0.21.0 and enable array_index_mode for searchable JSON

  - Upgrade `@cipherstash/protect-ffi` to 0.21.0 across all packages
  - Enable `array_index_mode: 'all'` on STE vec indexes so JSON array operations
    (jsonb_array_elements, jsonb_array_length, array containment) work correctly
  - Delegate credential resolution entirely to protect-ffi's `withEnvCredentials`
  - Download latest EQL at build/runtime instead of bundling hardcoded SQL files

## 0.10.0

### Minor Changes

- 5245cd7: Improved CLI setup and initialization commands.

## 0.9.0

### Minor Changes

- 2b907a1: Improve CLI user experience for developer onboarding.

## 0.8.0

### Minor Changes

- 3414761: Fixed Supabase or wrapper to escape EQL payloads correctly.

## 0.7.0

### Minor Changes

- 1be8f81: Exposed a public method on the Encryption client to expose the build Encryption schema.

## 0.6.0

### Minor Changes

- 0b9fd7a: Add notes to CLI about init in prototype phase.

## 0.5.0

### Minor Changes

- a645115: ### Documentation

  - **TypeDoc**: Improved JSDoc for `Encryption()`, `EncryptOptions`, schema builders (`encryptedTable`, `encryptedColumn`, `encryptedField`, `EncryptedField`, `EncryptedTableColumn`), and `encrypt` / `bulkEncrypt` with clearer `@param`, `@returns`, `@throws`, `@example`, and `@see` links.
  - **README**: Refreshed main repo README and Stack package readme; basic example README now uses `npm install @cipherstash/stack`, CipherStash account and dashboard credentials, and drops Stash CLI references. Added docs badge linking to cipherstash.com/docs.

  ### Features

  - **Logging**: Logger is now used consistently across Stack client interfaces for initialization and operations.

## 0.4.0

### Minor Changes

- 5c3f4e7: Remove null support from encrypt and bulk encrypt operations to improve typescript support and reduce operation complexity.

## 0.3.0

### Minor Changes

- afe0a55: Improved encrypt model return types to account for Encrypted values.

## 0.2.0

### Minor Changes

- 68c8199: Improved typing for model interfaces and full bun support.

## 0.1.0

### Minor Changes

- 7ed89a5: Initial release of the CipherStash Stack.
