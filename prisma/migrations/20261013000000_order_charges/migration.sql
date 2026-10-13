-- Zerodha virtual contract note charges per order, so the ledger shows the broker's exact charges.
ALTER TABLE "orders" ADD COLUMN "charges" DOUBLE PRECISION, ADD COLUMN "chargesQty" INTEGER;
