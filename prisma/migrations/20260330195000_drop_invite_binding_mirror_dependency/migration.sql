ALTER TABLE "invite_reward_grants"
  ADD COLUMN IF NOT EXISTS "inviter_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "invitee_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "invite_code" TEXT,
  ADD COLUMN IF NOT EXISTS "bound_at" TIMESTAMPTZ;

UPDATE "invite_reward_grants" g
SET
  "inviter_user_id" = b."inviter_user_id",
  "invitee_user_id" = b."invitee_user_id",
  "invite_code" = c."code",
  "bound_at" = b."created_at"
FROM "invite_bindings" b
JOIN "invite_codes" c ON c."id" = b."invite_code_id"
WHERE g."binding_id" = b."id"
  AND (g."inviter_user_id" IS NULL OR g."invitee_user_id" IS NULL OR g."invite_code" IS NULL OR g."bound_at" IS NULL);

ALTER TABLE "invite_reward_grants"
  ALTER COLUMN "inviter_user_id" SET NOT NULL,
  ALTER COLUMN "invitee_user_id" SET NOT NULL,
  ALTER COLUMN "invite_code" SET NOT NULL,
  ALTER COLUMN "bound_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "invite_reward_grants_inviter_user_id_idx" ON "invite_reward_grants"("inviter_user_id");
CREATE INDEX IF NOT EXISTS "invite_reward_grants_invitee_user_id_idx" ON "invite_reward_grants"("invitee_user_id");
CREATE INDEX IF NOT EXISTS "invite_reward_grants_invite_code_idx" ON "invite_reward_grants"("invite_code");

ALTER TABLE "invite_reward_grants" DROP CONSTRAINT IF EXISTS "invite_reward_grants_binding_id_fkey";
DROP INDEX IF EXISTS "invite_reward_grants_binding_id_idx";
ALTER TABLE "invite_reward_grants" DROP COLUMN IF EXISTS "binding_id";
