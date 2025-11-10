# @cipherstash/drizzle

## 1.0.0

### Minor Changes

- 2edfedd: Added support for encrypted or operation.
- 7b8c719: Added `generate-eql-migration` CLI command to automate EQL migration generation.

  This command consolidates the manual process of running `drizzle-kit generate --custom` and populating the SQL file into a single command. It uses the bundled EQL SQL from `@cipherstash/schema` for offline-friendly, version-locked installations.

  Usage:

  ```bash
  npx generate-eql-migration
  npx generate-eql-migration --name setup-eql
  npx generate-eql-migration --out migrations
  ```

### Patch Changes

- Updated dependencies [9005484]
  - @cipherstash/schema@2.0.0
  - @cipherstash/protect@10.0.2

## 0.2.0

### Minor Changes

- ebda487: Added explicit return type to extractProtectSchem.

## 0.1.0

### Minor Changes

- d8ed4d4: Released initial Drizzle ORM interface.

### Patch Changes

- Updated dependencies [d8ed4d4]
  - @cipherstash/schema@1.1.0
  - @cipherstash/protect@10.0.1
