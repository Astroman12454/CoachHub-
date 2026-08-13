CREATE TABLE "play_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"play_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "play_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"play_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "play_likes_play_id_account_id_unique" UNIQUE("play_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "play_saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"play_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "play_saves_play_id_account_id_unique" UNIQUE("play_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "play_id" integer;--> statement-breakpoint
ALTER TABLE "plays" ADD COLUMN "shared_to_community" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "play_comments" ADD CONSTRAINT "play_comments_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_comments" ADD CONSTRAINT "play_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_likes" ADD CONSTRAINT "play_likes_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_likes" ADD CONSTRAINT "play_likes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_saves" ADD CONSTRAINT "play_saves_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_saves" ADD CONSTRAINT "play_saves_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;