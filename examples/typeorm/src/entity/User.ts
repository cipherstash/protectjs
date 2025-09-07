import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  AfterInsert,
  AfterLoad,
  AfterUpdate,
} from 'typeorm'
import type { EncryptedData } from '@cipherstash/protect'

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  age: number

  @Column({
    // biome-ignore lint/suspicious/noExplicitAny: Required for TypeORM to work
    type: <any>'eql_v2_encrypted',
    nullable: true,
  })
  email_encrypted: EncryptedData | null

  @BeforeInsert()
  @BeforeUpdate()
  beforeUpsert() {
    if (this.email_encrypted) {
      // Convert to PostgreSQL composite literal format: (json_string)
      // biome-ignore lint/suspicious/noExplicitAny: Required for TypeORM to work
      this.email_encrypted = <any>(
        `(${JSON.stringify(JSON.stringify(this.email_encrypted))})`
      )
    }
  }

  @AfterInsert()
  @AfterLoad()
  @AfterUpdate()
  onLoad() {
    if (this.email_encrypted && typeof this.email_encrypted === 'string') {
      try {
        // Parse PostgreSQL composite literal format: (json_string)
        let jsonString: string = (this.email_encrypted as string).trim()

        // Remove outer parentheses if they exist
        if (jsonString.startsWith('(') && jsonString.endsWith(')')) {
          jsonString = jsonString.slice(1, -1)
        }

        // Handle PostgreSQL's double-quote escaping: "" -> "
        // PostgreSQL escapes quotes as "" within the JSON string
        jsonString = jsonString.replace(/""/g, '"')

        // Remove outer quotes if they exist
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1)
        }

        // Parse the JSON string
        this.email_encrypted = JSON.parse(jsonString)
      } catch (error: unknown) {
        console.error('Failed to parse encrypted data:', {
          original: this.email_encrypted,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Keep the original string if parsing fails
      }
    }
  }
}
