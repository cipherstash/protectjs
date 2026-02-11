# How to contribute to @cipherstash/stack

## I want to report a bug, or make a feature request

Please use the GitHub issue tracker to report bugs, suggest features, or documentation improvements.

[When filing an issue](https://github.com/cipherstash/protectjs/issues/new/choose), please check [existing open](https://github.com/cipherstash/protectjs/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc), or [recently closed](https://github.com/cipherstash/protectjs/issues?q=is%3Aissue+sort%3Aupdated-desc+is%3Aclosed), issues to make sure somebody else hasn't already reported the issue. Please try to include as much information as you can.

---

# Contributing to @cipherstash/stack

Thank you for your interest in contributing to **@cipherstash/stack**! This document will walk you through the repository's structure, how to build and run the project locally, and how to make contributions effectively.

## Repository Structure

```
.
├── examples/
│   ├── example-app-1/
│   └── example-app-2/
│
├── packages/
│   └── stack/       <-- Main package published to npm
│
├── .changeset/
├── .turbo/
├── CONTRIBUTING.md
├── package.json
└── ...
```

### Turborepo

This repo uses [Turborepo](https://turbo.build/) to manage multiple packages and examples in a monorepo structure. Turborepo orchestrates tasks (build, test, lint, etc.) across the different packages in a consistent and efficient manner.

### `packages/stack`

The **@cipherstash/stack** package is the core library that is published to npm under the `@cipherstash/stack` namespace. This is likely where you'll spend most of your time if you're contributing new features or bug fixes related to the core functionality.

### `examples/` Directory

Within the `examples/` directory, you'll find example applications that demonstrate how to use **@cipherstash/stack**. These examples reference the local `@cipherstash/stack` package, allowing you to test and verify your changes to **@cipherstash/stack** in a real-world application scenario.

## Setup Instructions

### 1. Clone the Repo

```bash
git clone https://github.com/cipherstash/protectjs.git
cd protectjs
```

### 2. Install Dependencies

```bash
pnpm install
```

### 4. Build the Main Package

Before you can run any example, you need to build the `@cipherstash/stack` package:

```bash
pnpm run build
```

This command triggers Turborepo's build pipeline, compiling the **@cipherstash/stack** package in `packages/stack` and linking it locally so the example can reference it.

### 5. Run an Example App

Start the dev script which will watch for changes to the packages which are picked up by the example app.

```bash
pnpm run dev
```

Navigate to one of the examples in `examples/` and follow the instructions for the corresponding example.

Now, you can view the running application (if it's a web or server app) or otherwise test the example's output. This will help confirm your local build of **@cipherstash/stack** is working correctly.

## Making Changes

1. **Create a new branch** from `main` (or the default branch):  
   ```bash
   git checkout -b feat/my-new-feature
   ```

2. **Implement your changes** in the relevant package (most likely in `packages/stack`).

3. **Write tests** to cover any new functionality or bug fixes.

## Publish Process (via Changeset)

We use [**Changesets**](https://github.com/changesets/changesets) to manage versioning and publication to npm.

- When you’ve completed a feature or bug fix, **add a changeset** using `npx changeset`. 
- Follow the prompts to indicate the type of version bump (patch, minor, major).
- The [GitHub Actions](./.github/workflows/) (or other CI pipeline) will handle the **publish** step to npm once your PR is merged and the changeset is committed to `main`.

## Pre release process

We currently use [changesets to manage pre-releasing](https://github.com/changesets/changesets/blob/main/docs/prereleases.md) the `next` version of the package, and the process is executed manually.

To do so, you need to:

1. Check out the `next` branch
2. Run `pnpm changeset pre enter next`
3. Run `pnpm changeset version`
4. Run `git add .`
5. Run `git commit -m "Enter prerelease mode and version packages"`
6. Run `pnpm changeset publish --tag next`
7. Run `git push --follow-tags`

When you are ready to release, you can run `pnpm changeset pre exit` to exit prerelease mode and commit the changes.
When you merge the PR, the `next` branch will be merged into `main`, and the package will be published to npm without the prerelease tag.

> [!IMPORTANT]
> This process can be dangerous, so please be careful when using it as it's difficult to undo mistakes.
> If you are unfamiliar with the process, please reach out to the maintainers for help.

## Additional Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Changesets Documentation](https://github.com/changesets/changesets)

# Security issue notifications

If you discover a potential security issue in this project, we ask that you contact us at security@cipherstash.com.

Please do not create a public GitHub issue.

## Code of Conduct

This project has adopted the [Contributor Covenant](https://www.contributor-covenant.org/).
For more information see the [Code of Conduct FAQ](CODE_OF_CONDUCT.md) or contact support@cipherstash.com with any questions or comments.

## Licensing

See the [LICENSE](LICENSE.md) file for our project's licensing.
