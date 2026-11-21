CREATE TABLE "installs" (
	"install_id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"registered_on" date NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"install_id" uuid NOT NULL,
	"day" date NOT NULL,
	"schema_version" integer NOT NULL,
	"app_version" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_install_id_day_pk" PRIMARY KEY("install_id","day")
);
--> statement-breakpoint
CREATE TABLE "sends" (
	"install_id" uuid NOT NULL,
	"utc_day" date NOT NULL,
	CONSTRAINT "sends_install_id_utc_day_pk" PRIMARY KEY("install_id","utc_day")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_install_id_installs_install_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."installs"("install_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_install_id_installs_install_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."installs"("install_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_day_idx" ON "reports" USING btree ("day");