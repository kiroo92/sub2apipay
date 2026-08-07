# Sub2ApiPay 活动服务

面向 Sub2API 用户的摇摇卡活动服务。系统按活动期有效余额充值持续解锁摇摇卡，提供用户摇奖页、加权奖池、额度自动发放、订阅重置卡人工核销和管理后台。

## 功能

- 使用 Sub2API 登录 token 获取当前用户
- 累计有效充值满 `$20` 解锁首张卡，之后每增加 `$100` 再解锁一张
- `$2` 至 `$20` 常规奖励不限库存，大奖由服务端限制全局库存
- 同一用户至多获得一次大奖组奖励
- 余额奖励幂等发放及失败重试
- 当前有效订阅用户可抽订阅重置卡，并由管理员人工核销
- 管理后台统计、筛选和发奖处理

详细规则见 [docs/activity-lottery.md](docs/activity-lottery.md)。

## Docker Compose 部署

### 准备配置

```bash
cp .env.example .env
```

至少替换以下值：

```env
SUB2API_BASE_URL="https://your-sub2api-domain.com"
SUB2API_ADMIN_API_KEY="your-sub2api-admin-api-key"
ADMIN_TOKEN="replace-with-at-least-16-characters"
NEXT_PUBLIC_APP_URL="https://activity.example.com"
DB_PASSWORD="replace-with-a-long-url-safe-password"
```

`DB_PASSWORD` 会嵌入 PostgreSQL URL，请使用字母、数字、下划线或短横线。若使用外部数据库，则填写完整且已编码的 `DATABASE_URL`。

### GHCR 镜像加内置 PostgreSQL

适合全新服务器：

```bash
docker compose -f docker-compose.hub.yml config
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d --wait
```

默认镜像为 `ghcr.io/kiroo92/sub2apipay:latest`，PostgreSQL 数据保存在命名卷 `sub2apipay_pgdata`。

### 从源码构建

```bash
docker compose config
docker compose up -d --build --wait
```

### 外部 PostgreSQL

在 `.env` 中设置 `DATABASE_URL`，然后运行：

```bash
docker compose -f docker-compose.app.yml config
docker compose -f docker-compose.app.yml up -d --wait
```

### 接入既有 Sub2API Docker 网络

在 `.env` 中同时设置 `DATABASE_URL` 和现有网络名称：

```env
SUB2API_DOCKER_NETWORK="sub2api-star_sub2api-network"
```

```bash
docker compose -f docker-compose.prod.yml up -d --wait
```

## Compose 变量

| 变量                     | 默认值                       | 说明                                     |
| ------------------------ | ---------------------------- | ---------------------------------------- |
| `APP_IMAGE`              | `ghcr.io/kiroo92/sub2apipay` | 预构建镜像                               |
| `IMAGE_TAG`              | `latest`                     | 镜像标签                                 |
| `APP_HOST`               | `127.0.0.1`                  | 宿主机监听地址                           |
| `APP_PORT`               | `3001`                       | 宿主机监听端口                           |
| `DB_PASSWORD`            | 无                           | 内置 PostgreSQL 密码，必须显式设置       |
| `LOG_MAX_SIZE`           | `10m`                        | 单个容器日志文件上限                     |
| `LOG_MAX_FILE`           | `3`                          | 容器日志保留文件数                       |
| `SUB2API_DOCKER_NETWORK` | 无                           | `docker-compose.prod.yml` 使用的外部网络 |

应用默认只监听 `127.0.0.1:3001`。公网部署建议由 Nginx 或 Caddy 提供 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name activity.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 运行维护

容器每次启动先执行 `prisma migrate deploy`，迁移失败时应用不会启动。应用和数据库都配置了健康检查、优雅停止和日志轮转。

```bash
# 查看状态
docker compose -f docker-compose.hub.yml ps

# 查看日志
docker compose -f docker-compose.hub.yml logs -f --tail=200 app

# 更新镜像
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d --wait

# 备份数据库
docker compose -f docker-compose.hub.yml exec -T db \
  pg_dump -U sub2apipay -d sub2apipay > sub2apipay.sql

# 恢复数据库
docker compose -f docker-compose.hub.yml exec -T db \
  psql -U sub2apipay -d sub2apipay < sub2apipay.sql
```

## 页面与 API

| 地址                                | 用途                   |
| ----------------------------------- | ---------------------- |
| `/lottery?token=USER_TOKEN`         | 用户抽奖页             |
| `/admin/lottery`                    | 管理后台登录入口       |
| `GET /api/lottery?token=USER_TOKEN` | 用户活动状态           |
| `POST /api/lottery/draw`            | 执行抽奖               |
| `GET /api/admin/lottery`            | 管理记录与统计         |
| `POST /api/admin/lottery`           | 重试发奖或标记券已核销 |

## 本地开发

要求 Node.js 22、pnpm 10.30.3 和 PostgreSQL。

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

## License

[MIT](LICENSE)
