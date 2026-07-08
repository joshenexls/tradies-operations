ALTER TABLE "discovery_runs" ADD COLUMN "apify_run_id" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "apify_raw" jsonb;--> statement-breakpoint
CREATE INDEX "prospects_normalized_phone_idx" ON "prospects" USING btree ("normalized_phone");