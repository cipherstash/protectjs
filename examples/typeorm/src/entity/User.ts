import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { EncryptedData } from '@cipherstash/protect'
import { EncryptedColumn } from '../decorators/encrypted-column'

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

  /**
   * Encrypted email field with automatic PostgreSQL composite literal transformation
   * No lifecycle hooks needed - the @EncryptedColumn decorator handles everything!
   */
  @EncryptedColumn()
  email: EncryptedData | null

  /**
   * Example of a non-nullable encrypted field
   */
  @EncryptedColumn({ nullable: false })
  ssn: EncryptedData

  /**
   * Optional encrypted field for phone numbers
   */
  @EncryptedColumn()
  phone: EncryptedData | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Helper method to get a plain representation of the user (for display purposes)
  getDisplayInfo() {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      age: this.age,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Note: email, ssn, and phone are encrypted and need to be decrypted separately
    }
  }
}
