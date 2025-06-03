CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` json,
	`email` json,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
