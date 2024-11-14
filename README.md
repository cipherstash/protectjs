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
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Features

- **Data encoding**: Easily create EQL payloads with the `createEqlPayload` function.
- **Data decoding**: Extract plaintext data from EQL payloads using `getPlaintext`.
- **TypeScript support**: Strongly typed with TypeScript interfaces and types.
- **Logging**: Integrated logging using [logtape](https://github.com/logtape/logtape) for debugging and monitoring.

## Installation

Install `jseql` via one of the following methods:

```bash
npm install @cipherstash/jseql
yarn add @cipherstash/jseql
bun add @cipherstash/jseql
```

## Usage

### Importing the package

```typescript
import {
  createEqlPayload,
  getPlaintext,
  type CsEncryptedV1Schema,
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
console.log(payload)
```

**Output:**

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

Extracts the plaintext data from an EQL payload.

**Parameters:**

- `payload` (`CsEncryptedV1Schema` | null): The EQL payload.

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

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/cipherstash/jseql).

## License

This project is licensed under the MIT License.