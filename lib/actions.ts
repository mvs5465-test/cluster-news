import { ActionLimiter } from "@/lib/action-limiter";
import {
  ACTION_REFRESH_MAX_CONCURRENCY,
  ACTION_SAVE_MAX_CONCURRENCY,
} from "@/lib/config";

const refreshLimiter = new ActionLimiter(ACTION_REFRESH_MAX_CONCURRENCY);
const saveLimiter = new ActionLimiter(ACTION_SAVE_MAX_CONCURRENCY);

export function tryAcquireRefreshAction() {
  return refreshLimiter.tryAcquire();
}

export function tryAcquireSaveAction() {
  return saveLimiter.tryAcquire();
}

export function getActionConcurrencyLimits() {
  return {
    refresh: refreshLimiter.getLimit(),
    save: saveLimiter.getLimit(),
  };
}
