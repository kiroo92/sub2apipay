-- CreateTable: channels
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'claude',
    "rate_multiplier" DECIMAL(10,4) NOT NULL,
    "description" TEXT,
    "models" TEXT,
    "features" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subscription_plans
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "original_price" DECIMAL(10,2),
    "validity_days" INTEGER NOT NULL DEFAULT 30,
    "features" TEXT,
    "for_sale" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: system_configs
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);

-- AlterTable: orders - add subscription fields
ALTER TABLE "orders" ADD COLUMN "order_type" TEXT NOT NULL DEFAULT 'balance';
ALTER TABLE "orders" ADD COLUMN "plan_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "subscription_group_id" INTEGER;
ALTER TABLE "orders" ADD COLUMN "subscription_days" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "channels_group_id_key" ON "channels"("group_id");
CREATE INDEX "channels_sort_order_idx" ON "channels"("sort_order");

CREATE UNIQUE INDEX "subscription_plans_group_id_key" ON "subscription_plans"("group_id");
CREATE INDEX "subscription_plans_for_sale_sort_order_idx" ON "subscription_plans"("for_sale", "sort_order");

CREATE INDEX "system_configs_group_idx" ON "system_configs"("group");

CREATE INDEX "orders_order_type_idx" ON "orders"("order_type");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
