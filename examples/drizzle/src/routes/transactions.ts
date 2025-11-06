import { Router } from 'express'
import {
  createTransaction,
  getTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction,
} from '../controllers/transactions'

export const transactionsRouter = Router()

transactionsRouter.get('/', getTransactions)
transactionsRouter.post('/', createTransaction)
transactionsRouter.get('/:id', getTransaction)
transactionsRouter.put('/:id', updateTransaction)
transactionsRouter.delete('/:id', deleteTransaction)
