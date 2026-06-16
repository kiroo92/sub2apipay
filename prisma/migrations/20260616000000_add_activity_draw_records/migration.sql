CREATE TYPE "ActivityRewardStatus" AS ENUM ('PENDING', 'ISSUED', 'ISSUE_FAILED');

CREATE TABLE "activity_draw_records" (
  "id" TEXT NOT NULL,
  "activity_key" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "recharge_order_count" INTEGER NOT NULL DEFAULT 0,
  "total_recharge_amount" DECIMAL(10, 2) NOT NULL,
  "prize_key" TEXT NOT NULL,
  "prize_slot" INTEGER,
  "prize_name" TEXT NOT NULL,
  "prize_amount" DECIMAL(10, 2) NOT NULL,
  "issue_status" "ActivityRewardStatus" NOT NULL DEFAULT 'PENDING',
  "issue_error" TEXT,
  "issued_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "activity_draw_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_draw_records_activity_key_user_id_key"
  ON "activity_draw_records"("activity_key", "user_id");

CREATE UNIQUE INDEX "activity_draw_records_activity_key_prize_key_prize_slot_key"
  ON "activity_draw_records"("activity_key", "prize_key", "prize_slot");

CREATE INDEX "activity_draw_records_activity_key_user_id_idx"
  ON "activity_draw_records"("activity_key", "user_id");

CREATE INDEX "activity_draw_records_user_id_created_at_idx"
  ON "activity_draw_records"("user_id", "created_at");
