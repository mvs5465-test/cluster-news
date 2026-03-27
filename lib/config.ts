import path from "node:path";

export const SITE_NAME = process.env.NEWS_SITE_NAME?.trim() || "Cluster News";
export const DATA_DIR = process.env.NEWS_DATA_DIR?.trim() || path.join(process.cwd(), "data");
export const DB_PATH = process.env.NEWS_DB_PATH?.trim() || path.join(DATA_DIR, "news.db");
export const REFRESH_MINUTES = Math.max(Number.parseInt(process.env.NEWS_REFRESH_MINUTES || "30", 10), 1);
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || "";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || "llama3.2:3b";
