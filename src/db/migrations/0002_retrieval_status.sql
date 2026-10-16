ALTER TABLE `findings` ADD `retrieval_origin` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `investigations` ADD `retrieval` text;--> statement-breakpoint
ALTER TABLE `investigations` ADD `retrieval_note` text;--> statement-breakpoint
ALTER TABLE `investigations` ADD `candidate_retrieval` text;--> statement-breakpoint
ALTER TABLE `research_queries` ADD `failure_code` text;