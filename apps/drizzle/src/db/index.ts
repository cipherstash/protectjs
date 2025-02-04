import 'dotenv/config'
// import { drizzle } from 'drizzle-orm/postgres-js'
// import postgres from 'postgres'

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

// const connectionString = process.env.DATABASE_URL
// const client = postgres(connectionString)
// export const db = drizzle(client)

const connection = await mysql.createConnection({
  host: "localhost",
  user: "myuser",
  database: "drizzle_example",
  password: "mypassword",
});

export const db = drizzle(connection);
