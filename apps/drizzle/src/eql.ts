import 'dotenv/config'

// NPM isn't working with Turborepo so hardcoded to cjs build for now
// import { eql } from '@cipherstash/jseql'
import { eql } from '../../../packages/jseql/dist/index.cjs'

export const eqlClient = await eql()
