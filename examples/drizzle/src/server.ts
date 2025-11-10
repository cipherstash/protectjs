import 'dotenv/config'
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import { transactionsRouter } from './routes/transactions'
import { registerMcpServer } from './mcp/server'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' })
})

// Routes
app.use('/transactions', transactionsRouter)

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  })
})

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

const rawAllowedHosts = process.env.MCP_ALLOWED_HOSTS
const rawAllowedOrigins = process.env.MCP_ALLOWED_ORIGINS
const mcpRoute = process.env.MCP_ROUTE ?? '/mcp'

const allowedHosts = rawAllowedHosts
  ? rawAllowedHosts
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : undefined

const allowedOrigins = rawAllowedOrigins
  ? rawAllowedOrigins
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : undefined

try {
  await registerMcpServer(app, {
    route: mcpRoute,
    allowedHosts,
    allowedOrigins,
  })
} catch (error) {
  console.error('Failed to start MCP server', error)
  process.exitCode = 1
  throw error
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`MCP server mounted at ${mcpRoute}`)
})
