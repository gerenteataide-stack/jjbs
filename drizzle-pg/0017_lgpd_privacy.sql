CREATE TABLE "lgpd_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"client_id" text,
	"request_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"details" text,
	"resolution_note" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgpd_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
	CONSTRAINT "lgpd_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL,
	CONSTRAINT "lgpd_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE "lgpd_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"policy_text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgpd_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "lgpd_consents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "lgpd_requests_user_date_idx" ON "lgpd_requests" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "lgpd_requests_status_date_idx" ON "lgpd_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "lgpd_consents_user_purpose_date_idx" ON "lgpd_consents" USING btree ("user_id","purpose","recorded_at");
