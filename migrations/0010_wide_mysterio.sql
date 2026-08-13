CREATE TABLE "exercise_saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "exercise_saves_exercise_id_account_id_unique" UNIQUE("exercise_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "exercise_saves" ADD CONSTRAINT "exercise_saves_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_saves" ADD CONSTRAINT "exercise_saves_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;