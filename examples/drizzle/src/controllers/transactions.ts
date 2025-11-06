import { eq } from 'drizzle-orm'
import type { Request, Response } from 'express'
import { db } from '../db'
import { transactions } from '../db/schema'
import {
  protectClient,
  protectOps,
  transactionsSchema,
} from '../protect/config'

interface CreateTransactionBody {
  accountNumber: string
  amount: number
  description?: string
  transactionType: string
  status?: string
}

interface UpdateTransactionBody {
  accountNumber?: string
  amount?: number
  description?: string
  transactionType?: string
  status?: string
}

// GET /transactions - List all transactions with optional filters
export async function getTransactions(req: Request, res: Response) {
  try {
    const { accountNumber, minAmount, maxAmount, status } = req.query

    let query = db.select().from(transactions)

    // Build where conditions
    const conditions = []

    // Account number search (encrypted field)
    if (accountNumber && typeof accountNumber === 'string') {
      const accountCondition = await protectOps.like(
        transactions.accountNumber,
        accountNumber,
      )
      conditions.push(accountCondition)
    }

    // Amount range (encrypted field)
    if (minAmount !== undefined || maxAmount !== undefined) {
      if (minAmount !== undefined) {
        const minAmountNum = Number(minAmount)
        if (!Number.isNaN(minAmountNum)) {
          conditions.push(protectOps.gte(transactions.amount, minAmountNum))
        }
      }
      if (maxAmount !== undefined) {
        const maxAmountNum = Number(maxAmount)
        if (!Number.isNaN(maxAmountNum)) {
          conditions.push(protectOps.lte(transactions.amount, maxAmountNum))
        }
      }
    }

    // Status filter (non-encrypted field)
    if (status && typeof status === 'string') {
      conditions.push(eq(transactions.status, status))
    }

    // Apply conditions
    if (conditions.length > 0) {
      const condition = await protectOps.and(...conditions)
      query = query.where(condition) as typeof query
    }

    // Execute query
    const results = await query.execute()

    // Decrypt results
    const decryptedResult = await protectClient.bulkDecryptModels(results)
    if (decryptedResult.failure) {
      return res.status(500).json({
        error: 'Decryption failed',
        message: decryptedResult.failure.message,
      })
    }

    res.json({ transactions: decryptedResult.data })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// POST /transactions - Create new transaction
export async function createTransaction(req: Request, res: Response) {
  try {
    const body = req.body as CreateTransactionBody

    // Validate required fields
    if (
      !body.accountNumber ||
      body.amount === undefined ||
      !body.transactionType
    ) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'accountNumber, amount, and transactionType are required',
      })
    }

    // Prepare transaction data
    const transactionData = {
      accountNumber: body.accountNumber,
      amount: body.amount,
      description: body.description || '',
      transactionType: body.transactionType,
      status: body.status || 'pending',
    }

    // Encrypt the transaction model
    const encryptedResult = await protectClient.encryptModel<
      typeof transactionData
    >(transactionData, transactionsSchema)

    if (encryptedResult.failure) {
      return res.status(500).json({
        error: 'Encryption failed',
        message: encryptedResult.failure.message,
      })
    }

    // Insert encrypted data
    const [inserted] = await db
      .insert(transactions)
      .values(encryptedResult.data)
      .returning()

    // Decrypt the inserted record for response
    const decryptedResult = await protectClient.decryptModel(inserted)
    if (decryptedResult.failure) {
      return res.status(500).json({
        error: 'Decryption failed',
        message: decryptedResult.failure.message,
      })
    }

    res.status(201).json({ transaction: decryptedResult.data })
  } catch (error) {
    console.error('Error creating transaction:', error)
    res.status(500).json({
      error: 'Failed to create transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// GET /transactions/:id - Get single transaction by ID
export async function getTransaction(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id, 10)

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid transaction ID' })
    }

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1)

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' })
    }

    // Decrypt the transaction
    const decryptedResult = await protectClient.decryptModel(transaction)
    if (decryptedResult.failure) {
      return res.status(500).json({
        error: 'Decryption failed',
        message: decryptedResult.failure.message,
      })
    }

    res.json({ transaction: decryptedResult.data })
  } catch (error) {
    console.error('Error fetching transaction:', error)
    res.status(500).json({
      error: 'Failed to fetch transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// PUT /transactions/:id - Update transaction
export async function updateTransaction(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id, 10)

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid transaction ID' })
    }

    const body = req.body as UpdateTransactionBody

    // Check if transaction exists
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1)

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' })
    }

    // Build update data (only include fields that are provided)
    const updateData: Partial<typeof existing> = {
      updatedAt: new Date(),
    }

    if (body.transactionType !== undefined) {
      updateData.transactionType = body.transactionType
    }
    if (body.status !== undefined) {
      updateData.status = body.status
    }

    // If sensitive fields are being updated, we need to encrypt them
    if (
      body.accountNumber !== undefined ||
      body.amount !== undefined ||
      body.description !== undefined
    ) {
      // Decrypt existing transaction to get current values
      const decryptedExisting = await protectClient.decryptModel(existing)
      if (decryptedExisting.failure) {
        return res.status(500).json({
          error: 'Decryption failed',
          message: decryptedExisting.failure.message,
        })
      }

      // Merge with new values
      const mergedData = {
        accountNumber:
          body.accountNumber ?? decryptedExisting.data.accountNumber,
        amount: body.amount ?? decryptedExisting.data.amount,
        description: body.description ?? decryptedExisting.data.description,
        transactionType:
          body.transactionType ?? decryptedExisting.data.transactionType,
        status: body.status ?? decryptedExisting.data.status,
      }

      // Encrypt the merged data
      const encryptedResult = await protectClient.encryptModel(
        mergedData,
        transactionsSchema,
      )

      if (encryptedResult.failure) {
        return res.status(500).json({
          error: 'Encryption failed',
          message: encryptedResult.failure.message,
        })
      }

      // Merge encrypted fields into update data
      Object.assign(updateData, {
        accountNumber: encryptedResult.data.accountNumber,
        amount: encryptedResult.data.amount,
        description: encryptedResult.data.description,
      })
    }

    // Update the transaction
    const [updated] = await db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning()

    // Decrypt the updated record for response
    const decryptedResult = await protectClient.decryptModel(updated)
    if (decryptedResult.failure) {
      return res.status(500).json({
        error: 'Decryption failed',
        message: decryptedResult.failure.message,
      })
    }

    res.json({ transaction: decryptedResult.data })
  } catch (error) {
    console.error('Error updating transaction:', error)
    res.status(500).json({
      error: 'Failed to update transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// DELETE /transactions/:id - Delete transaction
export async function deleteTransaction(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id, 10)

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid transaction ID' })
    }

    // Check if transaction exists
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1)

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' })
    }

    // Delete the transaction
    await db.delete(transactions).where(eq(transactions.id, id))

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting transaction:', error)
    res.status(500).json({
      error: 'Failed to delete transaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
