# Encrypt Config for Protect.js 

An **Encrypt Config** is a JSON (or TypeScript) structure that specifies:

1. **Version** (the `"v"` field).
2. One or more **Tables** (the `"tables"` field).

Inside each **Table**, you’ll define one or more **Columns**, specifying how each column is _cast_ (converted to a given type) and which **Indexes** (if any) should be built on that column.

Once defined, use the config to initialize the Protect.js client:

```ts
import { protect, type EncryptConfig } from "@cipherstash/protect";

const config: EncryptConfig = {
  v: 1,
  tables: {
    users: {
      email: {
        cast_as: "text",
        indexes: {},
      },
    },
  },
};

const protectClient = protect(config);
```

## Top-Level Structure

```jsonc
{
  "v": 1,                      // Required integer representing the config version
  "tables": {
    "table_name": {
      "column_name": {
        "cast_as": "...",      // Optional, defaults to "text"
        "indexes": {           // Optional, each index is optional
          "ore": { ... },
          "unique": { ... },
          "match": { ... },
          "ste_vec": { ... }
        }
      }
    }
  }
}
```

### `v` (Version)

- **Type**: `number`
- **Required**: Yes
- **Purpose**: Used to mark the version of the configuration schema.
We only support version `1` at this time.

### `tables`

- **Type**: A map of **tableName** → **Table Definition**.
- **Required**: Yes
- **Example**:
  ```json
  {
    "tables": {
      "users": { ... },
      "orders": { ... }
    }
  }
  ```
- Each key in `"tables"` is the name of a table (e.g., `"users"`), whose value is another map of **columns**.

## Table Definition

```jsonc
"table_name": {
  "column_name": { ... },
  "another_column": { ... }
}
```

- Each key (e.g., `"column_name"`) is the column name in that table.
- The value for each column is a **Column** object.

## Column Definition

```jsonc
{
  "cast_as": "text",           // or "big_int", "int", "small_int", "boolean", "date", "real", "double", "jsonb"
  "indexes": {
    "ore": {},
    "unique": {
      "token_filters": [
        { "kind": "downcase" }
      ]
    },
    "match": {
      "tokenizer": {
        "kind": "standard"    // or "ngram"
      },
      "token_filters": [],
      "k": 6,
      "m": 2048,
      "include_original": false
    },
    "ste_vec": {
      "prefix": "..."
    }
  }
}
```

### `cast_as`

Specifies how the column will be cast (typed) before encryption and indexing. This closely maps to the **Rust** enum `CastAs`. Possible values:

- `"big_int"`
- `"small_int"`
- `"int"`
- `"boolean"`
- `"date"`
- `"real"`
- `"double"`
- `"text"` (default)
- `"jsonb"`

**Default**: `"text"`

### `indexes`

An object defining which indexes (if any) to enable on this column. **All fields in `indexes` are optional**. If none are present, the column will not be indexed.

#### 1. ORE Index

Enables **Order-Revealing Encryption** (ORE).

```json
"indexes": {
  "ore": {}
}
```

- The `ore` property is an empty object (i.e., no extra settings).
- In Rust, this corresponds to `OreIndexOpts {}`.

#### 2. Unique Index

Enables **Unique** constraints. This typically uses specialized indexing so that each value in the column must be unique.

```json
"indexes": {
  "unique": {
    "token_filters": [
      { "kind": "downcase" }
    ]
  }
}
```

- **`token_filters`**: An optional array of objects specifying transformations on the token before indexing. Currently, the example shows one possible filter: 
  - `{ "kind": "downcase" }` – transforms the string to lowercase before indexing.

**Default**: `{ "token_filters": [] }` (an empty array of token filters).

#### 3. Match Index

Enables **Match** (full-text-ish) indexing, which can be used for substring/pattern matching. The default fields are:

```json
"indexes": {
  "match": {
    "tokenizer": {
      "kind": "standard"
    },
    "token_filters": [],
    "k": 6,
    "m": 2048,
    "include_original": false
  }
}
```

**Field explanations**:

1. **`tokenizer`** – How to chunk the text into tokens.
   - `{"kind": "standard"}` (default)
   - `{"kind": "ngram", "token_length": <number>}` – e.g. `{"kind":"ngram","token_length":3}`
2. **`token_filters`** – Optional array of transforms, e.g. `[{"kind": "downcase"}]`.
3. **`k`** – Defaults to `6`. Used internally for chunk sizes or matching thresholds.
4. **`m`** – Defaults to `2048`. Another internal parameter for the cryptographic index.
5. **`include_original`** – Defaults to `false`. When `true`, also store the original tokens unmodified.

#### 4. STE Vector Index

Enables the **STE Vec** index, typically used for vector-like data or structured queries.

```json
"indexes": {
  "ste_vec": {
    "prefix": "..."
  }
}
```

**Fields**:

- **`prefix`** – A required string that acts as a prefix for the index.

## Example Configs

### Minimal Config

```json
{
  "v": 1,
  "tables": {
    "users": {}
  }
}
```

- Creates a config for version `1`.
- Declares a `users` table with **no columns**. (In practice, you’d add columns.)

### Simple Column Example

```json
{
  "v": 1,
  "tables": {
    "users": {
      "email": {
        "cast_as": "text",
        "indexes": {}
      }
    }
  }
}
```

- `users.email` is cast as `"text"` (the default if omitted).
- **No** indexes are enabled on `email`.

### ORE Index Example

```json
{
  "v": 1,
  "tables": {
    "users": {
      "age": {
        "cast_as": "int",
        "indexes": {
          "ore": {}
        }
      }
    }
  }
}
```

- `users.age` is cast as `"int"`.
- ORE indexing is enabled.

### Unique Index with Token Filters

```json
{
  "v": 1,
  "tables": {
    "users": {
      "email": {
        "indexes": {
          "unique": {
            "token_filters": [
              { "kind": "downcase" }
            ]
          }
        }
      }
    }
  }
}
```

- `users.email` defaults to `"text"`.
- Unique index with a `downcase` token filter.

### Match Index with Ngram Tokenizer

```json
{
  "v": 1,
  "tables": {
    "users": {
      "description": {
        "indexes": {
          "match": {
            "tokenizer": {
              "kind": "ngram",
              "token_length": 3
            },
            "token_filters": [
              { "kind": "downcase" }
            ],
            "k": 8,
            "m": 1024,
            "include_original": true
          }
        }
      }
    }
  }
}
```

- Enables a match index with an ngram tokenizer that uses 3-character slices.
- Applies `downcase`.
- Sets `k=8`, `m=1024`, `include_original=true`.

### STE Vector Example

```json
{
  "v": 1,
  "tables": {
    "users": {
      "event_data": {
        "indexes": {
          "ste_vec": {
            "prefix": "event-data"
          }
        }
      }
    }
  }
}
```