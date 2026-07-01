CREATE TYPE "public"."cost_category" AS ENUM('llm', 'firecrawl', 'places', 'psi', 'email', 'postcard', 'other');--> statement-breakpoint
CREATE TYPE "public"."edit_request_status" AS ENUM('new', 'in_progress', 'done', 'declined');--> statement-breakpoint
CREATE TYPE "public"."edit_requested_by" AS ENUM('prospect', 'customer');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('corporate', 'individual', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('system', 'operator', 'prospect', 'customer');--> statement-breakpoint
CREATE TYPE "public"."inbox_channel" AS ENUM('email', 'sms', 'call');--> statement-breakpoint
CREATE TYPE "public"."inbox_thread_status" AS ENUM('open', 'needs_reply', 'closed');--> statement-breakpoint
CREATE TYPE "public"."lead_notification_channel" AS ENUM('whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('chatbot', 'form');--> statement-breakpoint
CREATE TYPE "public"."legal_basis" AS ENUM('legitimate_interest_corporate', 'granted_permission', 'consent');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('email_cold', 'email_solicited', 'postcard');--> statement-breakpoint
CREATE TYPE "public"."outreach_message_status" AS ENUM('queued', 'approved', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed', 'blocked_compliance');--> statement-breakpoint
CREATE TYPE "public"."permission_event_kind" AS ENUM('lia_recorded', 'tps_screened', 'phone_permission_granted', 'phone_permission_denied', 'email_opt_in', 'unsubscribed', 'erasure_requested');--> statement-breakpoint
CREATE TYPE "public"."prospect_segment" AS ENUM('no_site', 'bad_site', 'fine');--> statement-breakpoint
CREATE TYPE "public"."prospect_source" AS ENUM('discovery', 'manual');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('discovered', 'classifying', 'enriching', 'scored', 'generating', 'in_review', 'approved', 'outreach_queued', 'contacted', 'replied', 'claimed', 'converted', 'rejected', 'suppressed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_kind" AS ENUM('site', 'pitch');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'regenerate', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('preview', 'claimed', 'live', 'expired', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."spec_generated_by" AS ENUM('llm', 'operator_edit');--> statement-breakpoint
CREATE TYPE "public"."style_preset_status" AS ENUM('active', 'draft', 'retired');--> statement-breakpoint
CREATE TYPE "public"."suppression_kind" AS ENUM('email', 'domain', 'phone', 'place_id');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribe', 'complaint', 'bounce', 'erasure', 'manual');--> statement-breakpoint
CREATE TYPE "public"."trade" AS ENUM('plumber', 'electrician', 'roofer', 'builder', 'heating', 'other');--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"visitor_id" text,
	"messages" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text,
	"stripe_customer_id" text,
	"lead_alert_phone" text,
	"intake" jsonb,
	"gbp_oauth" jsonb,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text,
	"trade" "trade",
	"query" jsonb,
	"results_count" integer,
	"run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"requested_by" "edit_requested_by",
	"body" text,
	"status" "edit_request_status" DEFAULT 'new' NOT NULL,
	"resulting_spec_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid,
	"site_id" uuid,
	"actor" "event_actor" NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"from_addr" text,
	"to_addr" text,
	"body_text" text,
	"body_html" text,
	"raw_ref" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"channel" "inbox_channel" NOT NULL,
	"subject" text,
	"status" "inbox_thread_status" DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"source" "lead_source" NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"message" text,
	"chat_session_id" uuid,
	"notified_at" timestamp with time zone,
	"notification_channel" "lead_notification_channel",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"channel" "outreach_channel",
	"sequence" jsonb,
	"smartlead_campaign_id" text,
	"sending_domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step" integer,
	"channel" "outreach_channel" NOT NULL,
	"subject" text,
	"body" text,
	"legal_basis" "legal_basis",
	"entity_type_at_queue" "entity_type" NOT NULL,
	"status" "outreach_message_status" DEFAULT 'queued' NOT NULL,
	"blocked_reason" text,
	"smartlead_lead_id" text,
	"provider_message_id" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_messages_pecr_cold_email_corporate_only" CHECK ("outreach_messages"."channel" <> 'email_cold' OR "outreach_messages"."entity_type_at_queue" = 'corporate')
);
--> statement-breakpoint
CREATE TABLE "overture_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"overture_id" text,
	"name" text,
	"phone" text,
	"website" text,
	"address" text,
	"postcode" text,
	"lat" double precision,
	"lng" double precision,
	"categories" jsonb,
	"release_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overture_places_overture_id_unique" UNIQUE("overture_id")
);
--> statement-breakpoint
CREATE TABLE "permission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" "permission_event_kind" NOT NULL,
	"channel" text,
	"details" jsonb,
	"valid_until" timestamp with time zone,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"path" text,
	"ip_hash" text,
	"ua_hash" text,
	"referrer" text,
	"is_operator" boolean DEFAULT false NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"provider" text,
	"units" numeric,
	"amount_micro_gbp" bigint,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" text,
	"has_website" boolean,
	"is_facebook_only" boolean,
	"overture_id" text,
	"business_name" text,
	"address" text,
	"postcode" text,
	"city" text,
	"phone" text,
	"website_url" text,
	"trade" "trade",
	"source" "prospect_source",
	"entity_type" "entity_type" DEFAULT 'unknown' NOT NULL,
	"companies_house_number" text,
	"entity_checked_at" timestamp with time zone,
	"status" "prospect_status" DEFAULT 'discovered' NOT NULL,
	"segment" "prospect_segment",
	"website_health_score" integer,
	"extracted_profile" jsonb,
	"data_provenance" jsonb,
	"suppressed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_place_id_unique" UNIQUE("place_id")
);
--> statement-breakpoint
CREATE TABLE "review_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text,
	"city" text,
	"status" text,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" "review_kind" NOT NULL,
	"waitpoint_token" text,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"notes" text,
	"style_preset_override" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"template_id" text,
	"style_preset_id" uuid,
	"model" text,
	"prompt_version" text,
	"validation_report" jsonb,
	"generated_by" "spec_generated_by",
	"regenerate_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_specs_prospect_id_version_unique" UNIQUE("prospect_id","version")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"current_spec_version" integer,
	"status" "site_status" DEFAULT 'preview' NOT NULL,
	"preview_expires_at" timestamp with time zone,
	"noindex" boolean DEFAULT true NOT NULL,
	"claim_token" text,
	"portal_token" text,
	"custom_domain" text,
	"cf_custom_hostname_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_prospect_id_unique" UNIQUE("prospect_id"),
	CONSTRAINT "sites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sites_claim_token_unique" UNIQUE("claim_token"),
	CONSTRAINT "sites_portal_token_unique" UNIQUE("portal_token")
);
--> statement-breakpoint
CREATE TABLE "style_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"style_key" text NOT NULL,
	"name" text NOT NULL,
	"trade" "trade",
	"template_id" text NOT NULL,
	"description" text,
	"palette_id" text NOT NULL,
	"font_pair_id" text NOT NULL,
	"radius" text,
	"variant_weights" jsonb,
	"preferred_sections" jsonb,
	"imagery_pool" text,
	"tone" text,
	"status" "style_preset_status" DEFAULT 'active' NOT NULL,
	"thumbnail_ref" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_presets_style_key_trade_unique" UNIQUE NULLS NOT DISTINCT("style_key","trade")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"price_id" text,
	"status" text,
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "suppression_kind" NOT NULL,
	"value" text NOT NULL,
	"reason" "suppression_reason",
	"source_channel" text,
	"prospect_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_list_kind_value_unique" UNIQUE("kind","value")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_id_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_events" ADD CONSTRAINT "permission_events_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_visits" ADD CONSTRAINT "preview_visits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_costs" ADD CONSTRAINT "prospect_costs_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_batch_id_review_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."review_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_style_preset_override_style_presets_id_fk" FOREIGN KEY ("style_preset_override") REFERENCES "public"."style_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_specs" ADD CONSTRAINT "site_specs_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_specs" ADD CONSTRAINT "site_specs_style_preset_id_style_presets_id_fk" FOREIGN KEY ("style_preset_id") REFERENCES "public"."style_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;