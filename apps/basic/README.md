# Basic example of using @cipherstash/protect

This basic example demonstrates how to use the `@cipherstash/protect` package to encrypt arbitrary input.

## Install

> [!IMPORTANT]
> Make sure you have installed Node.js and [pnpm](https://pnpm.io/installation) before following these steps.

Clone this repo:

```bash
git clone https://github.com/cipherstash/protectjs
```

Install dependencies:

```bash
# Build Project.js
cd protectjs
pnpm build

# Install deps for basic example
cd protectjs/apps/basic
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


## Configure

> [!IMPORTANT]
> Make sure you have [installed the CipherStash CLI](#installation) before following these steps.

To set up all the configuration and credentials required for Protect.js:

```bash
stash setup
```

If you have not already signed up for a CipherStash account, this will prompt you to do so along the way.

At the end of `stash setup`, you will have two files in your project:

- `cipherstash.toml` which contains the configuration for Protect.js
- `cipherstash.secret.toml`: which contains the credentials for Protect.js

> [!WARNING]
> `cipherstash.secret.toml` should not be committed to git, because it contains sensitive credentials.


## Usage

Run the example:

```
pnpm start
```

The application will log the plaintext to the console which has been encrypted using the CipherStash, decrypted, and logged the original plaintext.
