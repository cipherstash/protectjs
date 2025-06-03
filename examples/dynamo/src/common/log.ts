export function log(description: string, data: unknown) {
  console.log(`\n${description}:\n${JSON.stringify(data, null, 2)}`)
}
