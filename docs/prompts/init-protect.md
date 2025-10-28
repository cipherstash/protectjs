# Implementing Protect.js into a Node.js application

Your task is to introduce Protect.js into a Node.js application. Protect.js requires the Node.js runtime so it will still work with framweworks like Next.js and Tanstack Start, since they support running code that only executes on the server.

---

## Installing Protect.js

Determine what package manager the application is using. This will either be `pnpm`, `npm`, or `bun` and then use the appropriate package manager to add Protect.js to the application:

```bash
npm install @cipehrstash/protect
# or
pnpm add @cipehrstash/protect
# or
bun add @cipehrstash/protect
```

If you detect a mono repo, you need to ask the user which application they want Protect.js installed in.

---

## Adding scafolding for the Protect.js client, schemas, and example code

In the rool of the application (if the application is configred to use something like `src` then this is where these operations will occur), you need to add a `protect` directory with the following files/content. If the application uses TypeScript use the `.ts` extension, else use the `.js` extension.

`protect/schemas.(ts/js)`
```js
import { csTable, csColumn } from '@cipherstash/protect`

export const protectedExample = csTable('example_table', {
  sensitiveData: csColumn('sensitiveData'),
}
```

`protect/index.(ts/js)`
```js
import { protect } from '@cipehrstash/protect'
import { * as protectSchemas } from './schemas'

export const protectClient = protect({
  schemas: [...protectSchemas]
})
```

`protect/example.(ts/js)`
```js
import { protectClient } from './index'
import { * as protectSchemas } from './schemas'

const sensitiveData = "Let's encrypt some data."

/** 
 * There is no need to wrap any protectClient method in a try/catch as it will always return a Result pattern.
 * ---
 * The Result will either contain a `failure` OR a `data` key. You should ALWAYS check for the `failure` key first.
 * If the `failure` key is present, you should handle the error accordingly.
 * If the `data` key is present, the operation was successful.
 */
//
const encryptResult = protectClient.encrypt(sensitiveData, {
  table: protectSchemas.protectedExample
  column: protectSchemas.protectedExample.sensitiveData
})

if (encryptResult.failure) {
  // You as the developer can determine exactly how you want to handle the failure scenario.
}

const encryptedData = encryptResult.data

/**
 * The encryptedData is a JSON object which is unique to CipherStash.
 * You can store this data in any data store that supports JSON, however, only PostgreSQL supports searchable encryption operations.
 * ---
 * When storing in PostgreSQL, the database instance needs to be configured to Encrypt Query Language (EQL).
 * More information can be found in the [Encrypt Query Language (EQL) documentation](https://github.com/cipherstash/encrypt-query-language).
 * After EQL is installed, you can use the `eql_v2_encrypted` data type to store the encrypted data.
 * ```sql
 * CREATE TABLE protected_example (
 *   id SERIAL PRIMARY KEY,
 *   sensitive_data eql_v2_encrypted
 * )
 * ```
 **/
console.log('encryptedData:', encryptedData)

const decryptResult = protectClient.decrypt(encryptedData)

if (decryptResult.failure) {
  // Again, you as the developer can determine exactly how you want to handle the failure scenario.
}

const decryptedData = decryptResult.data

/**
 * The decryptedData is the plaintext data.
 */
console.log('decryptedData:', decryptedData)
```

---

After the initialization process, you need to also analyze the application code base to determine the following:

1. What database and general data store (if any) does the application connect to and store data?
2. Does the application use a specific ORM (like Drizzle ORM, Prisma, or Sequalize)?
3. What types of data inputs does this application ingest that could be considered sensitive data?
4. If the application is ingesting sensitive data, where does the application store the data?

Use these answer in combonation with the answers provided a CIPHERSTASH_GETTING_STARTED.md file which will be used to help the user determine the next steps based on the application specific details.