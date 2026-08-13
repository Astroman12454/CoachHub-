CREATE TABLE "physical_test_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "physical_test_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "physical_test_likes_test_id_account_id_unique" UNIQUE("test_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "physical_test_saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "physical_test_saves_test_id_account_id_unique" UNIQUE("test_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "physical_test_id" integer;--> statement-breakpoint
ALTER TABLE "physical_tests" ADD COLUMN "shared_to_community" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "physical_test_comments" ADD CONSTRAINT "physical_test_comments_test_id_physical_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."physical_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_comments" ADD CONSTRAINT "physical_test_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_likes" ADD CONSTRAINT "physical_test_likes_test_id_physical_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."physical_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_likes" ADD CONSTRAINT "physical_test_likes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_saves" ADD CONSTRAINT "physical_test_saves_test_id_physical_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."physical_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_test_saves" ADD CONSTRAINT "physical_test_saves_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_physical_test_id_physical_tests_id_fk" FOREIGN KEY ("physical_test_id") REFERENCES "public"."physical_tests"("id") ON DELETE cascade ON UPDATE no action;