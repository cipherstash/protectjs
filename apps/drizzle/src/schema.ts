import type { CsEncryptedV1Schema } from "@cipherstash/eql";
import { customType, pgTable, serial, varchar } from "drizzle-orm/pg-core";

const cs_encrypted_v1 = <TData>(name: string) =>
	customType<{ data: TData; driverData: string }>({
		dataType() {
			return "cs_encrypted_v1";
		},
		toDriver(value: TData): string {
			return JSON.stringify(value);
		},
	})(name);

export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	email: varchar("email").unique(),
	email_encrypted: cs_encrypted_v1<CsEncryptedV1Schema>("email_encrypted"),
});
