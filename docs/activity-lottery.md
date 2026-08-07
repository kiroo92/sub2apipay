# 大转盘活动设计方案

> 状态：已实施
> 目标：按活动期有效余额充值解锁摇摇卡，并通过用户级大奖限制与全局库存控制成本
> 数据原则：用户、订单和订阅信息以 Sub2API 为唯一事实来源；本地只保存摇奖、发奖和人工兑换所必需的审计记录

## 1. 活动规则

活动期内按累计有效余额充值持续解锁摇摇卡：

| 条件              |                发卡规则 |
| ----------------- | ----------------------: |
| 首次累计满 `$20`  |                    1 张 |
| 后续每增加 `$100` | 再增加 1 张，无用户上限 |

有效充值订单必须属于当前用户、状态为 `COMPLETED`、类型为 `balance`、`refund_amount = 0`，且 `paid_at` 位于活动窗口。

摇摇卡资格不落本地票券表。页面加载及每次摇奖前，服务端重新计算：

```text
earned = totalRecharge < 20 ? 0 : 1 + floor((totalRecharge - 20) / 100)
used = count(localDrawRecords where prizeKey != "redraw")
available = max(0, earned - used)
```

## 2. 奖池

奖池使用服务端整数权重抽取。`$2` 至 `$20` 为不限库存的常规奖，权重保持不变；`$50` 和订阅重置卡有独立全局库存，库存递减时其权重同步递减，耗尽后移出可抽奖池。

| 奖励       | 抽取权重 | 初始概率 | 库存 | 发放方式                  |
| ---------- | -------: | -------: | ---: | ------------------------- |
| `$2` 额度  |     5910 |    59.1% | 不限 | 自动增加 Sub2API 账户余额 |
| `$5` 额度  |     3000 |      30% | 不限 | 自动增加 Sub2API 账户余额 |
| `$10` 额度 |     1000 |      10% | 不限 | 自动增加 Sub2API 账户余额 |
| `$20` 额度 |       80 |     0.8% | 不限 | 自动增加 Sub2API 账户余额 |
| `$50` 额度 |        5 |    0.05% |    5 | 自动增加 Sub2API 账户余额 |
| 订阅重置卡 |        5 |    0.05% |    5 | 用户联系管理员人工兑换    |

### 2.1 大奖与重置资格

`$50` 额度和订阅重置卡属于大奖组。同一用户一旦获得任一大奖，其后续奖池会同时移除全部大奖，大奖概率降为 0。订阅重置卡始终展示在用户页面，但只会进入当前存在有效订阅用户的服务端可抽奖池。

用户使用首张摇摇卡时，服务端候选池只保留 `$2` 和 `$5` 额度；从第二张摇摇卡开始使用完整资格奖池。

有限奖项的历史发放数达到初始库存后立即从服务端可抽奖池移除。库存核对和记录写入位于同一 PostgreSQL 事务与全局 advisory lock 内，多实例并发时也不会超发。普通奖不做库存扣减。

## 3. 数据边界

### 3.1 只从 Sub2API 获取

| 信息     | Sub2API 来源                                                |
| -------- | ----------------------------------------------------------- |
| 当前用户 | `GET /api/v1/auth/me`，使用主站透传 token                   |
| 充值订单 | `GET /api/v1/admin/payment/orders`，按 `user_id` 查询并分页 |
| 有效订阅 | `GET /api/v1/admin/users/{id}/subscriptions`                |
| 额度发放 | `POST /api/v1/admin/users/{id}/balance`                     |

订单资格严格检查状态、退款金额、订单类型和付款时间，摇奖前重新读取订单并计算累计充值。

可以在进程内对 Sub2API 查询做短 TTL 缓存以降低压力，但缓存不是事实来源，不写本地订单快照表；抽奖写入前必须绕过缓存再校验一次。

### 3.2 本地最小记录

本地只保留一张抽奖记录表：

```prisma
enum ActivityRewardStatus {
  PENDING
  ISSUED
  ISSUE_FAILED
  MANUAL_PENDING
  MANUAL_REDEEMED
}

model ActivityDrawRecord {
  id           String               @id @default(cuid())
  activityKey  String               @map("activity_key")
  userId       Int                  @map("user_id")
  requestId    String               @map("request_id")
  drawIndex    Int                  @map("draw_index")
  prizeKey     String               @map("prize_key")
  prizeAmount  Decimal              @db.Decimal(10, 2) @map("prize_amount")
  prizeReason  ActivityPrizeReason  @default(RANDOM) @map("prize_reason")
  issueStatus  ActivityRewardStatus @default(PENDING) @map("issue_status")
  issueError   String?              @db.Text @map("issue_error")
  issuedAt     DateTime?            @map("issued_at")
  adminNote    String?              @db.Text @map("admin_note")
  createdAt    DateTime             @default(now()) @map("created_at")
  updatedAt    DateTime             @updatedAt @map("updated_at")

  @@unique([activityKey, userId, requestId])
  @@unique([activityKey, userId, drawIndex])
  @@index([activityKey, issueStatus])
  @@index([userId, createdAt])
  @@map("activity_draw_records")
}
```

不保存用户名、邮箱、余额、订单明细、累计充值额、订阅详情或联系方式。套餐重置券也不绑定本地套餐快照，兑换时由管理员到 Sub2API 核验当前有效订阅。

## 4. 抽奖事务与重放保护

前端每次主动点击生成 UUID `requestId`。抽奖接口按以下顺序执行：

1. 使用 token 从 Sub2API 获取当前用户。
2. 读取活动期有效余额充值订单和有效订阅，重新计算摇摇卡。
3. 开启数据库事务，先获取全局奖池 lock，再获取当前用户 lock。
4. 相同 `requestId` 已存在时直接返回原结果。
5. 再读本地记录，校验 `used < earned`。
6. 统计有限大奖的全局发放数量，移除库存耗尽奖项。
7. 根据有效订阅与个人大奖历史移除当前用户不具备资格的奖项。
8. 使用服务端安全随机数按当前有效权重确定奖项并写入记录。
9. 额度奖调用 Sub2API `addBalance`，订阅重置卡进入 `MANUAL_PENDING`。
10. 根据自动发放结果更新 `ISSUED` 或 `ISSUE_FAILED`。

发放余额的幂等键固定为：

```text
sub2apipay:activity:lottery:{drawRecordId}
```

相同请求重放返回第一次的摇奖结果，不重新随机、不再次消耗摇摇卡。数据库唯一约束、全局奖池锁、用户锁和 Sub2API 幂等键共同保证并发安全。

用户端不展示重试按钮，也不提供用户侧重试发奖接口。页面刷新后从抽奖历史读取结果。`ISSUE_FAILED` 只能由管理员在后台重试，重试必须复用原抽奖记录 ID 和完全相同的发奖金额。

## 5. 接口

```text
GET  /api/lottery?token=TOKEN
POST /api/lottery/draw
     { token: TOKEN, requestId: UUID }

GET  /api/admin/lottery
POST /api/admin/lottery
     { action: "retry_issue" | "mark_redeemed", drawId, note? }
```

`GET /api/lottery` 返回累计有效充值、累计卡片、剩余卡片、摇奖记录及是否存在有效订阅。接口不返回订单列表、订阅详情、有限奖项库存、随机种子或内部错误。

`POST /api/lottery/draw` 只接受 token 和 `requestId`。服务端不得信任客户端传入的用户 ID、充值金额、可抽次数、订阅状态或指定奖品。

管理接口继续使用 `verifyAdminToken`。后台登录后在当前浏览器会话保存口令，并通过 `Authorization: Bearer` 请求头发送；原查询参数方式继续兼容。

## 6. 用户页面

用户页面第一屏直接呈现转盘。左侧为摇奖操作，右侧展示充值进度和可用摇摇卡，底部为完整摇奖记录。所有奖项始终展示，服务端按订阅资格和有限大奖库存构建每次可抽奖池。

页面状态：

- 暂无摇摇卡：主按钮显示下一档充值解锁金额；
- 有可用卡片：按钮显示“摇一摇”；
- 摇奖提交中：锁定按钮并播放待开奖状态；
- Sub2API 查询失败：显示数据刷新失败，不展示推算次数；
- 余额发放失败：显示“奖励处理中”，不提供重试操作；
- 抽中重置奖励：显示中奖编号和管理员联系方式。

转盘动画不参与随机计算。服务端先写入确定结果，前端再旋转至对应奖项。用户关闭页面后重新进入，应直接从历史记录恢复该次结果。

## 7. 管理页面

管理页展示：

- 总摇奖次数、大奖用户数、普通奖发放数量以及有限大奖的初始库存和剩余库存；
- `PENDING`、`ISSUE_FAILED`、`MANUAL_PENDING` 记录；
- 重置奖励中奖编号、用户 ID、中奖时间和兑换状态。

管理员重试余额发放时只读取本地中奖结果并调用 Sub2API，不重新计算奖项。标记重置券已兑换时必须填写备注；管理员实际重置套餐的操作在 Sub2API 管理端完成。

## 8. 旧活动清理范围

实施时删除端午活动专用页面、接口、逻辑和测试：

```text
src/app/duanwu/
src/app/admin/duanwu/
src/app/api/duanwu/
src/app/api/admin/duanwu/
src/lib/activity/duanwu.ts
src/__tests__/app/api/duanwu/
src/__tests__/lib/activity/duanwu.test.ts
```

新增对应的 `lottery` 页面、接口、活动模块和测试；同步清理 `DUANWU_*` 配置、页面标题、重定向、中间件白名单、端午文案与静态资源引用。根页面改为跳转 `/lottery`，管理根页面改为跳转 `/admin/lottery`。

已执行的历史数据库迁移不删除、不改写。新增迁移将现有 `activity_draw_records` 调整为新模型；生产库中的旧活动记录应在迁移前备份或归档，不把旧字段继续带入运行时代码。

## 9. 验收要点

- 达标充值可持续累计摇摇卡，`drawIndex` 不设业务上限；
- 同一 `requestId` 重放始终返回相同结果；
- 同一用户获得一次大奖后，后续不会再次进入大奖候选池；
- `$50` 额度和订阅重置卡不会超过各自全局库存，普通额度奖持续可抽；
- 无有效订阅用户不会抽到订阅重置卡；
- 余额发放超时后由管理员重试，不会重复增加余额；
- 页面和 API 不读取本地用户、订单或订阅快照；
- Sub2API 查询失败时不允许抽奖；
- 删除端午活动后，源码、路由、测试和环境配置中不存在 `duanwu` 残留。
