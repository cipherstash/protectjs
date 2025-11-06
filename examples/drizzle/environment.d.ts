declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string
    CS_CLIENT_ID: string
    CS_CLIENT_KEY: string
    CS_WORKSPACE_CRN: string
    CS_CLIENT_ACCESS_KEY: string
    PORT?: string
  }
}
