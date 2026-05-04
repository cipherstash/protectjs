import 'dotenv/config'
import { DataTypes, Sequelize, literal } from 'sequelize'
import { Encryption, encryptedTable, encryptedColumn } from '@cipherstash/stack'

import {
  encryptedAttribute,
  registerEqlTypeParser,
  defineEncryptedModel,
  encryptedFinders,
} from './integration.ts'

const DB_URL = process.env.DATABASE_URL!

async function setupTable(sequelize: Sequelize) {
  await sequelize.query(`DROP TABLE IF EXISTS users`)
  await sequelize.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email eql_v2_encrypted,
      age   eql_v2_encrypted,
      role  VARCHAR(50)
    )
  `)
}

async function main() {
  const sequelize = new Sequelize(DB_URL, { logging: false })
  await registerEqlTypeParser(sequelize)
  await setupTable(sequelize)

  const schema = encryptedTable('users', {
    email: encryptedColumn('email').equality().freeTextSearch(),
    age: encryptedColumn('age').dataType('number').orderAndRange(),
  })

  const client = await Encryption({ schemas: [schema] })

  const handle = defineEncryptedModel(
    sequelize,
    'users',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: encryptedAttribute(),
      age: encryptedAttribute(),
      role: { type: DataTypes.STRING(50) },
    },
    { client, schema, tableName: 'users' },
  )
  const User = handle.model
  const q = encryptedFinders(client, handle)

  console.log('\n[1] create — single row')
  const alice = await User.create({ email: 'alice@example.com', age: 30, role: 'admin' } as never)
  console.log('   created id:', (alice as any).id, 'email:', (alice as any).email)
  if ((alice as any).email !== 'alice@example.com') throw new Error('plaintext not restored')

  console.log('\n[2] findByPk — decrypt round-trip')
  const found = await User.findByPk((alice as any).id)
  console.log('   email:', (found as any).email, 'age:', (found as any).age)
  if ((found as any).email !== 'alice@example.com') throw new Error('decrypt: email mismatch')
  if ((found as any).age !== 30) throw new Error('decrypt: age mismatch')

  console.log('\n[3] update — the malformed-record-literal path')
  ;(found as any).email = 'alice2@example.com'
  ;(found as any).age = 31
  await (found as any).save()
  const refound = await User.findByPk((alice as any).id)
  console.log('   email:', (refound as any).email, 'age:', (refound as any).age)
  if ((refound as any).email !== 'alice2@example.com') throw new Error('update did not persist')
  if ((refound as any).age !== 31) throw new Error('update age did not persist')

  console.log('\n[4] bulkCreate — single ZeroKMS call across batch')
  await User.bulkCreate([
    { email: 'bob@example.com', age: 25, role: 'user' },
    { email: 'carol@example.com', age: 40, role: 'user' },
    { email: 'dave@example.com', age: 60, role: 'user' },
  ] as never)
  const all = await User.findAll({ order: [['id', 'ASC']] })
  console.log('   plaintexts:', all.map((u: any) => `${u.email}/${u.age}`).join(', '))
  if (all.length !== 4) throw new Error(`expected 4 rows, got ${all.length}`)

  console.log('\n[5] equality search — eql_v2.eq')
  const eqFrag = await q.eq('email', 'bob@example.com')
  const bobs = await User.findAll({ where: literal((eqFrag as any).val) })
  console.log('   matches:', bobs.length, '->', (bobs[0] as any)?.email)
  if (bobs.length !== 1 || (bobs[0] as any).email !== 'bob@example.com') throw new Error('eq failed')

  console.log('\n[6] range search — eql_v2.gte + lte')
  const [gteFrag, lteFrag] = await Promise.all([q.gte('age', 25), q.lte('age', 45)])
  const inRange = await User.findAll({
    where: literal((q.and(gteFrag, lteFrag) as any).val),
    order: [['id', 'ASC']],
  })
  console.log('   matches:', inRange.map((u: any) => `${u.email}(${u.age})`).join(', '))
  if (inRange.length !== 3) throw new Error(`range expected 3, got ${inRange.length}`)

  console.log('\n[7] ilike search — eql_v2.ilike')
  const ilikeFrag = await q.ilike('email', '%@example.com')
  const all2 = await User.findAll({ where: literal((ilikeFrag as any).val), order: [['id', 'ASC']] })
  console.log('   matches:', all2.length, '->', all2.map((u: any) => u.email).join(', '))
  if (all2.length !== 4) throw new Error(`ilike expected 4, got ${all2.length}`)

  await sequelize.close()
  console.log('\nALL CHECKS PASSED')
}

main().catch(e => {
  console.error('\nFAILED:', e)
  process.exit(1)
})
