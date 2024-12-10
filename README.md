# jseql

`jseql` is a JavaScript/TypeScript package designed to facilitate interaction with [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language). It provides classes and methods to encode and decode values when working with encrypted data in a PostgreSQL database.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Importing the package](#importing-the-package)
  - [Functions](#functions)
    - [createEqlPayload](#createeqlpayload)
    - [getPlaintext](#getplaintext)
  - [Logging](#logging)
- [Releasing new versions](#releasing-new-versions)
- [Contributing](#contributing)
- [License](#license)

## Features

`jseql` leverages [Encrypt Query Language (EQL)](https://github.com/cipherstash/encrypt-query-language) and [CipherStash](https://cipherstash.com) to encrypt data in a PostgreSQL database.

**Features:**
- **Data encoding**: Easily create EQL payloads with the `createEqlPayload` function.
- **Data decoding**: Extract plaintext data from EQL payloads using `getPlaintext`.
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
# or
bun add @cipherstash/jseql
```

## Usage

### Importing the package

```typescript
import {
  createEqlPayload,
  getPlaintext,
  type CsPlaintextV1Schema,
} from '@cipherstash/jseql'
```

### Functions

#### createEqlPayload

Creates an EQL payload which is required for database operations with encrypted data.

**Parameters:**

- `plaintext` (string | undefined): The plaintext data to include in the payload.
- `table` (string): The database table name.
- `column` (string): The column name in the table.
- `version` (number, optional): The version of the payload. Defaults to `1`.
- `queryType` (string | null, optional): The query type. Defaults to `null`.

**Usage:**

```typescript
const payload = createEqlPayload({
  plaintext: 'Hello, World!',
  table: 'messages',
  column: 'content',
})

sql = `INSERT INTO messages (content) VALUES (${payload});`
```

**Payload:**

```json
{
  "v": 1,
  "s": 1,
  "k": "pt",
  "p": "Hello, World!",
  "i": {
    "t": "messages",
    "c": "content"
  },
  "q": null
}
```

#### getPlaintext

Extracts the plaintext data from an EQL payload which has been decrypted.

**Parameters:**

- `payload` (`CsPlaintextV1Schema` | null): The EQL payload.

**Returns:**

- `string | undefined`: The plaintext data if available.

**Usage:**

```typescript
const payload = {
  v: 1,
  s: 1,
  k: 'pt',
  p: 'Hello, World!',
  i: { t: 'messages', c: 'content' },
  q: null,
}
const plaintext = getPlaintext(payload)
console.log(plaintext) // Output: 'Hello, World!'
```
> [!TIP]
> Note: the payload that is stored in the database is encrypted, so it is not possible to view the plaintext data directly even if you have direct access to the database as an administrator.

### Logging

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

// Use jseql functions as usual
import { createEqlPayload } from 'jseql'

const payload = createEqlPayload({
  plaintext: 'Secret Data',
  table: 'users',
  column: 'password',
})

// The logger will output debug information to the console
```

**Output:**

```
[debug] [jseql] Creating the EQL payload { ...payload data... }
```

By setting up the logger, you can monitor the internal operations of `jseql`, which is especially useful for debugging and development purposes.

## Releasing new versions

We use [Changesets](https://github.com/changesets/changesets) to manage our releases. 
To create a new release, run the following command:

```bash
bun changeset
```

Create a pull request and merge it into the `main` branch, which will trigger the release workflow.

1. Changesets will open a new pull request with the new version.
2. Merge the pull request into the `main` branch.
3. Changesets will automatically publish the new version to npm.

## Contributing

Please see the [CONTRIBUTE.md](CONTRIBUTE.md) file for more information.

## License

Please see the [LICENSE](LICENSE.md) file for more information.