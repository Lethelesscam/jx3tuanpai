CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`kind` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_kind" CHECK(kind IN ('red', 'black'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_name_key_unique` ON `entries` (`name_key`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`session_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_session_hash_unique` ON `people` (`session_hash`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`entry_id` text NOT NULL,
	`author_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`rating` integer,
	`vote` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `author_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_rating" CHECK(rating BETWEEN 1 AND 10),
	CONSTRAINT "review_vote" CHECK(vote IN (-1, 0, 1))
);
--> statement-breakpoint
CREATE INDEX `reviews_author` ON `reviews` (`author_id`);