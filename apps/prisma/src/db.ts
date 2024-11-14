import { eqlPayload } from '../../../packages/eql/dist'
import { PrismaClient, Prisma } from '@prisma/client'

// TODO: Fix dynamic type of the whereEncrypted method
export const prisma = new PrismaClient().$extends({
  model: {
    $allModels: {
      async whereEncrypted<T>(
        this: T,
        column: string,
        plaintext: string,
      ): Promise<T[]> {
        const context = Prisma.getExtensionContext(this)
        const tableName = context.$name ?? ''

        const result = (await prisma.$queryRaw`SELECT current_schema()`) as [
          { current_schema: string },
        ]
        const schema = result[0].current_schema

        const payload = JSON.stringify(
          eqlPayload({
            plaintext,
            table: tableName,
            column,
          }),
        )

        // TODO: Fix Prisma.raw to prevent SQL injection
        return prisma.$queryRaw<
          T[]
        >`SELECT * FROM "${Prisma.raw(schema)}"."${Prisma.raw(tableName)}" WHERE cs_match_v1(${Prisma.raw(column)}) @> cs_match_v1('${Prisma.raw(payload)}')`
      },
    },
  },
})
