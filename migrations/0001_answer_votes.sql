CREATE TABLE "answer_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "answer_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "accepted" boolean NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "community_rejected" boolean DEFAULT false;
