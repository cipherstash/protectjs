import 'dotenv/config'
// import { eql } from '@cipherstash/jseql'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { eql } = require('@cipherstash/jseql')

export const eqlClient = await eql({
  workspaceId: process.env.CS_WORKSPACE_ID,
  clientId: process.env.CS_CLIENT_ID,
  clientKey: process.env.CS_CLIENT_KEY,
  accessToken: process.env.CS_CLIENT_ACCESS_KEY,
})
