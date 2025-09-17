import { DataSource } from 'typeorm'
import { User } from './entity/User'

const originalConnectionConnectFunction = DataSource.prototype.initialize

// Patch DataSource to support custom column type for Protect.js
DataSource.prototype.initialize = async function (...params) {
  // TypeORM's supportedDataTypes is typed as ColumnType[], but we need to add our custom type.
  // Use 'as any' to bypass the type error for custom types.
  // biome-ignore lint/suspicious/noExplicitAny: Required for custom types
  const driver: any = this.driver
  if (
    driver &&
    Array.isArray(driver.supportedDataTypes) &&
    !driver.supportedDataTypes.includes('eql_v2_encrypted')
  ) {
    driver.supportedDataTypes.push('eql_v2_encrypted')
  }

  // Execute the original functionality on top of the added code above
  await originalConnectionConnectFunction.call(this, ...params)

  return this
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'cipherstash',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'cipherstash',
  synchronize: process.env.NODE_ENV !== 'production', // Only auto-sync in development
  logging: process.env.NODE_ENV === 'development',
  entities: [User],
  migrations: [],
  subscribers: [],
})
