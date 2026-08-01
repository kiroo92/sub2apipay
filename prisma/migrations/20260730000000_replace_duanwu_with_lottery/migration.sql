ALTER TABLE "activity_draw_records" RENAME TO "activity_draw_records_duanwu_archive";
ALTER TABLE "activity_draw_records_duanwu_archive"
  RENAME CONSTRAINT "activity_draw_records_pkey" TO "activity_draw_records_duanwu_archive_pkey";
ALTER INDEX "activity_draw_records_activity_key_user_id_key"
  RENAME TO "activity_draw_records_duanwu_archive_activity_key_user_id_key";
ALTER INDEX "activity_draw_records_activity_key_prize_key_prize_slot_key"
  RENAME TO "activity_draw_records_duanwu_archive_prize_slot_key";
ALTER INDEX "activity_draw_records_activity_key_user_id_idx"
  RENAME TO "activity_draw_records_duanwu_archive_activity_key_user_id_idx";
ALTER INDEX "activity_draw_records_user_id_created_at_idx"
  RENAME TO "activity_draw_records_duanwu_archive_user_id_created_at_idx";

ALTER TYPE "ActivityRewardStatus" ADD VALUE IF NOT EXISTS 'MANUAL_PENDING';
ALTER TYPE "ActivityRewardStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REDEEMED';

CREATE TYPE "ActivityPrizeReason" AS ENUM ('RANDOM', 'HIGH_RECHARGE_GUARANTEE');

CREATE TABLE "activity_draw_records" (
  "id" TEXT NOT NULL,
  "activity_key" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "request_id" TEXT NOT NULL,
  "draw_index" INTEGER NOT NULL,
  "prize_key" TEXT NOT NULL,
  "prize_amount" DECIMAL(10, 2) NOT NULL,
  "prize_reason" "ActivityPrizeReason" NOT NULL DEFAULT 'RANDOM',
  "issue_status" "ActivityRewardStatus" NOT NULL DEFAULT 'PENDING',
  "issue_error" TEXT,
  "issued_at" TIMESTAMP(3),
  "admin_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_draw_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_draw_records_draw_index_check" CHECK ("draw_index" BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX "activity_draw_records_activity_key_user_id_request_id_key"
  ON "activity_draw_records"("activity_key", "user_id", "request_id");
CREATE UNIQUE INDEX "activity_draw_records_activity_key_user_id_draw_index_key"
  ON "activity_draw_records"("activity_key", "user_id", "draw_index");
CREATE INDEX "activity_draw_records_activity_key_issue_status_idx"
  ON "activity_draw_records"("activity_key", "issue_status");
CREATE INDEX "activity_draw_records_user_id_created_at_idx"
  ON "activity_draw_records"("user_id", "created_at");
