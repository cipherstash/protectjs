# @cipherstash/basic-example

## 1.1.3

### Patch Changes

- Updated dependencies [01fed9e]
  - @cipherstash/protect@9.3.0

## 1.1.2

### Patch Changes

- Updated dependencies [587f222]
  - @cipherstash/protect@9.2.0

## 1.1.1

### Patch Changes

- Updated dependencies [c8468ee]
  - @cipherstash/protect@9.1.0

## 1.1.0

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

## 1.0.12

### Patch Changes

- Updated dependencies [a471821]
  - @cipherstash/protect@8.4.0

## 1.0.11

### Patch Changes

- Updated dependencies [628acdc]
  - @cipherstash/protect@8.3.0

## 1.0.10

### Patch Changes

- Updated dependencies [0883e16]
  - @cipherstash/protect@8.2.0

## 1.0.9

### Patch Changes

- Updated dependencies [95c891d]
- Updated dependencies [18d3653]
  - @cipherstash/protect@8.1.0

## 1.0.8

### Patch Changes

- Updated dependencies [8a4ea80]
  - @cipherstash/protect@8.0.0

## 1.0.7

### Patch Changes

- Updated dependencies [2cb2d84]
  - @cipherstash/protect@7.0.0

## 1.0.6

### Patch Changes

- Updated dependencies [a564f21]
  - @cipherstash/protect@6.3.0

## 1.0.5

### Patch Changes

- Updated dependencies [fe4b443]
  - @cipherstash/protect@6.2.0

## 1.0.4

### Patch Changes

- Updated dependencies [43e1acb]
  - @cipherstash/protect@6.1.0

## 1.0.3

### Patch Changes

- Updated dependencies [f4d8334]
  - @cipherstash/protect@6.0.0

## 1.0.2

### Patch Changes

- Updated dependencies [499c246]
  - @cipherstash/protect@5.2.0

## 1.0.1

### Patch Changes

- Updated dependencies [5a34e76]
  - @cipherstash/protect@5.1.0

## 1.0.0

### Major Changes

- 76599e5: Rebrand jseql to protect.

### Patch Changes

- Updated dependencies [76599e5]
  - @cipherstash/protect@5.0.0

## 0.1.2

### Patch Changes

- Updated dependencies [5c08fe5]
  - @cipherstash/jseql@4.0.0

## 0.1.1

### Patch Changes

- Updated dependencies [e885975]
  - @cipherstash/jseql@3.9.0

## 0.1.0

### Minor Changes

- eeaec18: Implemented typing and import synatx for es6.

### Patch Changes

- Updated dependencies [eeaec18]
  - @cipherstash/jseql@3.8.0

## 0.0.6

### Patch Changes

- Updated dependencies [7b8ec52]
  - @cipherstash/jseql@3.7.0

## 0.0.5

### Patch Changes

- Updated dependencies [7480cfd]
  - @cipherstash/jseql@3.6.0

## 0.0.4

### Patch Changes

- Updated dependencies [c0123be]
  - @cipherstash/jseql@3.5.0

## 0.0.3

### Patch Changes

- Updated dependencies [9a3132c]
- Updated dependencies [9a3132c]
  - @cipherstash/jseql@3.4.0

## 0.0.2

### Patch Changes

- Updated dependencies [80ee5af]
  - @cipherstash/jseql@3.3.0

## 0.0.1

### Patch Changes

- Updated dependencies [0526f60]
- Updated dependencies [fbb2bcb]
  - @cipherstash/jseql@3.2.0
