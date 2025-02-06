# Basic example using @cipherstash/protect

This is a basic example of how to use the @cipherstash/protect package.

## Usage

1. Create a `.env` file in the root directory of this project with the following contents:

```
CS_CLIENT_ID=your-client-id
CS_CLIENT_KEY=your-client-key
```

2. Run `pnpm install` to install the dependencies.

3. Run `pnpm start` to start the application.

4. The application will log the plaintext to the console which has been encrypted using the CipherStash, decrypted, and logged the original plaintext.