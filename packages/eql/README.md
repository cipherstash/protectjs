# @cipherstash/eql

This is a TypeScript implementation of the Encrypted Query Language (EQL).

## Installation

TODO: Publish to npm

```bash
npm install @cipherstash/eql
bun add @cipherstash/eql
```

## Creating an EQL payload

```typescript
import { eqlPayload } from "@cipherstash/eql";

const payload = eqlPayload({
	plaintext: "your-email@example.com",
	table: "users",
	column: "email_encrypted",
});
```

## Getting the plaintext from an EQL payload

```typescript
import { getPlaintext } from "@cipherstash/eql";
const plaintext = getPlaintext(payload);
```

## Getting the ciphertext from an EQL payload

```typescript
import { getCiphertext } from "@cipherstash/eql";
const ciphertext = getCiphertext(payload);
```

## License

This project is licensed under the MIT License.

