ALTER TYPE "public"."lead_notification_channel" ADD VALUE 'email';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lead_alert_email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "actioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "chatbot_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_site_id_unique" UNIQUE("site_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id");