# Troubleshoot Linux deployments with npm lockfile v3

Some npm users see deployments fail on Linux (e.g., AWS Lambda) when their `package-lock.json` was created on macOS or Windows.

This happens with `package-lock.json` version 3, where npm only records certain optional native pieces for the platform that created the lockfile. As a result, Linux builds can miss the native engine that `@cipherstash/stack` needs at runtime.

## Who is affected

- You use `npm ci` in CI/CD
- Your `package-lock.json` is version 3 and was generated on macOS/Windows
- You deploy/run on Linux (Lambda, containers, EC2, etc.)

## What you might see

- Build succeeds, but the app fails to start on Linux with an error like “failed to load native addon” or “module not found” related to the `@cipherstash/stack` engine

## Fixes (pick one)

### 1) Recommended: use pnpm

- This repo includes `pnpm-lock.yaml`. pnpm installs the correct native pieces for each platform.
- CI:

```bash
pnpm install --frozen-lockfile
```

### 2) Generate the lockfile on Linux in CI, then run `npm ci`

- Ensures the Linux build records what Linux needs.

```bash
rm -f package-lock.json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --platform=linux --arch=x64
npm ci
```

- Alternative with environment variables:

```bash
npm_config_platform=linux npm_config_arch=x64 npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci
```

### 3) Keep using npm but pin lockfile v2 (npm 8)

- Locally:

```bash
npm install --package-lock-only --lockfile-version=2
```

- CI:

```bash
npm i -g npm@8
npm ci
```

## Quick tip

Before packaging for deployment on Linux, you can quickly verify the native engine loads by running your app’s startup locally inside a Linux container or CI job.


