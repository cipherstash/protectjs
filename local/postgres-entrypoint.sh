#!/bin/bash
set -e

# Start PostgreSQL in the background
echo "Starting PostgreSQL..."
docker-entrypoint.sh postgres &

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -U cipherstash -d cipherstash; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL is ready. Running CipherStash SQL initialization..."

# Run the SQL file
psql -U cipherstash -d cipherstash -f /tmp/cipherstash-encrypt-2-1-8.sql

echo "CipherStash SQL initialization completed."

# Wait for the PostgreSQL process
wait $!
