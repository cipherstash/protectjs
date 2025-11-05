# Express REST API with Drizzle ORM and Protect.js

This example demonstrates a FinTech REST API built with Express.js, Drizzle ORM, and Protect.js. It showcases how to encrypt sensitive financial data (account numbers, amounts, transaction descriptions) while maintaining the ability to search and query encrypted fields.

## Prerequisites

- **Node.js**: >= 22
- **PostgreSQL**: Database with EQL v2 functions installed
- **CipherStash account**: For encryption credentials

## Technologies

- [Express](https://expressjs.com/) - Web framework
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [Protect.js](https://github.com/cipherstash/protectjs) - End-to-end encryption
- [PostgreSQL](https://www.postgresql.org/) - Database

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up PostgreSQL with EQL v2

Before running migrations, you need to install the EQL v2 types and functions in your PostgreSQL database:

```bash
# Download the EQL install script
curl -sLo cipherstash-encrypt.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql

# Install EQL types and functions
psql -d your_database -f cipherstash-encrypt.sql
```

This creates the `eql_v2_encrypted` composite type and search functions needed for searchable encryption.

### 3. Environment Variables

Create a `.env` file in the root directory:

```bash
# Database connection
DATABASE_URL="postgresql://[username]:[password]@[host]:5432/[database]"

# CipherStash credentials
CS_CLIENT_ID=[client-id]
CS_CLIENT_KEY=[client-key]
CS_WORKSPACE_CRN=[workspace-crn]
CS_CLIENT_ACCESS_KEY=[access-key]

# Optional: Server port (default: 3000)
PORT=3000
```

### 4. Run Database Migrations

```bash
pnpm db:migrate
```

This creates the `transactions` table with encrypted columns.

### 5. Start the Server

```bash
pnpm dev
```

The server will start on `http://localhost:3000` (or the port specified in `PORT`).

## API Endpoints

### Health Check

**GET** `/health`

Returns server status.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

### List Transactions

**GET** `/transactions`

Retrieves all transactions with optional filters.

**Query Parameters:**
- `accountNumber` (string) - Search by account number (encrypted field, text search)
- `minAmount` (number) - Minimum transaction amount (encrypted field, range query)
- `maxAmount` (number) - Maximum transaction amount (encrypted field, range query)
- `status` (string) - Filter by status (non-encrypted field)

**Example:**
```bash
# Get all transactions
curl http://localhost:3000/transactions

# Filter by account number
curl "http://localhost:3000/transactions?accountNumber=1234"

# Filter by amount range
curl "http://localhost:3000/transactions?minAmount=100&maxAmount=1000"

# Filter by status
curl "http://localhost:3000/transactions?status=completed"
```

**Response:**
```json
{
  "transactions": [
    {
      "id": 1,
      "accountNumber": "1234567890",
      "amount": 500.00,
      "description": "Payment for services",
      "transactionType": "payment",
      "status": "completed",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create Transaction

**POST** `/transactions`

Creates a new transaction with encrypted sensitive fields.

**Request Body:**
```json
{
  "accountNumber": "1234567890",
  "amount": 500.00,
  "description": "Payment for services",
  "transactionType": "payment",
  "status": "pending"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "1234567890",
    "amount": 500.00,
    "description": "Payment for services",
    "transactionType": "payment",
    "status": "pending"
  }'
```

**Response:**
```json
{
  "transaction": {
    "id": 1,
    "accountNumber": "1234567890",
    "amount": 500.00,
    "description": "Payment for services",
    "transactionType": "payment",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Get Transaction by ID

**GET** `/transactions/:id`

Retrieves a single transaction by ID.

**Example:**
```bash
curl http://localhost:3000/transactions/1
```

**Response:**
```json
{
  "transaction": {
    "id": 1,
    "accountNumber": "1234567890",
    "amount": 500.00,
    "description": "Payment for services",
    "transactionType": "payment",
    "status": "completed",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update Transaction

**PUT** `/transactions/:id`

Updates a transaction. All fields are optional.

**Request Body:**
```json
{
  "accountNumber": "9876543210",
  "amount": 750.00,
  "description": "Updated description",
  "transactionType": "refund",
  "status": "completed"
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/transactions/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "amount": 750.00
  }'
```

**Response:**
```json
{
  "transaction": {
    "id": 1,
    "accountNumber": "1234567890",
    "amount": 750.00,
    "description": "Payment for services",
    "transactionType": "payment",
    "status": "completed",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

### Delete Transaction

**DELETE** `/transactions/:id`

Deletes a transaction.

**Example:**
```bash
curl -X DELETE http://localhost:3000/transactions/1
```

**Response:** 204 No Content

## Database Schema

The `transactions` table has the following structure:

- **Encrypted fields** (using `eql_v2_encrypted` type):
  - `account_number` - Account number with equality and text search
  - `amount` - Transaction amount with equality, range queries, and sorting
  - `description` - Transaction description with text search

- **Non-encrypted fields**:
  - `id` - Primary key (serial)
  - `transaction_type` - Type of transaction (varchar)
  - `status` - Transaction status (varchar, default: 'pending')
  - `created_at` - Timestamp
  - `updated_at` - Timestamp

## How It Works

### Encryption

- Sensitive fields (`accountNumber`, `amount`, `description`) are encrypted using Protect.js before being stored in the database
- The `@cipherstash/drizzle` package provides `encryptedType` helper to define encrypted columns in Drizzle schemas
- Data is automatically encrypted when inserting/updating and decrypted when reading

### Searchable Encryption

- The API demonstrates searchable encryption capabilities:
  - **Text search** on `accountNumber` and `description` using `ilike` operator
  - **Range queries** on `amount` using `gte` and `lte` operators
  - **Equality queries** on `accountNumber` and `amount`
- All encrypted field queries use Protect.js operators that automatically handle encryption

### Type Safety

- TypeScript types are preserved throughout the encryption/decryption process
- The `encryptedType<T>` helper ensures decrypted values maintain their correct types

## Notes

- **Native Module**: Protect.js uses `@cipherstash/protect-ffi`, a native Node-API module. Express doesn't bundle code, so no special configuration is needed. If deploying to serverless platforms, ensure the native module is properly externalized.
- **Error Handling**: All Protect.js operations return a Result type (`{ data }` or `{ failure }`). The API properly handles these results and returns appropriate HTTP status codes.
- **Bulk Operations**: The API uses `bulkEncryptModels` and `bulkDecryptModels` for efficient batch operations when querying multiple transactions.

## License

This project is licensed under the MIT License.
