/**
 * Web context fetcher — gives the brain/agent real-world context to inject
 * into prompts. Gemma can't browse the internet itself (local Ollama), but
 * the server-side agent fetches relevant snippets and injects them as context.
 *
 * Uses DuckDuckGo Instant Answer API (no auth, no rate limits for personal use).
 */

export interface WebContext {
  query: string;
  snippet: string;
  source?: string;
}

/** Derive search queries from the content_type and copy_style of vision notes. */
export function buildContextQueries(
  userBrief: string,
  contentTypes: string[],
  copyStyles: string[]
): string[] {
  const queries: string[] = [];

  // Content-type specific design vocabulary
  const uniqueTypes = [...new Set(contentTypes.filter(Boolean))];
  for (const ct of uniqueTypes.slice(0, 2)) {
    switch (ct) {
      case "interior-design":
        queries.push("interior design instagram caption trends 2025");
        queries.push("luxury interior design marketing copy examples");
        break;
      case "architecture":
        queries.push("architecture social media caption ideas");
        break;
      case "portrait":
      case "fashion":
        queries.push("fashion editorial headline copy examples");
        break;
      case "product":
        queries.push("product launch social media copy viral");
        break;
      case "food":
        queries.push("food photography social media captions");
        break;
      case "automotive":
        queries.push("automotive social media campaign copy");
        break;
      case "real-estate":
        queries.push("real estate luxury property listing copy");
        break;
    }
  }

  // Brief-driven query
  const brief = userBrief.trim().slice(0, 80);
  if (brief.length > 10) {
    queries.push(`${brief} social media video script ideas`);
  }

  return queries.slice(0, 3);
}

/** Fetch a DuckDuckGo instant answer for a query — returns snippet or null. */
async function fetchDDGSnippet(query: string, timeoutMs = 4000): Promise<WebContext | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as {
      AbstractText?: string;
      Abstract?: string;
      AbstractURL?: string;
      RelatedTopics?: { Text?: string }[];
    };
    const snippet = data.AbstractText || data.Abstract || data.RelatedTopics?.[0]?.Text || "";
    if (!snippet || snippet.length < 20) return null;
    return { query, snippet: snippet.slice(0, 300), source: data.AbstractURL };
  } catch {
    return null;
  }
}

/**
 * Fetch web context for all queries in parallel with a timeout budget.
 * Returns empty array gracefully if the network is unavailable.
 */
export async function fetchWebContext(queries: string[]): Promise<WebContext[]> {
  if (!queries.length) return [];
  const results = await Promise.allSettled(queries.map((q) => fetchDDGSnippet(q)));
  return results
    .filter((r): r is PromiseFulfilledResult<WebContext> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
}

/** Format web context for injection into a Gemma prompt. */
export function formatWebContext(contexts: WebContext[]): string {
  if (!contexts.length) return "";
  return `
═══ WEB CONTEXT (current trends / domain vocabulary — use to inform copy and visual language) ═══
${contexts.map((c, i) => `  ${i + 1}. [${c.query}]\n     ${c.snippet}`).join("\n\n")}
`.trim();
}
