ALTER TABLE "reviews" ALTER COLUMN "comment" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "open_schedule_dates" ADD COLUMN "service_ids" jsonb;