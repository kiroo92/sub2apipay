# Sub2ApiPay Activity Service

A recharge lottery service for Sub2API users. It provides the user lottery page, server-side prize selection, automatic balance rewards, manual subscription-reset voucher redemption, and an admin dashboard.

## Features

- Authenticate users with their Sub2API token
- Grant draw attempts from valid recharge orders in the activity window
- Weighted server-side prize selection with at most three draws
- Idempotent balance rewards with retry support
- Manual subscription-reset voucher redemption
- Admin statistics, filtering, and reward operations

See [docs/activity-lottery.md](docs/activity-lottery.md) for the full rules.

## Docker Compose

Create the deployment configuration:

```bash
cp .env.example .env
```

Replace at least these values:

```env
SUB2API_BASE_URL="https://your-sub2api-domain.com"
SUB2API_ADMIN_API_KEY="your-sub2api-admin-api-key"
ADMIN_TOKEN="replace-with-at-least-16-characters"
NEXT_PUBLIC_APP_URL="https://activity.example.com"
DB_PASSWORD="replace-with-a-long-url-safe-password"
```

`DB_PASSWORD` is embedded in a PostgreSQL URL. Use letters, digits, underscores, or hyphens. For an external database, provide a complete encoded `DATABASE_URL`.

### GHCR Image with PostgreSQL

```bash
docker compose -f docker-compose.hub.yml config
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d --wait
```

The default image is `ghcr.io/kiroo92/sub2apipay:latest`. PostgreSQL data is stored in the `sub2apipay_pgdata` named volume.

### Build from Source

```bash
docker compose config
docker compose up -d --build --wait
```

### External PostgreSQL

Set `DATABASE_URL` in `.env`, then run:

```bash
docker compose -f docker-compose.app.yml config
docker compose -f docker-compose.app.yml up -d --wait
```

### Existing Sub2API Docker Network

Set `DATABASE_URL` and the existing network name in `.env`:

```env
SUB2API_DOCKER_NETWORK="sub2api-star_sub2api-network"
```

```bash
docker compose -f docker-compose.prod.yml up -d --wait
```

## Compose Variables

| Variable                 | Default                      | Description                                        |
| ------------------------ | ---------------------------- | -------------------------------------------------- |
| `APP_IMAGE`              | `ghcr.io/kiroo92/sub2apipay` | Published application image                        |
| `IMAGE_TAG`              | `latest`                     | Image tag                                          |
| `APP_HOST`               | `127.0.0.1`                  | Host bind address                                  |
| `APP_PORT`               | `3001`                       | Host bind port                                     |
| `DB_PASSWORD`            | none                         | Required bundled PostgreSQL password               |
| `LOG_MAX_SIZE`           | `10m`                        | Maximum container log file size                    |
| `LOG_MAX_FILE`           | `3`                          | Number of retained container log files             |
| `SUB2API_DOCKER_NETWORK` | none                         | External network used by `docker-compose.prod.yml` |

The default bind address is `127.0.0.1:3001`. Put Nginx or Caddy with HTTPS in front of the service for public deployments.

## Operations

The container runs `prisma migrate deploy` before starting the application. A failed migration prevents startup. Application and database services include health checks, graceful shutdown, and log rotation.

```bash
# Status and logs
docker compose -f docker-compose.hub.yml ps
docker compose -f docker-compose.hub.yml logs -f --tail=200 app

# Upgrade
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d --wait

# Backup
docker compose -f docker-compose.hub.yml exec -T db \
  pg_dump -U sub2apipay -d sub2apipay > sub2apipay.sql
```

## Routes

| Route                               | Purpose                                 |
| ----------------------------------- | --------------------------------------- |
| `/lottery?token=USER_TOKEN`         | User lottery page                       |
| `/admin/lottery?token=ADMIN_TOKEN`  | Admin dashboard                         |
| `GET /api/lottery?token=USER_TOKEN` | User activity state                     |
| `POST /api/lottery/draw`            | Perform a draw                          |
| `GET /api/admin/lottery`            | Admin records and statistics            |
| `POST /api/admin/lottery`           | Retry rewards or mark vouchers redeemed |

## Development

Node.js 22, pnpm 10.30.3, and PostgreSQL are required.

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

## License

[MIT](LICENSE)
