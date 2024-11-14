declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string
    DB_HOST: string
    DB_USER: string
    DB_PASSWORD: string
    DB_NAME: string
  }
}
