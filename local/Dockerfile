FROM postgres:latest

# Copy the custom entrypoint script and SQL files
COPY postgres-entrypoint.sh /usr/local/bin/postgres-entrypoint.sh
COPY cipherstash-encrypt-2-1-8.sql /tmp/cipherstash-encrypt-2-1-8.sql
COPY create-ci-table.sql /tmp/create-ci-table.sql

# Make the entrypoint script executable
RUN chmod +x /usr/local/bin/postgres-entrypoint.sh

# Use the custom entrypoint
ENTRYPOINT ["/usr/local/bin/postgres-entrypoint.sh"]

