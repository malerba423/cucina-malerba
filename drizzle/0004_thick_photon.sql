ALTER TABLE "invites" ALTER COLUMN "last_sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "last_sent_at" DROP NOT NULL;