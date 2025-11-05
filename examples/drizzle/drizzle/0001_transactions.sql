-- Drop old users table if it exists
DROP TABLE IF EXISTS "users";

-- Create transactions table
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_number" eql_v2_encrypted,
	"amount" eql_v2_encrypted,
	"description" eql_v2_encrypted,
	"transaction_type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

