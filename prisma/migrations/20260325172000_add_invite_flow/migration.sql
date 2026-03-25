ALTER TABLE "subscription_plans"
  ADD COLUMN "invite_reward_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inviter_reward_amount" DECIMAL(10, 2),
  ADD COLUMN "invitee_reward_amount" DECIMAL(10, 2);

CREATE TYPE "InviteRewardRole" AS ENUM ('INVITER', 'INVITEE');
CREATE TYPE "InviteRewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "invite_codes" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_codes_user_id_key" ON "invite_codes"("user_id");
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

CREATE TABLE "invite_bindings" (
  "id" TEXT NOT NULL,
  "inviter_user_id" INTEGER NOT NULL,
  "invitee_user_id" INTEGER NOT NULL,
  "invite_code_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invite_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_bindings_invitee_user_id_key" ON "invite_bindings"("invitee_user_id");
CREATE INDEX "invite_bindings_inviter_user_id_idx" ON "invite_bindings"("inviter_user_id");
CREATE INDEX "invite_bindings_invite_code_id_idx" ON "invite_bindings"("invite_code_id");

ALTER TABLE "invite_bindings"
  ADD CONSTRAINT "invite_bindings_invite_code_id_fkey"
  FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invite_reward_grants" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "binding_id" TEXT NOT NULL,
  "recipient_user_id" INTEGER NOT NULL,
  "role" "InviteRewardRole" NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "status" "InviteRewardStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "failed_reason" TEXT,
  "processing_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invite_reward_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_reward_grants_order_id_role_key" ON "invite_reward_grants"("order_id", "role");
CREATE UNIQUE INDEX "invite_reward_grants_idempotency_key_key" ON "invite_reward_grants"("idempotency_key");
CREATE INDEX "invite_reward_grants_binding_id_idx" ON "invite_reward_grants"("binding_id");
CREATE INDEX "invite_reward_grants_recipient_user_id_idx" ON "invite_reward_grants"("recipient_user_id");
CREATE INDEX "invite_reward_grants_status_idx" ON "invite_reward_grants"("status");

ALTER TABLE "invite_reward_grants"
  ADD CONSTRAINT "invite_reward_grants_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invite_reward_grants"
  ADD CONSTRAINT "invite_reward_grants_binding_id_fkey"
  FOREIGN KEY ("binding_id") REFERENCES "invite_bindings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
