/*
  Warnings:

  - You are about to drop the column `coverUrl` on the `Book` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Book" DROP COLUMN "coverUrl",
ADD COLUMN     "coverObjectKey" TEXT;
