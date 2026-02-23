// TODO: Replace all stubs with real API calls

export interface DeviceCodeResponse {
  verificationUrl: string
  userCode: string
  deviceCode: string
  expiresIn: number
  interval: number
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface Workspace {
  id: string
  name: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * TODO: POST to auth service `/device/code` endpoint
 */
export async function startDeviceCodeAuth(): Promise<DeviceCodeResponse> {
  await delay(500)
  return {
    verificationUrl: 'https://cipherstash.com/activate',
    userCode: 'ABCD-1234',
    deviceCode: 'device_code_placeholder',
    expiresIn: 900,
    interval: 5,
  }
}

/**
 * TODO: Poll POST `/device/token` until user completes auth
 */
export async function pollForToken(deviceCode: string): Promise<TokenResponse> {
  void deviceCode
  await delay(2000)
  return {
    accessToken: 'stub_access_token',
    refreshToken: 'stub_refresh_token',
    expiresIn: 3600,
  }
}

/**
 * TODO: GET `/workspaces` with Bearer token
 */
export async function fetchWorkspaces(accessToken: string): Promise<Workspace[]> {
  void accessToken
  await delay(300)
  return [
    { id: 'ws_1', name: 'My First Workspace' },
    { id: 'ws_2', name: 'Production' },
  ]
}

/**
 * TODO: POST `/workspaces` with `{ name }`
 */
export async function createWorkspace(accessToken: string, name: string): Promise<Workspace> {
  void accessToken
  await delay(500)
  return { id: `ws_${Date.now()}`, name }
}

/**
 * TODO: Connect to database and run `CREATE EXTENSION IF NOT EXISTS eql_v2`
 */
export async function installEqlExtension(databaseUrl: string): Promise<void> {
  void databaseUrl
  await delay(1500)
}
