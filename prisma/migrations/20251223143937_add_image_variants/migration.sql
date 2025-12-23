-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coverLargeKey" TEXT,
ADD COLUMN     "coverMediumKey" TEXT,
ADD COLUMN     "coverThumbnailKey" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
