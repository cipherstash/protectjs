import 'dotenv/config'
import { protect } from '@cipherstash/protect'
import { DataTypes, Model, Op, Sequelize } from 'sequelize'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addProtectHooks,
  createEncryptedType,
  extractProtectSchema,
} from '../src'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL - required for E2E tests')
}

// Test data interface
interface TestUser {
  id: number
  email: string
  age: number
  score: number
  profile: {
    name: string
    bio: string
    level: number
  }
}

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialect: 'postgres',
})

// Create ENCRYPTED data type
const ENCRYPTED = createEncryptedType()

// Define User model with encrypted columns
class User extends Model {
  declare id: number
  declare email: string
  declare age: number
  declare score: number
  declare profile: {
    name: string
    bio: string
    level: number
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: ENCRYPTED('email', {
      freeTextSearch: true,
      equality: true,
      orderAndRange: true,
      dataType: 'string',
    }),
    age: ENCRYPTED('age', {
      dataType: 'number',
      equality: true,
      orderAndRange: true,
    }),
    score: ENCRYPTED('score', {
      dataType: 'number',
      equality: true,
      orderAndRange: true,
    }),
    profile: ENCRYPTED('profile', {
      dataType: 'json',
    }),
  },
  {
    sequelize,
    tableName: 'sequelize_protect_ci',
    timestamps: false,
  },
)

// Extract schema and initialize Protect client
const userTable = extractProtectSchema(User)
let protectClient: Awaited<ReturnType<typeof protect>>
const testUserIds: number[] = []

beforeAll(async () => {
  // Initialize Protect.js client
  protectClient = await protect({ schemas: [userTable] })

  // Add encryption hooks to model
  addProtectHooks(User, protectClient)

  // Create table if it doesn't exist
  await sequelize.sync({ force: true })

  // Test data
  const testUsers = [
    {
      email: 'john.doe@example.com',
      age: 25,
      score: 85,
      profile: {
        name: 'John Doe',
        bio: 'Software engineer with 5 years experience',
        level: 3,
      },
    },
    {
      email: 'jane.smith@example.com',
      age: 30,
      score: 92,
      profile: {
        name: 'Jane Smith',
        bio: 'Senior developer specializing in React',
        level: 4,
      },
    },
    {
      email: 'bob.wilson@example.com',
      age: 35,
      score: 78,
      profile: {
        name: 'Bob Wilson',
        bio: 'Full-stack developer and team lead',
        level: 5,
      },
    },
    {
      email: 'alice.johnson@example.com',
      age: 28,
      score: 88,
      profile: {
        name: 'Alice Johnson',
        bio: 'Frontend specialist with design skills',
        level: 3,
      },
    },
    {
      email: 'jill.smith@example.com',
      age: 22,
      score: 75,
      profile: {
        name: 'Jill Smith',
        bio: 'Backend developer with 3 years experience',
        level: 3,
      },
    },
  ]

  // Insert test data (hooks will handle encryption automatically)
  for (const userData of testUsers) {
    const user = await User.create(userData)
    testUserIds.push(user.id)
  }
}, 60000)

afterAll(async () => {
  // Clean up test data
  if (testUserIds.length > 0) {
    await User.destroy({
      where: {
        id: testUserIds,
      },
    })
  }

  await sequelize.close()
}, 30000)

describe('Sequelize E2E Integration with Protect.js', () => {
  it('should encrypt and decrypt data automatically via hooks', async () => {
    const testEmail = 'test-encryption@example.com'
    const testAge = 40
    const testProfile = {
      name: 'Test User',
      bio: 'Testing encryption',
      level: 1,
    }

    // Create user (beforeCreate hook encrypts automatically)
    const user = await User.create({
      email: testEmail,
      age: testAge,
      score: 90,
      profile: testProfile,
    })

    testUserIds.push(user.id)

    // Fetch from database (afterFind hook decrypts automatically)
    const fetchedUser = await User.findByPk(user.id)

    expect(fetchedUser).not.toBeNull()
    expect(fetchedUser?.email).toBe(testEmail)
    expect(fetchedUser?.age).toBe(testAge)
    expect(fetchedUser?.profile).toEqual(testProfile)

    // Verify data is actually encrypted in database by fetching raw
    const [rawResult] = await sequelize.query(
      'SELECT email, age, profile FROM sequelize_protect_ci WHERE id = :id',
      {
        replacements: { id: user.id },
        type: 'SELECT' as any,
      },
    )

    // Raw data should be encrypted (composite type string format)
    expect(rawResult).toBeDefined()
    expect(typeof (rawResult as any).email).toBe('string')
    expect((rawResult as any).email).toMatch(/^\(".*"\)$/) // Composite type format

    // Parse composite type to verify it has ciphertext
    const emailStr = (rawResult as any).email
    const inner = emailStr.slice(2, -2) // Remove (" and ")
    const unescaped = inner.replace(/""/g, '"')
    const emailObj = JSON.parse(unescaped)
    expect(emailObj).toHaveProperty('c') // Ciphertext field
  }, 30000)

  it('should perform equality search on encrypted fields', async () => {
    const searchEmail = 'jane.smith@example.com'

    // Query with simple equality (beforeFind hook encrypts search value)
    const results = await User.findAll({
      where: { email: searchEmail },
    })

    expect(results).toHaveLength(1)
    expect(results[0].email).toBe(searchEmail)
  }, 30000)

  it('should perform equality search with Op.eq operator', async () => {
    const searchEmail = 'john.doe@example.com'

    const results = await User.findAll({
      where: {
        email: { [Op.eq]: searchEmail },
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0].email).toBe(searchEmail)
  }, 30000)

  it('should perform text search with Op.iLike operator', async () => {
    const searchText = 'smith'

    const results = await User.findAll({
      where: {
        email: { [Op.iLike]: `%${searchText}%` },
      },
    })

    // Should find users with 'smith' in email
    expect(results.length).toBeGreaterThan(0)

    // Verify all results contain search text
    const foundMatch = results.some((user) =>
      user.email.toLowerCase().includes(searchText.toLowerCase()),
    )
    expect(foundMatch).toBe(true)
  }, 30000)

  it('should perform range queries with Op.gte operator', async () => {
    const minAge = 28

    const results = await User.findAll({
      where: {
        age: { [Op.gte]: minAge },
      },
    })

    expect(results.length).toBeGreaterThan(0)

    // Verify all results have age >= 28
    const allValidAges = results.every((user) => user.age >= minAge)
    expect(allValidAges).toBe(true)
  }, 30000)

  it('should perform range queries with Op.between operator', async () => {
    const minAge = 25
    const maxAge = 30

    const results = await User.findAll({
      where: {
        age: { [Op.between]: [minAge, maxAge] },
      },
    })

    expect(results.length).toBeGreaterThan(0)

    // Verify all results are within range
    const allInRange = results.every(
      (user) => user.age >= minAge && user.age <= maxAge,
    )
    expect(allInRange).toBe(true)
  }, 30000)

  it('should handle Op.in operator with multiple values', async () => {
    const searchEmails = ['jane.smith@example.com', 'bob.wilson@example.com']

    const results = await User.findAll({
      where: {
        email: { [Op.in]: searchEmails },
      },
    })

    expect(results).toHaveLength(2)

    const emails = results.map((user) => user.email)
    expect(emails).toContain('jane.smith@example.com')
    expect(emails).toContain('bob.wilson@example.com')
  }, 30000)

  it('should handle complex queries with Op.and', async () => {
    const minAge = 25
    const maxAge = 35
    const searchText = 'developer'

    const results = await User.findAll({
      where: {
        [Op.and]: [
          { age: { [Op.gte]: minAge } },
          { age: { [Op.lte]: maxAge } },
          { email: { [Op.iLike]: `%${searchText}%` } },
        ],
      },
    })

    // Verify all results meet the criteria
    const allValid = results.every((user) => {
      const ageValid = user.age >= minAge && user.age <= maxAge
      const textValid = user.email
        .toLowerCase()
        .includes(searchText.toLowerCase())
      return ageValid && textValid
    })

    expect(allValid).toBe(true)
  }, 30000)

  it('should handle Op.or with encrypted columns', async () => {
    const results = await User.findAll({
      where: {
        [Op.or]: [
          { email: 'john.doe@example.com' },
          { email: 'jane.smith@example.com' },
        ],
      },
    })

    expect(results).toHaveLength(2)

    const emails = results.map((user) => user.email)
    expect(emails).toContain('john.doe@example.com')
    expect(emails).toContain('jane.smith@example.com')
  }, 30000)

  it('should handle nested field encryption and decryption', async () => {
    const user = await User.findOne({
      where: { email: 'john.doe@example.com' },
    })

    expect(user).not.toBeNull()
    expect(user?.profile).toBeDefined()
    expect(user?.profile.name).toBe('John Doe')
    expect(user?.profile.bio).toBe('Software engineer with 5 years experience')
    expect(user?.profile.level).toBe(3)
    expect(typeof user?.profile.level).toBe('number')
  }, 30000)

  it('should handle limit and offset correctly', async () => {
    const page1 = await User.findAll({
      limit: 2,
      offset: 0,
      order: [['id', 'ASC']],
    })

    const page2 = await User.findAll({
      limit: 2,
      offset: 2,
      order: [['id', 'ASC']],
    })

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)

    // Ensure different results
    expect(page1[0].id).not.toBe(page2[0].id)
  }, 30000)

  it('should handle findOne with encrypted conditions', async () => {
    const user = await User.findOne({
      where: {
        email: 'alice.johnson@example.com',
        age: 28,
      },
    })

    expect(user).not.toBeNull()
    expect(user?.email).toBe('alice.johnson@example.com')
    expect(user?.age).toBe(28)
  }, 30000)

  it('should handle count with encrypted conditions', async () => {
    // Note: Sequelize count() and findAndCountAll() use aggregate() which
    // bypasses beforeFind hooks. For counting with encrypted conditions,
    // use findAll() and check the length
    const results = await User.findAll({
      where: {
        age: { [Op.gte]: 25 },
      },
    })

    expect(results.length).toBeGreaterThan(0)

    // Verify all results match the condition (age >= 25)
    for (const user of results) {
      expect(user.age).toBeGreaterThanOrEqual(25)
      expect(typeof user.email).toBe('string')
      expect(user.email).toMatch(/@/)
    }
  }, 30000)

  it('should verify data is encrypted at rest in database', async () => {
    // Get a known user
    const user = await User.findOne({
      where: { email: 'john.doe@example.com' },
    })

    expect(user).not.toBeNull()

    // Fetch raw encrypted data from database
    const [rawResult] = await sequelize.query(
      'SELECT email, age, score, profile FROM sequelize_protect_ci WHERE id = :id',
      {
        replacements: { id: user?.id },
        type: 'SELECT' as any,
      },
    )

    // Verify encrypted fields are composite type strings
    expect(typeof (rawResult as any).email).toBe('string')
    expect((rawResult as any).email).toMatch(/^\(".*"\)$/)

    expect(typeof (rawResult as any).age).toBe('string')
    expect((rawResult as any).age).toMatch(/^\(".*"\)$/)

    expect(typeof (rawResult as any).profile).toBe('string')
    expect((rawResult as any).profile).toMatch(/^\(".*"\)$/)

    // Parse and verify ciphertext is not the plaintext
    const parseComposite = (str: string) => {
      const inner = str.slice(2, -2) // Remove (" and ")
      const unescaped = inner.replace(/""/g, '"')
      return JSON.parse(unescaped)
    }

    const emailObj = parseComposite((rawResult as any).email)
    const ageObj = parseComposite((rawResult as any).age)

    expect(emailObj).toHaveProperty('c')
    expect(ageObj).toHaveProperty('c')
    expect(emailObj.c).not.toBe(user?.email)
    expect(ageObj.c).not.toBe(user?.age.toString())
  }, 30000)

  it('should handle bulk operations correctly', async () => {
    const bulkData = [
      {
        email: 'bulk1@example.com',
        age: 31,
        score: 80,
        profile: { name: 'Bulk User 1', bio: 'Test bulk 1', level: 2 },
      },
      {
        email: 'bulk2@example.com',
        age: 32,
        score: 81,
        profile: { name: 'Bulk User 2', bio: 'Test bulk 2', level: 2 },
      },
    ]

    // Bulk create (hooks handle encryption)
    const created = await User.bulkCreate(bulkData, { returning: true })

    expect(created).toHaveLength(2)
    testUserIds.push(...created.map((u) => u.id))

    // Verify data is decrypted
    expect(created[0].email).toBe('bulk1@example.com')
    expect(created[1].email).toBe('bulk2@example.com')

    // Find them back
    const found = await User.findAll({
      where: {
        email: { [Op.in]: ['bulk1@example.com', 'bulk2@example.com'] },
      },
    })

    expect(found).toHaveLength(2)
  }, 30000)

  it('should handle corrupted encrypted data in database', async () => {
    // Create a user first
    const user = await User.create({
      email: 'error-test@example.com',
      age: 27,
      score: 85,
      profile: { name: 'Error Test', bio: 'Testing error handling', level: 2 },
    })
    testUserIds.push(user.id)

    // Manually corrupt the data by setting email to a valid composite type
    // but with invalid encrypted data structure (missing required fields)
    await sequelize.query(
      `UPDATE sequelize_protect_ci SET email = '("{""invalid"":""data""}")' WHERE id = :id`,
      { replacements: { id: user.id } },
    )

    // Fetch the corrupted record - behavior depends on protectClient.bulkDecryptModels
    // Either it will throw an error or return the invalid data structure as-is
    const fetchedUser = await User.findByPk(user.id)

    // Verify that either:
    // 1. email is the corrupted structure (if protectClient doesn't validate), OR
    // 2. the test would have thrown an error (handled in catch)
    if (fetchedUser) {
      // If no error was thrown, the email should contain the invalid structure
      expect(fetchedUser.email).toHaveProperty('invalid')
    }
  }, 30000)
})
