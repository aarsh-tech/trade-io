-- F08a: OrderGateway support columns + idempotent upsert key for orders.
--
-- BEFORE applying, make sure no duplicate (brokerAccountId, brokerOrderId) pairs exist,
-- otherwise the unique index below will fail:
--   SELECT "brokerAccountId", "brokerOrderId", COUNT(*) FROM "orders"
--   WHERE "brokerOrderId" IS NOT NULL
--   GROUP BY 1, 2 HAVING COUNT(*) > 1;
-- (Rows with a NULL in either column never conflict in PostgreSQL.)

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "variety" TEXT,
ADD COLUMN "tag" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_brokerAccountId_brokerOrderId_key" ON "orders"("brokerAccountId", "brokerOrderId");
