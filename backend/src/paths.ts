import path from "path";
import os from "os";
import fs from "fs";

export const APP_DIR = path.join(os.homedir(), ".anchor");
fs.mkdirSync(APP_DIR, { recursive: true });
export const DB_PATH = path.join(APP_DIR, "data.sqlite");
