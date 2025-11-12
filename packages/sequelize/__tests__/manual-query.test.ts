import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { DataTypes, Model, Op, Sequelize } from 'sequelize'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bulkFromComposite,
  createEncryptedType,
  extractProtectSchema,
  toComposite,
} from '../src'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL - required for E2E tests')
}

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: console.log, // Enable logging to see generated SQL
  dialect: 'postgres',
})

// Create ENCRYPTED data type
const ENCRYPTED = createEncryptedType()

// Define Transaction model
class Transaction extends Model {
  declare id: number
  declare description: string
  declare amount: number
}

Transaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    description: ENCRYPTED('description', {
      equality: true,
      dataType: 'string',
    }),
    amount: ENCRYPTED('amount', {
      equality: true,
      orderAndRange: true,
      dataType: 'number',
    }),
  },
  {
    sequelize,
    tableName: 'manual_query_test',
    timestamps: false,
  },
)

// Extract schema and initialize Protect client
const protectTransactions = extractProtectSchema(Transaction)
let protectClient: Awaited<ReturnType<typeof protect>>
const testIds: number[] = []

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [protectTransactions] })

  // Create table
  await sequelize.sync({ force: true })

  // Insert test data MANUALLY (without hooks)
  const testData = [
    { description: 'Salary deposit', amount: 5000.0 },
    { description: 'Grocery shopping', amount: 120.5 },
    { description: 'Rent payment', amount: 1500.0 },
  ]

  for (const data of testData) {
    // Manually encrypt
    const encryptedDescription = await protectClient.encrypt(data.description, {
      table: protectTransactions,
      column: protectTransactions.description,
    })
    const encryptedAmount = await protectClient.encrypt(data.amount, {
      table: protectTransactions,
      column: protectTransactions.amount,
    })

    // Insert with composite format
    const [result] = await sequelize.query(
      'INSERT INTO manual_query_test (description, amount) VALUES (:description, :amount) RETURNING id',
      {
        replacements: {
          description: toComposite(encryptedDescription.data),
          amount: toComposite(encryptedAmount.data),
        },
      },
    )
    testIds.push(// biome-ignore lint/suspicious/noExplicitAny: raw query result
    (result as any)[0].id)
  }
}, 60000)

afterAll(async () => {
  if (testIds.length > 0) {
    await Transaction.destroy({ where: { id: testIds } })
  }
  await sequelize.close()
}, 30000)

describe('Manual Query Tests (without hooks)', () => {
  it('Actually works! Using toComposite directly in WHERE clause', async () => {
    // Encrypt the search value
    const encryptedDescription = await protectClient.encrypt('Salary deposit', {
      table: protectTransactions,
      column: protectTransactions.description,
    })

    // Convert to composite format
    const composite = toComposite(encryptedDescription.data)

    console.log('Composite value:', composite)

    // Query with Op.eq (this actually works!)
    const results = await Transaction.findAll({
      where: {
        description: { [Op.eq]: composite },
      },
    })

    console.log('Results:', results.length)
    console.log('Raw results:', JSON.stringify(results, null, 2))

    // Parse and decrypt
    const parsed = bulkFromComposite(results)
    const decrypted = await protectClient.bulkDecryptModels(parsed)

    console.log('Decrypted results:', JSON.stringify(decrypted.data, null, 2))

    expect(results.length).toBe(1)
    expect(decrypted.data[0].description).toBe('Salary deposit')
  }, 30000)

  // it('Demonstrates encryption produces different ciphertext each time (deterministic search)', async () => {
  //   // The reason Op.eq works is because EQL uses deterministic encryption for equality searches
  //   // Let's verify that searching for the same plaintext value works

  //   // Encrypt the same value twice - will produce different ciphertext
  //   const encrypted1 = await protectClient.encrypt('Salary deposit', {
  //     table: protectTransactions,
  //     column: protectTransactions.description,
  //   })

  //   const encrypted2 = await protectClient.encrypt('Salary deposit', {
  //     table: protectTransactions,
  //     column: protectTransactions.description,
  //   })

  //   console.log('Ciphertext 1 (first 50 chars):', JSON.stringify(encrypted1.data).substring(0, 50))
  //   console.log('Ciphertext 2 (first 50 chars):', JSON.stringify(encrypted2.data).substring(0, 50))
  //   console.log('Are they equal?', JSON.stringify(encrypted1.data) === JSON.stringify(encrypted2.data))

  //   // Check if both have the same blind index (for equality search)
  //   console.log('Blind index 1:', encrypted1.data.hm)
  //   console.log('Blind index 2:', encrypted2.data.hm)
  //   console.log('Blind indexes equal?', encrypted1.data.hm === encrypted2.data.hm)

  //   // Now try to search with the second encryption
  //   const composite = toComposite(encrypted2.data)

  //   const results = await Transaction.findAll({
  //     where: {
  //       description: { [Op.eq]: composite },
  //     },
  //   })

  //   console.log('Results found:', results.length)

  //   // Parse and decrypt
  //   if (results.length > 0) {
  //     const parsed = bulkFromComposite(results)
  //     const decrypted = await protectClient.bulkDecryptModels(parsed)
  //     console.log('Decrypted:', decrypted.data[0].description)
  //     expect(decrypted.data[0].description).toBe('Salary deposit')
  //   }
  // }, 30000)

  // it('WORKS: Using Sequelize.literal with Op.eq operator', async () => {
  //   // Encrypt the search value
  //   const encryptedAmount = await protectClient.encrypt(1500.0, {
  //     table: protectTransactions,
  //     column: protectTransactions.amount,
  //   })

  //   // Convert to composite format
  //   const composite = toComposite(encryptedAmount.data)

  //   // Use Sequelize.literal with Op.eq
  //   const results = await Transaction.findAll({
  //     where: {
  //       amount: { [Op.eq]: sequelize.literal(`'${composite}'::eql_v2_encrypted`) },
  //     },
  //   })

  //   // Parse and decrypt
  //   const parsed = bulkFromComposite(results)
  //   const decrypted = await protectClient.bulkDecryptModels(parsed)

  //   expect(decrypted.data.length).toBe(1)
  //   expect(decrypted.data[0].amount).toBe(1500.0)
  // }, 30000)
})
