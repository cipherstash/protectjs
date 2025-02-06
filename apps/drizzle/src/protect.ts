import 'dotenv/config'
import { protect } from '@cipherstash/protect'

export const protectClient = await protect()
