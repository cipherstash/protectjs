import { Router } from 'express'
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactions,
  updateTransaction,
} from '../controllers/transactions'

export const transactionsRouter = Router()

transactionsRouter.get('/', getTransactions)
transactionsRouter.post('/', createTransaction)
transactionsRouter.get('/:id', getTransaction)
transactionsRouter.put('/:id', updateTransaction)
transactionsRouter.delete('/:id', deleteTransaction)
