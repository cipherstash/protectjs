# EQL JavaScript Packages and Examples

This repository contains the JavaScript implementation of the Encrypted Query Language (EQL) and examples of how to use it.

## Packages

The following packages are available:

- [@cipherstash/eql](https://github.com/cipherstash/encrypt-query-language/tree/main/packages/eql): This is a TypeScript implementation of EQL.

## Examples

The following examples are available:

- [drizzle-eql](https://github.com/cipherstash/encrypt-query-language/tree/main/apps/drizzle): This is an example using the [drizzle-orm](https://drizzle-orm.com/) library to insert and select encrypted data from a PostgreSQL database using EQL and [CipherStash Proxy](https://docs.cipherstash.com/reference/proxy).

## Development

1. Run the install script to install the dependencies:

```bash
bun install
```

2. Listen for local package changes and rebuild the packages:

```bash
bun dev
```

## License

This project is licensed under the MIT License.
