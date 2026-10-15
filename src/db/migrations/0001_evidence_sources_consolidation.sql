CREATE TABLE `evidence_discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`query_id` text NOT NULL,
	`run_id` text NOT NULL,
	`position` integer,
	`provider` text NOT NULL,
	`provider_meta` text,
	`url` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discoveries_evidence_idx` ON `evidence_discoveries` (`evidence_id`);--> statement-breakpoint
CREATE INDEX `discoveries_query_idx` ON `evidence_discoveries` (`query_id`);--> statement-breakpoint
CREATE INDEX `discoveries_project_idx` ON `evidence_discoveries` (`project_id`);--> statement-breakpoint
ALTER TABLE `evidence` ADD `canonical_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `domain` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `category_confidence` text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `fetch_status` text DEFAULT 'snippet_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `final_url` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `evidence` ADD `content_type` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `page_title` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `text_truncated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `text_chars` integer;--> statement-breakpoint
ALTER TABLE `evidence` ADD `text_hash` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `fetched_at` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `fetch_error` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `fetch_run_id` text;--> statement-breakpoint
CREATE INDEX `evidence_canonical_idx` ON `evidence` (`project_id`,`canonical_url`);--> statement-breakpoint
ALTER TABLE `findings` ADD `support_level` text DEFAULT 'snippet_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `findings` ADD `excerpts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `corroboration` text;--> statement-breakpoint
ALTER TABLE `signals` ADD `kind` text DEFAULT 'raw' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `component_signal_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `stats` text;