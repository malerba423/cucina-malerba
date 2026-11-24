CREATE TABLE "recipe_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_links" ADD CONSTRAINT "recipe_links_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_links_recipe_idx" ON "recipe_links" USING btree ("recipe_id","position");