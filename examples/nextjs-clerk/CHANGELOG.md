# @cipherstash/nextjs-clerk-example

## 0.2.12

### Patch Changes

- Updated dependencies [ff4421f]
  - @cipherstash/protect@10.1.1

## 0.2.11

### Patch Changes

- Updated dependencies [6b87c17]
  - @cipherstash/protect@10.1.0

## 0.2.10

### Patch Changes

- @cipherstash/protect@10.0.2

## 0.2.9

### Patch Changes

- @cipherstash/protect@10.0.1

## 0.2.8

### Patch Changes

- Updated dependencies [788dbfc]
  - @cipherstash/protect@10.0.0

## 0.2.7

### Patch Changes

- Updated dependencies [c7ed7ab]
- Updated dependencies [211e979]
  - @cipherstash/protect@9.6.0

## 0.2.6

### Patch Changes

- Updated dependencies [6f45b02]
  - @cipherstash/protect@9.5.0

## 0.2.5

### Patch Changes

- @cipherstash/protect@9.4.1

## 0.2.4

### Patch Changes

- Updated dependencies [1cc4772]
  - @cipherstash/protect@9.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [01fed9e]
  - @cipherstash/protect@9.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [587f222]
  - @cipherstash/protect@9.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [c8468ee]
  - @cipherstash/protect@9.1.0

## 0.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [1bc55a0]
  - @cipherstash/protect@9.0.0

## 0.1.6

### Patch Changes

- Updated dependencies [a471821]
  - @cipherstash/protect@8.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [628acdc]
  - @cipherstash/protect@8.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [0883e16]
  - @cipherstash/protect@8.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [95c891d]
- Updated dependencies [18d3653]
  - @cipherstash/nextjs@4.0.0
  - @cipherstash/protect@8.1.0

## 0.1.2

### Patch Changes

- Updated dependencies [8a4ea80]
  - @cipherstash/protect@8.0.0

## 0.1.1

### Patch Changes

- Updated dependencies [2cb2d84]
  - @cipherstash/protect@7.0.0

## 0.1.0

### Minor Changes

- 9377b47: Updated versions to address Next.js CVE.

### Patch Changes

- Updated dependencies [9377b47]
  - @cipherstash/nextjs@3.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [a564f21]
  - @cipherstash/protect@6.3.0
  - @cipherstash/nextjs@3.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [fe4b443]
  - @cipherstash/protect@6.2.0

## 0.0.2

### Patch Changes

- Updated dependencies [43e1acb]
  - @cipherstash/protect@6.1.0

## 0.0.1

### Patch Changes

- Updated dependencies [02dc980]
- Updated dependencies [f4d8334]
  - @cipherstash/nextjs@3.0.0
  - @cipherstash/protect@6.0.0
