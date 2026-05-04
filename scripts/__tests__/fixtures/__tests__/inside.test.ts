describe('test inside __tests__ directory', () => {
  it('should have npx in test code', () => {
    const cmd = 'npx @cipherstash/cli'
    expect(cmd).toBe('npx @cipherstash/cli')
  })
})
