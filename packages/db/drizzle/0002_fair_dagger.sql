CREATE TYPE "public"."design_template_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."style_preset_kind" AS ENUM('component', 'html');--> statement-breakpoint
CREATE TABLE "design_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"raw_html" text NOT NULL,
	"components_html" text,
	"annotated_html" text,
	"slot_manifest" jsonb,
	"tokens" jsonb,
	"sample_texts" jsonb,
	"sanitization_report" jsonb,
	"validation_report" jsonb,
	"ingest_model" text,
	"ingest_usage" jsonb,
	"status" "design_template_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"preview_url" text,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pitches_prospect_id_version_unique" UNIQUE("prospect_id","version")
);
--> statement-breakpoint
ALTER TABLE "site_specs" ADD COLUMN "design_template_id" uuid;--> statement-breakpoint
ALTER TABLE "style_presets" ADD COLUMN "kind" "style_preset_kind" DEFAULT 'component' NOT NULL;--> statement-breakpoint
ALTER TABLE "style_presets" ADD COLUMN "design_template_id" uuid;--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_specs" ADD CONSTRAINT "site_specs_design_template_id_design_templates_id_fk" FOREIGN KEY ("design_template_id") REFERENCES "public"."design_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_presets" ADD CONSTRAINT "style_presets_design_template_id_design_templates_id_fk" FOREIGN KEY ("design_template_id") REFERENCES "public"."design_templates"("id") ON DELETE no action ON UPDATE no action;