# How to contribute to jseql

## I want to report a bug, or make a feature request

Please use the GitHub issue tracker to report bugs, suggest features, or documentation improvements.

[When filing an issue](https://github.com/cipherstash/jseql/issues/new/choose), please check [existing open](https://github.com/cipherstash/jseql/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc), or [recently closed](https://github.com/cipherstash/jseql/issues?q=is%3Aissue+sort%3Aupdated-desc+is%3Aclosed), issues to make sure somebody else hasn't already reported the issue. Please try to include as much information as you can.

---

# Contributing to JSEQL

Thank you for your interest in contributing to **jseql**! This document will walk you through the repository’s structure, how to build and run the project locally, and how to make contributions effectively.

## Repository Structure

```
.
├── apps/
│   ├── example-app-1/
│   └── example-app-2/
│
├── packages/
│   └── jseql/     <-- Main package published to npm
│
├── .changeset/
├── .turbo/
├── CONTRIBUTING.md
├── package.json
└── ...
```

### Turborepo

This repo uses [Turborepo](https://turbo.build/) to manage multiple packages and apps in a monorepo structure. Turborepo orchestrates tasks (build, test, lint, etc.) across the different packages in a consistent and efficient manner.

### `packages/jseql`

The **jseql** package is the core library that is published to npm under the `@cipherstash/jseql` namespace. This is likely where you’ll spend most of your time if you’re contributing new features or bug fixes related to JSEQL’s core functionality.

### `apps/` Directory

Within the `apps/` directory, you’ll find example applications that demonstrate how to use **jseql**. These example apps reference the local `@cipherstash/jseql` package, allowing you to test and verify your changes to **jseql** in a real-world application scenario.

## Setup Instructions

We require you to use [**Bun**](https://bun.sh/) as the JavaScript runtime. This is because some operational scripts are optimized for Bun and may not work correctly in other runtimes like Node.js.

### 1. Install Bun

Follow the [official Bun installation guide](https://bun.sh/docs/install) to install Bun locally.

### 2. Clone the Repo

```bash
git clone https://github.com/cipherstash/jseql.git
cd jseql
```

### 3. Install Dependencies

> **Note:** We use Bun’s native package manager instead of `npm install` or `yarn install`.

```bash
bun install
```

### 4. Build the Main Package

Before you can run any example apps, you need to build the `@cipherstash/jseql` package:

```bash
bun run build
```

This command triggers Turborepo’s build pipeline, compiling the **jseql** package in `packages/jseql` and linking it locally so the example apps can reference it.

### 5. Run an Example App

Start the dev script which will watch for changes to the packages which are picked up by the example apps.

```bash
bun dev
```

Navigate to one of the example apps in `apps/` and follow the instructions for the corresponding examples.

Now, you can view the running application (if it’s a web or server app) or otherwise test the example’s output. This will help confirm your local build of **jseql** is working correctly.

## Making Changes

1. **Create a new branch** from `main` (or the default branch):  
   ```bash
   git checkout -b feat/my-new-feature
   ```

2. **Implement your changes** in the relevant package (most likely in `packages/jseql`).

3. **Write tests** to cover any new functionality or bug fixes.

## Publish Process (via Changeset)

We use [**Changesets**](https://github.com/changesets/changesets) to manage versioning and publication to npm.

- When you’ve completed a feature or bug fix, **add a changeset** using `bunx changeset`. 
- Follow the prompts to indicate the type of version bump (patch, minor, major).
- The [GitHub Actions](./.github/workflows/) (or other CI pipeline) will handle the **publish** step to npm once your PR is merged and the changeset is committed to `main`.

## Additional Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Bun Official Docs](https://bun.sh/docs)
- [Changesets Documentation](https://github.com/changesets/changesets)

---

**Thank you for contributing to JSEQL!** If you have any questions or need clarifications, feel free to open an issue or reach out to the maintainers.

## Contributing via Pull Requests

Please fork the repo, make your changes, and [create a PR](https://github.com/cipherstash/jseql/compare).

# Security issue notifications

If you discover a potential security issue in this project, we ask that you contact us at security@cipherstash.com.

Please do not create a public GitHub issue.

## Code of Conduct

This project has adopted the [Contributor Covenant](https://www.contributor-covenant.org/).
For more information see the [Code of Conduct FAQ](CODE_OF_CONDUCT.md) or contact support@cipherstash.com with any questions or comments.

## Licensing

See the [LICENSE](LICENSE.md) file for our project's licensing.
