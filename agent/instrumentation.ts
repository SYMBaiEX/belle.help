import { defineInstrumentation } from "eve/instrumentation";
import { registerOTel } from "@vercel/otel";

/**
 * Belle observability.
 *
 * - OpenTelemetry spans (agent turns, model steps, tool calls) export via
 *   @vercel/otel: on Vercel they land in Vercel Observability automatically;
 *   set OTEL_EXPORTER_OTLP_ENDPOINT to ship them elsewhere.
 * - Vercel Workflow run tags ($eve.*) and Agent Runs are automatic.
 * - Correlation identifiers (Linq trace IDs, GitHub delivery IDs, review/fix
 *   run IDs, approval IDs) are persisted in Convex rows, not only in spans —
 *   Agent Runs/trace retention is not Belle's audit log.
 *
 * Never attach secrets, full API keys, or raw phone numbers to spans.
 */
export default defineInstrumentation({
  setup: ({ agentName }) =>
    registerOTel({
      serviceName: agentName,
    }),
});
