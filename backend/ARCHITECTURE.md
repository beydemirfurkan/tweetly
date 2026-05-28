# Backend Architecture

This document defines the backend module boundaries. It is intentionally pragmatic: keep NestJS modules simple, make dependencies explicit, and prevent adapter code from becoming reusable business logic.

## Module Types

- Feature modules own product capabilities such as accounts, actions, monitoring, extractions, auth, agent, and X automation.
- Adapter modules expose a capability through a transport such as REST, admin REST, MCP, or health endpoints.
- Infrastructure modules wrap framework/runtime concerns such as persistence, config, crypto, workers, and request context.
- Domain code contains framework-light types, policies, ports, and pure services.

## Dependency Direction

Use this direction only:

```txt
adapter/controller/handler
  -> feature application service or facade
    -> domain service/policy/port/type
      -> infrastructure repository/adapter
```

Do not reverse the direction. Feature modules must not import adapter modules.

## Folder Standard

New or touched feature modules should move toward this shape:

```txt
feature/
  feature.module.ts
  controllers/
  dto/
  application/
  domain/
  infrastructure/
  strategies/
  __tests__/
```

Not every folder is required. Create a folder only when the module has that concern.

## Boundary Rules

- `public-api` is an adapter. No code outside `src/public-api/**` may import from `@/public-api/**`.
- `admin-api` is an adapter. Shared queue/action operations belong in `action-engine`, not in `admin-api`.
- `mcp` is an adapter. MCP handlers may call feature application services, not REST facades.
- Controllers and handlers should only parse transport input, apply guards/decorators, and delegate.
- Ownership and tenant checks belong in feature application services, not in transport adapters.
- `@Global()` is reserved for cross-cutting infrastructure such as config, request context, crypto, and workers. Do not use it to hide feature dependencies.
- Feature modules should export a small public provider surface. Avoid exporting internal repositories or low-level adapters unless another module explicitly owns that use case.

## X Automation Modules

- `XAutomationModule` is app-level composition only. Feature and adapter modules should import the focused module that owns the provider they inject.
- `XBrowserModule` owns browser/session helpers such as `XBrowserService`, diagnostics, probes, selectors, and post flow services.
- `XDirectModule` owns synchronous X read/write/profile services and imports browser support internally.
- `XLoginModule` owns login queue, login worker, cookie health, and login orchestration providers.
- `XExecutorsModule` registers action executors with `action-engine`; it is composed by `XAutomationModule` and should not be imported for ordinary read/write/login use cases.
- `ProfileFetcherModule` binds the `PROFILE_FETCHER` domain port to the X direct adapter. `AccountProfilesModule` imports it explicitly so profile caching does not rely on global DI.

## Persistence

The current codebase uses TypeORM repositories directly inside several feature services. That is acceptable for existing code, but new cross-module use cases should prefer feature application services over importing repositories from another module.

When a persistence dependency starts leaking across feature boundaries, create a feature-owned application service or repository adapter and export that instead.

## Refactor Order

1. Move account access and ownership resolution into `accounts/application`.
2. Move shared action queue queries out of `admin-api` and into `action-engine/application`.
3. Add ESLint boundary guards for adapter imports.
4. Split `x-automation` into explicit browser, direct, login, and executor modules.
5. Standardize folder structure module by module.
