# 大转盘活动设计方案

> 状态：已确认，待实施
> 目标：通过低门槛、即时到账的抽奖奖励促进首次充值
> 数据原则：用户、订单、充值和订阅信息以 Sub2API 为唯一事实来源；本地只保存抽奖、发奖和人工兑换所必需的审计记录

## 1. 活动规则

活动期内按用户累计有效充值解锁抽奖次数，每位用户最多抽三次：

| 活动期累计充值 | 累计可抽次数 |
| -------------: | -----------: |
|            ¥20 |         1 次 |
|           ¥100 |         2 次 |
|           ¥200 |         3 次 |

有效充值必须同时满足：

- 订单属于当前用户；
- 订单状态为 `COMPLETED`；
- `refund_amount = 0`；
- `paid_at` 位于活动时间范围内，采用左闭右开区间；
- 属于充值订单，不统计订阅购买、赠送余额或其他订单类型。

抽奖资格不落本地票券表。每次加载页面及每次抽奖前，服务端重新从 Sub2API 读取订单并计算：

```text
earned = tier(sum(validOrders.amount))        // 0..3
used = count(localDrawRecords)                // 0..3
available = max(0, earned - used)
```

## 2. 奖池

| 奖励       |  概率 | 发放方式                  |
| ---------- | ----: | ------------------------- |
| ¥2 余额    |   20% | 自动增加 Sub2API 账户余额 |
| ¥5 余额    |   75% | 自动增加 Sub2API 账户余额 |
| ¥10 余额   |    4% | 自动增加 Sub2API 账户余额 |
| ¥20 余额   | 0.89% | 自动增加 Sub2API 账户余额 |
| ¥50 余额   | 0.10% | 自动增加 Sub2API 账户余额 |
| 套餐重置券 | 0.01% | 用户联系管理员人工兑换    |

普通奖池的单次余额奖励期望约为 ¥4.78。按 ¥100 解锁一次的常规口径估算，奖励成本约为充值额的 4.78%；¥20 首充档属于额外获客成本，后台应单独展示。

### 2.1 套餐重置券资格

抽奖前通过 `GET /api/v1/admin/users/{id}/subscriptions` 查询用户订阅。只有存在有效订阅的用户才进入包含套餐重置券的完整奖池。没有有效订阅时，将重置券的 0.01% 概率并入 ¥5：

```text
有有效订阅：¥5 = 75.00%，套餐重置券 = 0.01%
无有效订阅：¥5 = 75.01%，套餐重置券 = 0
```

抽中重置券后，页面只显示中奖记录编号、管理员联系方式和兑换截止日期。用户自行联系管理员，不在活动页面提交联系方式或套餐资料。管理员根据中奖记录和 Sub2API 当前订阅核验后手工重置。

## 3. 数据边界

### 3.1 只从 Sub2API 获取

| 信息     | Sub2API 来源                                                |
| -------- | ----------------------------------------------------------- |
| 当前用户 | `GET /api/v1/auth/me`，使用主站透传 token                   |
| 充值订单 | `GET /api/v1/admin/payment/orders`，按 `user_id` 查询并分页 |
| 有效订阅 | `GET /api/v1/admin/users/{id}/subscriptions`                |
| 余额发放 | `POST /api/v1/admin/users/{id}/balance`                     |

当前 `Sub2ApiPaymentOrder` 类型需要补充 `refund_amount`、`order_type` 等严格校验所需字段。不得用 `paid_at !== null` 代替订单状态和退款校验。

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
2. 从 Sub2API 重新读取该用户订单并计算活动期累计充值。
3. 从 Sub2API 读取有效订阅，构造该用户可用奖池。
4. 开启数据库事务，对 `activityKey + userId` 获取 PostgreSQL 事务级 advisory lock。
5. 再读本地抽奖记录，校验 `used < earned` 且 `used < 3`。
6. 相同 `requestId` 已存在时直接返回原结果，不生成新记录。
7. 使用服务端安全随机数确定奖项。
8. 插入抽奖记录后提交事务；此时该次机会已经消耗。
9. 余额奖调用 Sub2API `addBalance`，套餐重置券直接进入 `MANUAL_PENDING`。
10. 根据发放结果更新 `ISSUED` 或 `ISSUE_FAILED`。

发放余额的幂等键固定为：

```text
sub2apipay:activity:lottery:{drawRecordId}
```

相同请求重放返回第一次的抽奖结果，不重新随机、不再次消耗次数。数据库唯一约束、用户级事务锁和 Sub2API 幂等键共同保证并发安全。

用户端不展示重试按钮，也不提供用户侧重试发奖接口。页面刷新后从抽奖历史读取结果。`ISSUE_FAILED` 只能由管理员在后台重试，重试必须复用原抽奖记录 ID 和完全相同的发奖金额。

## 5. 接口

```text
GET  /api/lottery?token=TOKEN
POST /api/lottery/draw
     { token: TOKEN, requestId: UUID }

GET  /api/admin/lottery?token=ADMIN_TOKEN
POST /api/admin/lottery
     { action: "retry_issue" | "mark_redeemed", drawId, note? }
```

`GET /api/lottery` 返回活动配置、累计可抽次数、已抽次数、剩余次数、三条抽奖记录及是否存在有效订阅。接口不向前端返回订单列表、订阅详情、奖池随机种子或内部错误。

`POST /api/lottery/draw` 只接受 token 和 `requestId`。服务端不得信任客户端传入的用户 ID、充值金额、可抽次数、订阅状态或指定奖品。

管理接口继续使用 `verifyAdminToken`。后台支持查看记录、按发奖状态筛选、重试余额发放和标记套餐重置券已兑换，不复制 Sub2API 的用户或订阅管理能力。

## 6. 用户页面

用户页面第一屏直接呈现转盘，不制作营销落地页。顶部显示活动名称、结束时间和规则入口；转盘下方固定显示“剩余 N / 3 次”。

页面状态：

- 尚未达到 ¥20：主按钮显示“充值满 ¥20 解锁”；
- 有可用次数：按钮显示“立即抽奖”；
- 抽奖提交中：锁定按钮并播放待开奖状态；
- 已抽满三次：按钮显示“本期次数已用完”；
- Sub2API 查询失败：显示数据刷新失败，不展示推算次数；
- 余额发放失败：显示“奖励处理中”，不提供重试操作；
- 抽中重置券：显示中奖编号、管理员联系方式及兑换期限。

转盘动画不参与随机计算。服务端先写入确定结果，前端再旋转至对应奖项。用户关闭页面后重新进入，应直接从历史记录恢复该次结果。

## 7. 管理页面

管理页展示：

- 参与人数、总抽奖次数、各奖项数量和实际余额发放额；
- 首次充值档、第二档、第三档的解锁和使用情况；
- `PENDING`、`ISSUE_FAILED`、`MANUAL_PENDING` 记录；
- 套餐重置券中奖编号、用户 ID、中奖时间和兑换状态。

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

- 同一用户最多存在三个 `drawIndex`，并发请求也不能出现第四条记录；
- 同一 `requestId` 重放始终返回相同结果；
- 无有效订阅用户在大量确定性测试中不会抽到套餐重置券；
- 余额发放超时后由管理员重试，不会重复增加余额；
- 页面和 API 不读取本地用户、订单或订阅快照；
- Sub2API 查询失败时不允许抽奖；
- 删除端午活动后，源码、路由、测试和环境配置中不存在 `duanwu` 残留。
