import 'reflect-metadata'
import 'dotenv/config'
import { AppDataSource } from './data-source'
import { User } from './entity/User'
import { initializeProtectClient, protectedUser } from './protect'
import { ProtectEntityHelper } from './helpers/protect-entity'

async function main() {
  try {
    // Initialize the database connection
    await AppDataSource.initialize()
    console.log('✅ Database connection established')

    // Initialize the Protect client
    const protectClient = await initializeProtectClient()
    console.log('✅ Protect client initialized')

    // Initialize the helper for streamlined operations
    const helper = new ProtectEntityHelper(protectClient)

    console.log('\n🔐 Protect.js TypeORM Integration Demo')
    console.log('=====================================')

    // Example 1: Single user encryption and saving
    console.log('\n1️⃣ Single User Creation with Encryption')
    console.log('----------------------------------------')

    const emailToInsert = `user+${Date.now()}@example.com`
    const ssnToInsert = '123-45-6789'
    const phoneToInsert = '+1-555-123-4567'

    // Encrypt individual fields
    const [emailResult, ssnResult, phoneResult] = await Promise.all([
      protectClient.encrypt(emailToInsert, {
        table: protectedUser,
        column: protectedUser.email,
      }),
      protectClient.encrypt(ssnToInsert, {
        table: protectedUser,
        column: protectedUser.ssn,
      }),
      protectClient.encrypt(phoneToInsert, {
        table: protectedUser,
        column: protectedUser.phone,
      }),
    ])

    // Check for encryption failures
    if (emailResult.failure) {
      throw new Error(`Email encryption failed: ${emailResult.failure.message}`)
    }
    if (ssnResult.failure) {
      throw new Error(`SSN encryption failed: ${ssnResult.failure.message}`)
    }
    if (phoneResult.failure) {
      throw new Error(`Phone encryption failed: ${phoneResult.failure.message}`)
    }

    // Create and save user
    const user = new User()
    user.firstName = 'John'
    user.lastName = 'Doe'
    user.age = 30
    user.email = emailResult.data
    user.ssn = ssnResult.data
    user.phone = phoneResult.data

    const savedUser = await AppDataSource.manager.save(user)
    console.log(`✅ User saved with ID: ${savedUser.id}`)
    console.log('📧 Email encrypted and stored')
    console.log('🆔 SSN encrypted and stored')
    console.log('📱 Phone encrypted and stored')

    // Example 2: Bulk operations (recommended for production)
    console.log('\n2️⃣ Bulk User Creation (Production Recommended)')
    console.log('----------------------------------------------')

    const usersToCreate = [
      {
        firstName: 'Alice',
        lastName: 'Smith',
        age: 28,
        email: 'alice@example.com',
        ssn: '987-65-4321',
        phone: '+1-555-987-6543',
      },
      {
        firstName: 'Bob',
        lastName: 'Johnson',
        age: 35,
        email: 'bob@example.com',
        ssn: '456-78-9012',
        phone: '+1-555-456-7890',
      },
      {
        firstName: 'Carol',
        lastName: 'Williams',
        age: 42,
        email: 'carol@example.com',
        ssn: '789-01-2345',
        phone: null, // Example of null value
      },
    ] as Array<{
      firstName: string
      lastName: string
      age: number
      email: string
      ssn: string
      phone: string | null
    }>

    const bulkSavedUsers = await helper.bulkEncryptAndSave(
      User,
      usersToCreate,
      {
        email: { table: protectedUser, column: protectedUser.email },
        ssn: { table: protectedUser, column: protectedUser.ssn },
        phone: { table: protectedUser, column: protectedUser.phone },
      },
    )

    console.log(
      `✅ ${bulkSavedUsers.length} users created with bulk encryption`,
    )
    console.log('🚀 Used ZeroKMS bulk operations for optimal performance')

    // Example 3: Bulk decryption
    console.log('\n3️⃣ Bulk Data Decryption')
    console.log('----------------------')

    const allUsers = await AppDataSource.manager.find(User)
    console.log(`📊 Found ${allUsers.length} users in database`)

    const decryptedUsers = await helper.bulkDecrypt(allUsers, {
      email: { table: protectedUser, column: protectedUser.email },
      ssn: { table: protectedUser, column: protectedUser.ssn },
      phone: { table: protectedUser, column: protectedUser.phone },
    })

    console.log('✅ All users decrypted using bulk operations')
    console.log('\n📋 Decrypted User Data:')
    decryptedUsers.forEach((user, index) => {
      console.log(
        `  ${index + 1}. ${user.firstName} ${user.lastName} (age ${user.age})`,
      )
      console.log(`     📧 Email: ${user.email}`)
      console.log(`     🆔 SSN: ${user.ssn}`)
      console.log(`     📱 Phone: ${user.phone || 'Not provided'}`)
      console.log(`     📅 Created: ${user.createdAt.toISOString()}`)
      console.log('')
    })

    // Example 4: Searchable encryption
    console.log('4️⃣ Searchable Encryption')
    console.log('------------------------')

    const searchEmail = 'alice@example.com'
    console.log(`🔍 Searching for user with email: ${searchEmail}`)

    const foundUser = await helper.searchEncryptedField(
      User,
      'email',
      searchEmail,
      { table: protectedUser, column: protectedUser.email },
    )

    if (foundUser) {
      // Decrypt the found user's data
      const decryptedFoundUser = await helper.bulkDecrypt([foundUser], {
        email: { table: protectedUser, column: protectedUser.email },
        ssn: { table: protectedUser, column: protectedUser.ssn },
        phone: { table: protectedUser, column: protectedUser.phone },
      })

      const userData = decryptedFoundUser[0]
      console.log(`✅ Found user: ${userData.firstName} ${userData.lastName}`)
      console.log(`📧 Email: ${userData.email}`)
      console.log(`🆔 SSN: ${userData.ssn}`)
      console.log(`📱 Phone: ${userData.phone || 'Not provided'}`)
    } else {
      console.log('❌ No user found with that email')
    }

    // Example 5: Model-level encryption (alternative approach)
    console.log('\n5️⃣ Model-Level Encryption (Alternative)')
    console.log('---------------------------------------')

    const newUser = {
      firstName: 'David',
      lastName: 'Brown',
      age: 29,
      email: 'david@example.com',
      ssn: '111-22-3333',
      phone: '+1-555-111-2222',
    }

    // Encrypt the entire model
    const encryptedModelResult = await protectClient.encryptModel(
      newUser,
      protectedUser,
    )

    if (encryptedModelResult.failure) {
      throw new Error(
        `Model encryption failed: ${encryptedModelResult.failure.message}`,
      )
    }

    const encryptedUser = encryptedModelResult.data
    const finalUser = new User()
    finalUser.firstName = encryptedUser.firstName as string
    finalUser.lastName = encryptedUser.lastName as string
    finalUser.age = encryptedUser.age as number
    // biome-ignore lint/suspicious/noExplicitAny: Required for model encryption type compatibility
    finalUser.email = encryptedUser.email as any
    // biome-ignore lint/suspicious/noExplicitAny: Required for model encryption type compatibility
    finalUser.ssn = encryptedUser.ssn as any
    // biome-ignore lint/suspicious/noExplicitAny: Required for model encryption type compatibility
    finalUser.phone = encryptedUser.phone as any

    const savedModelUser = await AppDataSource.manager.save(finalUser)
    console.log(
      `✅ Model-level encryption completed for user ID: ${savedModelUser.id}`,
    )

    console.log('\n🎉 Demo completed successfully!')
    console.log('\n💡 Key Benefits of this implementation:')
    console.log('   • No complex lifecycle hooks needed')
    console.log('   • Type-safe encrypted columns with @EncryptedColumn')
    console.log('   • Automatic PostgreSQL composite literal transformation')
    console.log('   • Bulk operations for optimal performance')
    console.log('   • Searchable encryption support')
    console.log('   • Clean, maintainable code structure')
  } catch (error) {
    console.error('❌ Error during demo:', error)
  } finally {
    // Close the database connection
    await AppDataSource.destroy()
    console.log('\n🔌 Database connection closed')
  }
}

// Run the demo
main().catch(console.error)
