import client from "prom-client";

const register = new client.Registry();

let configured = false;

function ensureMetricsConfigured() {
  if (configured) {
    return;
  }
  client.collectDefaultMetrics({ register });
  configured = true;
}

export async function getMetricsPayload() {
  ensureMetricsConfigured();
  return {
    body: await register.metrics(),
    contentType: register.contentType,
  };
}
