# Workspace plans and limits

CipherStash uses per-workspace billing.
Each workspace has its own plan, and a single organization can have workspaces on different plans — for example, a free workspace for development and a paid workspace for production.

## Table of contents

- [Plans overview](#plans-overview)
- [Resource limits](#resource-limits)
- [Feature availability](#feature-availability)
- [Workspace types](#workspace-types)
- [Understanding limits](#understanding-limits)
- [Upgrading your plan](#upgrading-your-plan)

## Plans overview

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| **Price** | $0/mo | $99/mo | $870/mo | Custom |
| **Best for** | Side projects and experimentation | Production use for small teams | Demanding workloads with multi-tenant encryption | Enterprise-scale with dedicated support |

Organizations and members are always free and unlimited.
There is no seat gating — anyone can be invited to an organization at no cost.

## Resource limits

Each plan defines limits on the number of resources you can create per workspace:

| Resource | Free | Pro | Business | Enterprise |
|----------|------|-----|----------|------------|
| **Protect operations/month** | 10,000 | 50,000 | 500,000 | Unlimited |
| **Secrets** | 100 | 500 | 2,000 | Unlimited |
| **Keysets** | 2 | 10 | 25 | Unlimited |
| **Client applications** | 2 | 10 | 50 | Unlimited |
| **Workspace members** | 1 | 5 | 25 | Unlimited |

> [!NOTE]
> The `Secrets` class enforces plan limits when calling `.set()`.
> If your workspace has reached its secret limit, the API returns an error prompting you to upgrade.

## Feature availability

Some features are only available on higher-tier plans:

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|------------|
| **Development workspace** | Yes | Yes | Yes | Yes |
| **Production workspace** | No | Yes | Yes | Yes |
| **Multi-tenant encryption** | No | Yes | Yes | Yes |
| **Lock contexts** | No | No | Yes | Yes |
| **OIDC providers** | No | No | Yes (up to 5) | Unlimited |

### Multi-tenant encryption

Multi-tenant encryption uses [keysets](./schema.md) to isolate encryption keys per tenant.
This feature is available on Pro plans and above.

### Lock contexts

[Lock contexts](./identity.md) tie encryption and decryption operations to an authenticated user identity, enabling row-level access control.
This feature requires a Business or Enterprise plan.

## Workspace types

Plans determine what workspace types you can create:

- **Free** — Development workspaces only. Designed for experimentation and non-commercial use.
- **Pro and above** — Both development and production workspaces. Required for shipping to production.

## Understanding limits

When you approach a resource limit, the CipherStash dashboard displays usage metrics and upgrade prompts.
When you reach a limit, creation actions are disabled until you upgrade or delete existing resources.

For example, if you are on the Free plan with 100 secrets, calling `secrets.set()` for a new secret will return an error:

```typescript
const result = await secrets.set('NEW_SECRET', 'value')

if (result.failure) {
  // result.failure.type === 'ApiError'
  // result.failure.message will indicate the plan limit has been reached
}
```

## Upgrading your plan

You can upgrade your workspace plan at any time from the CipherStash dashboard.

- **Upgrades** are applied immediately with prorated billing.
- **Downgrades** take effect at the end of the current billing period.
- **Cancellations** keep the subscription active until the end of the period, then revert to the Free plan.

For Enterprise pricing, [contact CipherStash](https://cipherstash.com/contact).

---

### Didn't find what you wanted?

[Click here to let us know what was missing from our docs.](https://github.com/cipherstash/protectjs/issues/new?template=docs-feedback.yml&title=[Docs:]%20Feedback%20on%20plans.md)
