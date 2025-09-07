import 'reflect-metadata'
import 'dotenv/config'
import { AppDataSource } from './data-source'
import { User } from './entity/User'
import { protect, csColumn, csTable } from '@cipherstash/protect'

const protectedUser = csTable('user', {
  email_encrypted: csColumn('email_encrypted').equality(),
})

AppDataSource.initialize()
  .then(async () => {
    const protectClient = await protect({
      schemas: [protectedUser],
    })

    const emailToInsert = `test+${Date.now()}@test.com`

    const encryptedEmail = await protectClient.encrypt(emailToInsert, {
      table: protectedUser,
      column: protectedUser.email_encrypted,
    })

    if (encryptedEmail.failure) {
      console.error('Failed to encrypt email: ', encryptedEmail.error)
      return
    }

    console.log('Inserting a new user into the database...')
    const user = new User()
    user.firstName = 'Timber'
    user.lastName = 'Saw'
    user.age = 25
    user.email_encrypted = encryptedEmail.data

    const savedUser = await AppDataSource.manager.save(user)

    console.log('Saved user: ', savedUser)
    console.log(`Saved a new user with id: ${savedUser.id}`)

    console.log('Loading users from the database...')
    const users = await AppDataSource.manager.find(User)

    // This method is not recommended for production use and used only for demonstration purposes
    // --------------------------------------------------------------------------------------------
    // In production, you should use either the bulkDecryptModels or bulkDecrypt methods
    // to decrypt the data in a more efficient way
    const decryptedUsers = await Promise.all(
      users.map(async (user) => {
        return {
          ...user,
          email_encrypted: await protectClient.decrypt(user.email_encrypted),
        }
      }),
    )

    console.log('Loaded users: ', decryptedUsers)

    const term = await protectClient.createSearchTerms([
      {
        value: emailToInsert,
        column: protectedUser.email_encrypted,
        table: protectedUser,
        returnType: 'composite-literal', // Required for the Postgres driver used by
      },
    ])

    if (term.failure) {
      // Handle the error
    }

    console.log(term.data) // array of search terms

    const foundUser = await AppDataSource.manager.findOneBy(User, {
      email_encrypted: term.data[0],
    })

    console.log('Found user: ', foundUser)

    const decryptedFoundUser = await protectClient.decrypt(
      foundUser?.email_encrypted || null,
    )

    console.log('Decrypted found user: ', decryptedFoundUser)
  })
  .catch((error) => console.log(error))
