# Basic example of using @cipherstash/stack

This basic example demonstrates how to use the `@cipherstash/stack` package and the **Encryption SDK** to encrypt and decrypt arbitrary input.

## Installing the basic example

> [!IMPORTANT]
> Make sure you have installed Node.js and [pnpm](https://pnpm.io/installation) before following these steps.

Clone this repo:

```bash
git clone https://github.com/cipherstash/protectjs
```

Install dependencies:

```bash
# Build the repo (including @cipherstash/stack)
cd protectjs
pnpm build

# Install deps for basic example
cd examples/basic
pnpm install
```

Lastly, install the CipherStash CLI:

- On macOS:

  ```bash
  brew install cipherstash/tap/stash
  ```

- On Linux, download the binary for your platform, and put it on your `PATH`:
    - [Linux ARM64](https://github.com/cipherstash/cli-releases/releases/latest/download/stash-aarch64-unknown-linux-gnu)
    - [Linux x86_64](https://github.com/cipherstash/cli-releases/releases/latest/download/stash-x86_64-unknown-linux-gnu)


## Configuring the basic example

> [!IMPORTANT]
> Make sure you have [installed the CipherStash CLI](#installation) before following these steps.

Set up all the configuration and credentials required for the Encryption SDK:

```bash
stash setup
```

If you have not already signed up for a CipherStash account, this will prompt you to do so along the way.

At the end of `stash setup`, you will have two files in your project:

- `cipherstash.toml` which contains the configuration for the Encryption SDK
- `cipherstash.secret.toml` which contains the credentials for the Encryption SDK

> [!WARNING]
> Do not commit `cipherstash.secret.toml` to git, because it contains sensitive credentials.


## Using the basic example

Run the example:

```
pnpm start
```

The application will prompt for a name, encrypt it with CipherStash, log the ciphertext, decrypt it, and log the original plaintext. It then runs a short bulk-encryption demo.
