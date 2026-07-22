-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "audio_extracted_at" TIMESTAMP(3),
ADD COLUMN     "video_deleted_at" TIMESTAMP(3);
