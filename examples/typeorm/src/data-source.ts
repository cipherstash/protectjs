import { DataSource } from 'typeorm'
import { User } from './entity/User'

const originalConnectionConnectFunction = DataSource.prototype.initialize

DataSource.prototype.initialize = async function (...params) {
  if (!this.driver.supportedDataTypes.includes('eql_v2_encrypted')) {
    // Add the desired datatype(s)
    this.driver.supportedDataTypes.push('eql_v2_encrypted')
  }

  // Execute the original functionality on top of the added code above
  await originalConnectionConnectFunction.call(this, ...params)

  return this
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'cipherstash',
  password: 'password',
  database: 'cipherstash',
  synchronize: true,
  logging: true,
  entities: [User],
  migrations: [],
  subscribers: [],
})
