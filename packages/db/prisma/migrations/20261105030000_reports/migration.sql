-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "sub_id" TEXT;

-- CreateTable
CREATE TABLE "shopee_imports" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "inserted_count" INTEGER NOT NULL,
    "updated_count" INTEGER NOT NULL,
    "unchanged_count" INTEGER NOT NULL,
    "invalid_count" INTEGER NOT NULL,
    "duplicate_count" INTEGER NOT NULL,
    "imported_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopee_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopee_conversions" (
    "order_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL DEFAULT '',
    "sub_id" TEXT,
    "ordered_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "commission" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopee_conversions_pkey" PRIMARY KEY ("order_id","item_key")
);

-- CreateIndex
CREATE INDEX "shopee_imports_created_at_idx" ON "shopee_imports"("created_at");

-- CreateIndex
CREATE INDEX "shopee_conversions_ordered_at_idx" ON "shopee_conversions"("ordered_at");

-- CreateIndex
CREATE INDEX "shopee_conversions_sub_id_ordered_at_idx" ON "shopee_conversions"("sub_id", "ordered_at");

-- CreateIndex
CREATE UNIQUE INDEX "pages_sub_id_key" ON "pages"("sub_id");

-- AddForeignKey
ALTER TABLE "shopee_imports" ADD CONSTRAINT "shopee_imports_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

