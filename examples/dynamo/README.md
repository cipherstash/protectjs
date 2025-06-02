# DynamoDB Examples

Examples of using Protect.js with DynamoDB.

## Prereqs
- [Node.js](https://nodejs.org/en) (tested with v22.11.0)
- [pnpm](https://pnpm.io/) (tested with v9.15.3)
- [Docker](https://www.docker.com/)
- a CipherStash account and [credentials configured](../../README.md#configuration)

## Setup

Install the workspace dependencies and build Protect.js:
```
# change to the workspace root directory
cd ../..

pnpm install
pnpm run build
```

Switch back to the Dynamo examples
```
cd examples/dynamo
```

Start Docker services used by the Dynamo examples:
```
docker compose up --detach
```

Download [EQL](https://github.com/cipherstash/encrypt-query-language) and install it into the PG DB (this is optional and only necessary for running the `export-to-pg` example):
```
pnpm run eql:download
pnpm run eql:install
```

## Examples

All examples run as scripts from [`package.json`](./package.json).
You can run an example with the command `pnpm run [example_name]`.

Each example runs against local DynamoDB in Docker.

- `simple`
  - `pnpm run simple`
  - Round trip encryption/decryption through Dynamo (no search on encrypted attributes).
- `encrypted-partition-key`
  - `pnpm run encrypted-partition-key`
  - Uses an encrypted attribute as a partition key.
- `encrypted-sort-key`
  - `pnpm run encrypted-sort-key`
  - Similar to the `encrypted-partition-key` example, but uses an encrypted attribute as a sort key instead.
- `encrypted-key-in-gsi`
  - `pnpm run encrypted-key-in-gsi`
  - Uses an encrypted attribute as the partition key in a global secondary index.
    The source ciphertext is projected into the index for decryption after queries against the index.
- `export-to-pg`
  - `pnpm run export-to-pg`
  - Encrypts an item, puts it in Dynamo, exports it to Postgres, and decrypts a result from Postgres.
