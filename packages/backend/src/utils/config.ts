import "dotenv/config";
import { resolve } from "path";
import { homedir } from "os";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  cguiHome: resolve(
    (process.env.CHARMING_HOME || "~/.charming-ui").replace(/^~/, homedir())
  ),
  logLevel: process.env.LOG_LEVEL || "info",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
};
