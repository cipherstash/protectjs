# jseql

`jseql` is a JavaScript/TypeScript package designed to facilitate interaction with [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language). It provides classes and methods to encrypt and decrypt data.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Features

`jseql` leverages [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language) and [CipherStash](https://cipherstash.com) to encrypt data in a PostgreSQL database.

**Features:**
- **Data encryption**: Easily encrypt data with the `encrypt` function.
- **Data decryption**: Extract plaintext data from encrypted data using the `decrypt` function.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.
- **Logging**: Integrated logging using [logtape](https://github.com/logtape/logtape) for debugging and monitoring.

**Use cases:**
- Meet compliance requirements for data encryption in your application.
- Ensure only the intended users can access sensitive data.
- Exceed customer expectations for data security.
- Improve your overall security posture and reduce the risk of data breaches.

## Installation

Install `jseql` via one of the following methods:

```bash
npm install @cipherstash/jseql
# or
yarn add @cipherstash/jseql
```

## Platform Support

### Operating Systems

| Linux  | macOS | Windows |
| ------ | ----- | ------- |
| ✓      | ✓     | ✓       |

### Node.js

Jseql actively supports all current and [maintenance releases of Node](https://github.com/nodejs/LTS#release-schedule). If you're
using a different version of Node and believe it should be supported, let us know.

Older Node version support (minimum v10) may require lower Node-API versions. See the Node [version support matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix) for more details.

### Bun (experimental)

[Bun](https://bun.sh/) is an alternate JavaScript runtime that targets Node compatibility. At the time of this writing, some Node-API functions are [not implemented](https://github.com/oven-sh/bun/issues/158) so Jseql may not work with Bun.

## Usage

### Define environment variables

Create a `.env` file in the root directory of your project with the following contents:

```
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key
CS_WORKSPACE_ID=your-workspace-id
```

At the time of this writing, you will need to use the [CipherStash CLI to generate a new client key](https://cipherstash.com/docs/how-to/client-keys).

`CS_WORKSPACE_ID` is the ID of the workspace you want to use, and can be found in the [CipherStash dashboard](  https://dashboard.cipherstash.com/).

### Initialize the EQL client

```typescript
import { eql } from '@cipherstash/jseql'

const eqlClient = await eql({
  workspaceId: process.env.CS_WORKSPACE_ID,
  clientId: process.env.CS_CLIENT_ID,
  clientKey: process.env.CS_CLIENT_KEY,
})
```

### Encrypting data

To encrypt data, use the `encrypt` function. This function takes a plaintext string and an object with the table and column name as parameters.

```typescript
const ciphertext = await eqlClient.encrypt('plaintext', {
  column: 'column_name',
  table: 'users',
})
```

The `encrypt` function returns an object with a `c` property, which is the encrypted data.

```typescript
{
  c: 'encrypted-data'
}
```

### Decrypting data

To decrypt data, use the `decrypt` function. This function takes an encrypted data object and an object with the lock context as parameters.

```typescript
const plaintext = await eqlClient.decrypt(ciphertext, {
  lockContext: {
    identityClaim: ['sub'],
  },
})
```

The `decrypt` function returns a string with the plaintext data.

```typescript
'plaintext'
```

### Storing encrypted data in a database

To store the encrypted data in PostgreSQL, you will need to specify the column type as `jsonb`. At the time of this writing.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  encrypted_data jsonb NOT NULL
);
```

## Searchable encrypted data

`jseql` does not currently support searching encrypted data.
We are hard at work on this feature and will update this section when it is available.
You can read more about this feature and implementation [here](https://github.com/cipherstash/encrypt-query-language).

## Logging

> [!WARNING]
> `jseql` will NEVER log plaintext data. 
> This is by design to prevent sensitive data from being logged.

`jseql` uses [logtape](https://github.com/logtape/logtape) for logging, which allows you to control the logging output and integrate it with your application's logging system.

To set up logging for `jseql`, you need to configure a sink for the `'jseql'` logger.

**Setup Example:**

```typescript
// Configure the logger
import { configure, getConsoleSink, getFileSink } from '@logtape/logtape'

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: ['jseql'],
      level: 'debug',
      sinks: ['console'],
    },
  ],
})
```

## Examples

- [Basic example](/apps/basic)

`jseql` can be used with most ORMs that support PostgreSQL. If you're interested in using `jseql` with a specific ORM, please [create an issue](https://github.com/cipherstash/jseql/issues/new).

## Contributing

Please see the [CONTRIBUTE.md](CONTRIBUTE.md) file for more information.

## License

Please see the [LICENSE](LICENSE.md) file for more information.