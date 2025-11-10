import type { Express, Request, Response } from 'express'
import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { eq, type SQL } from 'drizzle-orm'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { db } from '../db'
import { transactions } from '../db/schema'
import { protectClient, protectOps } from '../protect/config'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const listTransactionsInput = z
  .object({
    accountNumber: z.string().trim().min(1).max(128).optional(),
    status: z.string().trim().min(1).max(32).optional(),
    minAmount: z.number().finite().optional(),
    maxAmount: z.number().finite().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(500).optional(),
  })
  .strict()

const getTransactionInput = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

const summarizeTransactionsInput = z
  .object({
    status: z.string().trim().min(1).max(32).optional(),
    sampleLimit: z.number().int().min(1).max(500).optional(),
  })
  .strict()

const transactionOutputSchema = z.object({
  id: z.number(),
  accountNumber: z.string(),
  amount: z.number(),
  description: z.string(),
  transactionType: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const listTransactionsOutput = z.object({
  transactions: z.array(transactionOutputSchema),
  appliedFilters: z
    .object({
      accountNumber: z.string().optional(),
      status: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      limit: z.number(),
      offset: z.number(),
    })
    .strict(),
  count: z.number().int().nonnegative(),
})

const getTransactionOutput = z.object({
  transaction: transactionOutputSchema,
})

const summarizeTransactionsOutput = z.object({
  count: z.number().int().nonnegative(),
  totalAmount: z.number(),
  averageAmount: z.number().nullable(),
  statusBreakdown: z.array(
    z.object({
      status: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  sample: z.array(transactionOutputSchema),
})

interface NormalizedTransaction {
  id: number
  accountNumber: string
  amount: number
  description: string
  transactionType: string
  status: string
  createdAt: string
  updatedAt: string
}

function toISOString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

interface DecryptedTransactionModel {
  id: number
  accountNumber: string | null | undefined
  amount: number | string | null | undefined
  description: string | null | undefined
  transactionType: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
}

function normalizeTransaction(
  transaction: DecryptedTransactionModel,
): NormalizedTransaction {
  const amountValue = Number(transaction.amount ?? 0)
  return {
    id: transaction.id,
    accountNumber: transaction.accountNumber ?? 'unknown',
    amount: Number.isNaN(amountValue) ? 0 : amountValue,
    description: transaction.description ?? '',
    transactionType: transaction.transactionType,
    status: transaction.status,
    createdAt: toISOString(transaction.createdAt),
    updatedAt: toISOString(transaction.updatedAt),
  }
}

async function decryptTransactions(
  encryptedModels: Array<typeof transactions.$inferSelect>,
) {
  if (encryptedModels.length === 0) {
    return []
  }
  const decrypted = await protectClient.bulkDecryptModels(encryptedModels)
  if (decrypted.failure) {
    throw new Error(decrypted.failure.message)
  }
  return decrypted.data.map((model, index) => {
    const sourceId = encryptedModels[index]?.id
    const normalizedId =
      typeof sourceId === 'number'
        ? sourceId
        : sourceId !== undefined
          ? Number(sourceId)
          : typeof model.id === 'number'
            ? model.id
            : Number(model.id)

    if (Number.isNaN(normalizedId)) {
      throw new Error(
        'Failed to determine transaction identifier during decryption.',
      )
    }

    return normalizeTransaction({
      ...model,
      id: normalizedId,
    })
  })
}

async function fetchTransactionsWithFilters(
  args: z.infer<typeof listTransactionsInput>,
) {
  const conditions: SQL[] = []

  if (args.accountNumber) {
    conditions.push(
      await protectOps.like(transactions.accountNumber, args.accountNumber),
    )
  }

  if (args.minAmount !== undefined) {
    conditions.push(await protectOps.gte(transactions.amount, args.minAmount))
  }

  if (args.maxAmount !== undefined) {
    conditions.push(await protectOps.lte(transactions.amount, args.maxAmount))
  }

  if (args.status) {
    conditions.push(eq(transactions.status, args.status))
  }

  const baseQuery = db.select().from(transactions)
  const whereClause =
    conditions.length > 0 ? await protectOps.and(...conditions) : undefined
  const withWhere = whereClause ? baseQuery.where(whereClause) : baseQuery
  const withOffset =
    args.offset !== undefined ? withWhere.offset(args.offset) : withWhere

  const effectiveLimit = args.limit ?? 20
  const withLimit = withOffset.limit(effectiveLimit)

  const results = await withLimit.execute()
  const normalized = await decryptTransactions(results)

  return {
    normalized,
    count: normalized.length,
    appliedFilters: {
      accountNumber: args.accountNumber,
      status: args.status,
      minAmount: args.minAmount,
      maxAmount: args.maxAmount,
      limit: effectiveLimit,
      offset: args.offset ?? 0,
    },
  }
}

async function fetchTransactionById(id: number) {
  const [model] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1)

  if (!model) {
    return undefined
  }

  const decrypted = await protectClient.decryptModel(model)
  if (decrypted.failure) {
    throw new Error(decrypted.failure.message)
  }
  const merged: DecryptedTransactionModel = {
    ...decrypted.data,
    id: Number(model.id),
  }
  return normalizeTransaction(merged)
}

async function summarizeTransactions(
  args: z.infer<typeof summarizeTransactionsInput>,
) {
  const baseQuery = db.select().from(transactions)
  const withStatus = args.status
    ? baseQuery.where(eq(transactions.status, args.status))
    : baseQuery

  const sampleLimit = args.sampleLimit ?? 100
  const withLimit = withStatus.limit(sampleLimit)

  const models = await withLimit.execute()
  const normalized = await decryptTransactions(models)

  if (normalized.length === 0) {
    return {
      count: 0,
      totalAmount: 0,
      averageAmount: null,
      statusBreakdown: [],
      sample: [],
    }
  }

  const totalAmount = normalized.reduce((acc, txn) => acc + txn.amount, 0)
  const statusCounts = normalized.reduce<Record<string, number>>((acc, txn) => {
    acc[txn.status] = (acc[txn.status] ?? 0) + 1
    return acc
  }, {})

  const statusBreakdown = Object.entries(statusCounts).map(
    ([status, count]) => ({
      status,
      count,
    }),
  )

  return {
    count: normalized.length,
    totalAmount,
    averageAmount:
      normalized.length > 0 ? totalAmount / normalized.length : null,
    statusBreakdown,
    sample: normalized.slice(0, Math.min(normalized.length, 20)),
  }
}

function formatTransaction(transaction: NormalizedTransaction): string {
  const lines = [
    `ID: ${transaction.id}`,
    `Account: ${transaction.accountNumber}`,
    `Amount: ${transaction.amount.toFixed(2)}`,
    `Type: ${transaction.transactionType}`,
    `Status: ${transaction.status}`,
    `Description: ${transaction.description}`,
    `Created: ${transaction.createdAt}`,
    `Updated: ${transaction.updatedAt}`,
  ]

  return lines.join('\n')
}

function formatTransactionList(
  transactionsList: NormalizedTransaction[],
): string {
  if (transactionsList.length === 0) {
    return 'No transactions matched the provided filters.'
  }

  const header = `Returning ${transactionsList.length} transaction${
    transactionsList.length === 1 ? '' : 's'
  }.`

  const body = transactionsList
    .map(
      (txn) =>
        `- [${txn.id}] ${txn.transactionType} ${txn.amount.toFixed(2)} (${txn.status})`,
    )
    .join('\n')

  return `${header}\n${body}`
}

function formatSummary(
  summary: z.infer<typeof summarizeTransactionsOutput>,
): string {
  const lines = [
    `Sample size: ${summary.count}`,
    `Total amount: ${summary.totalAmount.toFixed(2)}`,
    `Average amount: ${summary.averageAmount !== null ? summary.averageAmount.toFixed(2) : 'n/a'}`,
    'Status breakdown:',
  ]

  if (summary.statusBreakdown.length === 0) {
    lines.push('- No status data available.')
  } else {
    for (const { status, count } of summary.statusBreakdown) {
      lines.push(`- ${status}: ${count}`)
    }
  }

  return lines.join('\n')
}

export interface McpServerOptions {
  route?: string
  sessionIdGenerator?: () => string
  allowedHosts?: string[]
  allowedOrigins?: string[]
}

const serverInfo = {
  name: 'protectjs-drizzle-transactions',
  version: '0.1.0',
}

const instructions = `Use the registered tools to explore encrypted transaction data.
- Use transactions.list to browse transactions with optional filters.
- Use transactions.getById to inspect a specific transaction.
- Use transactions.summary for quick stats.
All results are decrypted just-in-time and never logged.`

export async function registerMcpServer(
  app: Express,
  options: McpServerOptions = {},
) {
  const route = options.route ?? '/mcp'
  const sessionIdGenerator = options.sessionIdGenerator ?? randomUUID

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator,
    allowedHosts: options.allowedHosts,
    allowedOrigins: options.allowedOrigins,
  })

  const mcpServer = new McpServer(serverInfo, {
    capabilities: {
      tools: {},
    },
    instructions,
  })

  mcpServer.registerTool(
    'transactions.list',
    {
      title: 'List transactions',
      description:
        'List decrypted transactions with optional filters over encrypted fields.',
      inputSchema: listTransactionsInput.shape,
      outputSchema: listTransactionsOutput.shape,
    },
    async (
      args: z.infer<typeof listTransactionsInput>,
      _extra,
    ): Promise<CallToolResult> => {
      try {
        const filters = listTransactionsInput.parse(args)
        const { normalized, count, appliedFilters } =
          await fetchTransactionsWithFilters(filters)

        const structuredContent = {
          transactions: normalized,
          appliedFilters,
          count,
        }

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formatTransactionList(normalized),
            },
          ],
          structuredContent,
        }
        return result
      } catch (error) {
        const message =
          error instanceof z.ZodError
            ? `Invalid filters: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Failed to list transactions.'

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
          isError: true,
        }
        return result
      }
    },
  )

  mcpServer.registerTool(
    'transactions.getById',
    {
      title: 'Get transaction by ID',
      description: 'Retrieve and decrypt a transaction by its numeric ID.',
      inputSchema: getTransactionInput.shape,
      outputSchema: getTransactionOutput.shape,
    },
    async (
      args: z.infer<typeof getTransactionInput>,
      _extra,
    ): Promise<CallToolResult> => {
      try {
        const { id } = getTransactionInput.parse(args)
        const transaction = await fetchTransactionById(id)
        if (!transaction) {
          const result: CallToolResult = {
            content: [
              {
                type: 'text',
                text: `Transaction ${id} was not found.`,
              },
            ],
            isError: true,
          }
          return result
        }

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formatTransaction(transaction),
            },
          ],
          structuredContent: {
            transaction,
          },
        }
        return result
      } catch (error) {
        const message =
          error instanceof z.ZodError
            ? `Invalid input: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Failed to fetch the transaction.'

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
          isError: true,
        }
        return result
      }
    },
  )

  mcpServer.registerTool(
    'transactions.summary',
    {
      title: 'Summarize transactions',
      description:
        'Compute lightweight statistics across a sample of decrypted transactions.',
      inputSchema: summarizeTransactionsInput.shape,
      outputSchema: summarizeTransactionsOutput.shape,
    },
    async (
      args: z.infer<typeof summarizeTransactionsInput>,
      _extra,
    ): Promise<CallToolResult> => {
      try {
        const filters = summarizeTransactionsInput.parse(args)
        const summary = await summarizeTransactions(filters)

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formatSummary(summary),
            },
          ],
          structuredContent: summary,
        }
        return result
      } catch (error) {
        const message =
          error instanceof z.ZodError
            ? `Invalid input: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Failed to summarize transactions.'

        const result: CallToolResult = {
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
          isError: true,
        }
        return result
      }
    },
  )

  await mcpServer.connect(transport)

  mcpServer.sendToolListChanged()

  const router = Router()

  router.use(async (req: Request, res: Response, next) => {
    try {
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      next(error)
    }
  })

  app.use(route, router)

  return { mcpServer, transport }
}
