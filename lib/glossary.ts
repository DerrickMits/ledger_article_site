/**
 * Centralized glossary for inline term tooltips across all articles.
 *
 * Add entries here as new operational / architectural terms appear in content.
 * Each entry provides: title, definition (1-2 sentences, operational focus), category.
 */

export interface GlossaryEntry {
  title: string;
  definition: string;
  category: "Concept" | "Metric" | "Architecture" | "Practice" | "Protocol";
}

export const glossary: Record<string, GlossaryEntry> = {
  idempotency: {
    title: "Idempotency",
    category: "Architecture",
    definition:
      "The property of an operation where executing it multiple times produces the same result as executing it once. Critical for webhook handlers and API retry logic to prevent duplicate side-effects such as double-charges or duplicate record creation.",
  },
  "dead-letter-queue": {
    title: "Dead Letter Queue",
    category: "Architecture",
    definition:
      "A holding queue for messages or events that could not be processed after exhausting all retry attempts. Allows operators to inspect, replay, or discard failed items without blocking the main processing pipeline.",
  },
  "webhook-retries": {
    title: "Webhook Retries",
    category: "Protocol",
    definition:
      "Automatic re-delivery attempts of failed webhook events, typically using exponential backoff with a capped retry count. Ensures transient failures (network blips, temporary downtime) do not silently drop critical event data.",
  },
  "rate-limit": {
    title: "API Rate Limit",
    category: "Architecture",
    definition:
      "The maximum number of requests a client may send to an API endpoint within a defined time window. Providers enforce rate limits to protect service stability, prevent abuse, and ensure fair resource allocation across consumers.",
  },
  "reverse-etl": {
    title: "Reverse ETL",
    category: "Architecture",
    definition:
      "The process of moving processed data from a central data warehouse back into operational tools such as CRMs, support platforms, or marketing automation systems. Closes the loop between analytics and day-to-day workflows.",
  },
  "lead-velocity-rate": {
    title: "Lead Velocity Rate",
    category: "Metric",
    definition:
      "A real-time sales metric that measures the net change in qualified leads month-over-month. Unlike pipeline value, it predicts future revenue growth by tracking lead generation momentum before deals close.",
  },
  "etl-pipeline": {
    title: "ETL Pipeline",
    category: "Architecture",
    definition:
      "A data integration pattern consisting of three stages — Extract (pull from source systems), Transform (cleanse, enrich, and restructure), and Load (write into a destination such as a data warehouse). Forms the backbone of automated reporting architectures.",
  },
  "service-level-agreement": {
    title: "Service Level Agreement (SLA)",
    category: "Concept",
    definition:
      "A formal commitment between a service provider and consumer that defines expected performance standards — such as uptime percentages, response-time targets, and resolution timelines — and the remedies available when those standards are not met.",
  },
};

/**
 * Look up a glossary entry by its keyword key.
 */
export function getGlossaryEntry(key: string): GlossaryEntry | undefined {
  return glossary[key];
}

/**
 * Return all glossary entries as an array, sorted alphabetically by title.
 */
export function getAllGlossaryEntries(): GlossaryEntry[] {
  return Object.entries(glossary)
    .map(([, entry]) => entry)
    .sort((a, b) => a.title.localeCompare(b.title));
}