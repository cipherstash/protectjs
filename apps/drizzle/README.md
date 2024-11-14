# drizzle-eql

This is a example using the [drizzle-orm](https://drizzle-orm.com/) library to insert and select encrypted data from a PostgreSQL database using the [EQL](https://github.com/cipherstash/encrypt-query-language) and [CipherStash Proxy](https://docs.cipherstash.com/reference/proxy).

## Prerequisites

- PostgreSQL database
- CipherStash Proxy running locally and connected to the database

## Setup

1. Create a PostgreSQL database and a user with read and write permissions.
2. Create a `.env.local` file in the root directory of the project with the following content:

```bash
DATABASE_URL="postgresql://[username]:[password]@localhost:6432/[database]"
```

Note: This assumes you are running CipherStash Proxy locally on your machine on port 6432 (default).

3. Run the following command to install the dependencies:

```bash
bun install
```

4. Run the following command to insert a new user with an encrypted email:

```bash
bun insert --email your-email@example.com
```

5. Run the following command to select all the encrypted emails from the database:

```bash
bun select
```

## License

This project is licensed under the MIT License.