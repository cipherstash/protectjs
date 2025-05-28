# drizzle-eql

This is a example using the [drizzle-orm](https://drizzle-orm.com/).

## Prerequisites

- PostgreSQL database
- CipherStash credentials and account

## Setup

1. Create a PostgreSQL database and a user with read and write permissions.
2. Create a `.env` file in the root directory of the project with the following content:

```bash
DATABASE_URL="postgresql://[username]:[password]@[host]:5432/[database]"
CS_CLIENT_ID=[client-id]
CS_CLIENT_KEY=[client-key]
CS_WORKSPACE_ID=[workspace-id]
CS_CLIENT_ACCESS_KEY=[access-key]
```

3. Run the following command to install the dependencies:

```bash
npm install
```

4. Run the following command to insert a new user with an encrypted email:

```bash
npx tsx src/insert.ts --email your-email@example.com
```

5. Run the following command to select all the encrypted emails from the database:

```bash
npx tsx src/select.ts
```

## License

This project is licensed under the MIT License.