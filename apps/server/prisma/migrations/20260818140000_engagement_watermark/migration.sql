-- AlterTable
ALTER TABLE "engagements" ADD COLUMN     "watermark_color" TEXT,
ADD COLUMN     "watermark_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "watermark_layer" TEXT NOT NULL DEFAULT 'behind',
ADD COLUMN     "watermark_opacity" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "watermark_text" TEXT;

