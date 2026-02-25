import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const env = process.env.NODE_ENV;

const candidates =
  env === "production"
    ? [".env.production", ".env"]
    : env === "test"
    ? [".env.test", ".env"]
    : env === "development"
    ? [".env.dev", ".env"]
    : [".env", ".env.dev", ".env.test", ".env.production"];

for (const file of candidates) {
  const fullPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}
