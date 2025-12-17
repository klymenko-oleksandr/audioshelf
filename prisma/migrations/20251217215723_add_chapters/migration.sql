/*
  Warnings:

  - You are about to drop the column `duration` on the `PlaybackProgress` table. All the data in the column will be lost.
  - You are about to drop the `AudioAsset` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AudioAsset" DROP CONSTRAINT "AudioAsset_bookId_fkey";

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "totalDuration" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlaybackProgress" DROP COLUMN "duration",
ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentChapterId" TEXT;

-- DropTable
DROP TABLE "AudioAsset";

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chapter_bookId_idx" ON "Chapter"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_bookId_order_key" ON "Chapter"("bookId", "order");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
