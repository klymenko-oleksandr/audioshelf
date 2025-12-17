-- CreateTable
CREATE TABLE "PlaybackProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybackProgress_sessionId_idx" ON "PlaybackProgress"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackProgress_sessionId_bookId_key" ON "PlaybackProgress"("sessionId", "bookId");

-- AddForeignKey
ALTER TABLE "PlaybackProgress" ADD CONSTRAINT "PlaybackProgress_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
