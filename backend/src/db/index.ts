import { Database } from "bun:sqlite";
import { DB_PATH } from "../paths";
import { runMigrations } from "./migrations";

export const db = new Database(DB_PATH);
runMigrations(db);
