CREATE TABLE "lgpd_policy_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgpd_policy_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lgpd_policy_versions_one_active_idx" ON "lgpd_policy_versions" USING btree ("active") WHERE "active" = true;
--> statement-breakpoint
CREATE INDEX "lgpd_policy_versions_published_at_idx" ON "lgpd_policy_versions" USING btree ("published_at");
--> statement-breakpoint
CREATE TABLE "lgpd_request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgpd_request_events_request_id_lgpd_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "lgpd_requests"("id") ON DELETE CASCADE,
	CONSTRAINT "lgpd_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "lgpd_request_events_request_date_idx" ON "lgpd_request_events" USING btree ("request_id", "created_at");
--> statement-breakpoint
CREATE TABLE "lgpd_security_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'investigating' NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"impact" text,
	"containment" text,
	"reported_by" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgpd_security_incidents_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL,
	CONSTRAINT "lgpd_security_incidents_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "lgpd_security_incidents_status_check" CHECK ("status" IN ('investigating', 'contained', 'closed'))
);
--> statement-breakpoint
CREATE INDEX "lgpd_security_incidents_status_date_idx" ON "lgpd_security_incidents" USING btree ("status", "detected_at");
