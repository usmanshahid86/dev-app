CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`investigation_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`version` integer NOT NULL,
	`sections` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `build_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`version` integer NOT NULL,
	`sections` text NOT NULL,
	`requirements` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`version` integer NOT NULL,
	`agent_recommendation` text NOT NULL,
	`user_decision` text,
	`user_rationale` text,
	`user_pivot_direction` text,
	`decided_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_project_idx` ON `events` (`project_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`query_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`snippet` text NOT NULL,
	`position` integer,
	`provider_meta` text,
	`provider` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`full_text` text,
	`is_demo` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evidence_project_idx` ON `evidence` (`project_id`);--> statement-breakpoint
CREATE INDEX `evidence_query_idx` ON `evidence` (`query_id`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`investigation_id` text NOT NULL,
	`section` text NOT NULL,
	`claim` text NOT NULL,
	`kind` text NOT NULL,
	`support_strength` text NOT NULL,
	`evidence_ids` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `findings_inv_idx` ON `findings` (`investigation_id`);--> statement-breakpoint
CREATE TABLE `investigations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text,
	`kind` text NOT NULL,
	`opportunity_ids` text NOT NULL,
	`status` text NOT NULL,
	`comparison` text,
	`comparison_summary` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`cluster_id` text,
	`title` text NOT NULL,
	`thesis` text NOT NULL,
	`problem` text NOT NULL,
	`target_user` text NOT NULL,
	`evidence_summary` text NOT NULL,
	`signal_ids` text NOT NULL,
	`why_now` text NOT NULL,
	`current_alternatives` text NOT NULL,
	`potential_wedge` text NOT NULL,
	`monetization_notes` text NOT NULL,
	`competition_notes` text NOT NULL,
	`buildability_notes` text NOT NULL,
	`distribution_notes` text NOT NULL,
	`major_uncertainties` text NOT NULL,
	`open_questions` text NOT NULL,
	`dimensions` text NOT NULL,
	`status` text NOT NULL,
	`seeded` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opps_project_idx` ON `opportunities` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`stage` text NOT NULL,
	`mode` text NOT NULL,
	`discovery_profile` text NOT NULL,
	`selected_opportunity_id` text,
	`decision_status` text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`query_id` text NOT NULL,
	`provider` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`query` text NOT NULL,
	`family` text NOT NULL,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`executed_at` text,
	`duration_ms` integer,
	`result_count` integer,
	`raw_response_id` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `queries_run_idx` ON `research_queries` (`run_id`);--> statement-breakpoint
CREATE INDEX `queries_project_idx` ON `research_queries` (`project_id`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_ids` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`budget` text NOT NULL,
	`search_provider` text NOT NULL,
	`agent_provider` text NOT NULL,
	`progress` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_project_idx` ON `research_runs` (`project_id`);--> statement-breakpoint
CREATE TABLE `signal_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`rationale` text NOT NULL,
	`signal_ids` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`type` text NOT NULL,
	`observation` text NOT NULL,
	`inference` text NOT NULL,
	`affected_user` text,
	`uncertainty` text NOT NULL,
	`confidence` text NOT NULL,
	`evidence_ids` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signals_project_idx` ON `signals` (`project_id`);--> statement-breakpoint
CREATE TABLE `validation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`build_package_id` text NOT NULL,
	`run_id` text,
	`version` integer NOT NULL,
	`original_assumptions` text NOT NULL,
	`what_we_built` text NOT NULL,
	`implementation_lessons` text NOT NULL,
	`new_evidence_ids` text NOT NULL,
	`assumption_status` text NOT NULL,
	`external_changes` text NOT NULL,
	`verdict` text,
	`rationale` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
