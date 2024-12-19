import { parseArgs } from 'node:util'

export const getEmailArg = ({ required = true }: { required: boolean }) => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      email: {
        type: 'string',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  if (!values.email && required) {
    throw new Error('[ERROR] the email command line argument is required')
  }

  return values.email
}
