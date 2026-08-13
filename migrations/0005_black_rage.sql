CREATE TABLE "coach_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_account_id" integer NOT NULL,
	"following_account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_follows_follower_account_id_following_account_id_unique" UNIQUE("follower_account_id","following_account_id")
);
--> statement-breakpoint
ALTER TABLE "coach_follows" ADD CONSTRAINT "coach_follows_follower_account_id_accounts_id_fk" FOREIGN KEY ("follower_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_follows" ADD CONSTRAINT "coach_follows_following_account_id_accounts_id_fk" FOREIGN KEY ("following_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;