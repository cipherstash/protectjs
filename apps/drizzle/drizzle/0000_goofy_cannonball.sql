CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar,
	"email_encrypted" jsonb NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
