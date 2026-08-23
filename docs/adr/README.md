# Architecture Decision Records

Format: Context → Decision → Consequences → Alternatives rejected. Records are immutable once
`Accepted`; a reversal is a new ADR that supersedes the old one.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith.md) | Modular monolith with event-driven boundaries | Accepted |
| [0002](0002-supabase-as-platform.md) | Supabase as the primary platform | Accepted |
| [0003](0003-schema-per-domain.md) | Schema-per-domain instead of one `public` schema | Accepted |
| [0004](0004-money-as-integer-paise.md) | Money stored as integer paise | Accepted |
| [0005](0005-transactional-outbox.md) | Transactional outbox for all domain events | Accepted |
| [0006](0006-inventory-pessimistic-locking.md) | Pessimistic row locking for inventory reservation | Accepted |
| [0007](0007-typesense-behind-port.md) | Typesense behind a `SearchEngine` port | Accepted |
| [0008](0008-postgres-js-over-orm.md) | postgres.js with explicit SQL instead of a full ORM | Accepted |
| [0009](0009-rbac-in-database.md) | RBAC resolved from database tables, not JWT metadata | Accepted |
| [0010](0010-price-snapshots.md) | Immutable price snapshots on orders | Accepted |
| [0011](0011-npm-pnpm-turborepo.md) | pnpm workspaces + Turborepo for the monorepo | Accepted |
| [0012](0012-order-state-machine-in-db.md) | Order state machine enforced in the database | Accepted |
