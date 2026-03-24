FROM postgres:latest

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Download latest EQL install script
RUN curl -sLo /tmp/cipherstash-encrypt.sql https://github.com/cipherstash/encrypt-query-language/releases/latest/download/cipherstash-encrypt.sql

# Copy the custom entrypoint script and SQL files
COPY postgres-entrypoint.sh /usr/local/bin/postgres-entrypoint.sh
COPY create-ci-table.sql /tmp/create-ci-table.sql

# Make the entrypoint script executable
RUN chmod +x /usr/local/bin/postgres-entrypoint.sh

# Use the custom entrypoint
ENTRYPOINT ["/usr/local/bin/postgres-entrypoint.sh"]

