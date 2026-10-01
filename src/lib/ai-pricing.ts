// Single source of API prices for the Functions Stats cost estimate. The
// usage data holds only tokens and characters; update these values (and the
// dates) when Google changes its price lists.

export interface AiPricing {
  /** Date (UTC) the prices below apply from. */
  effectiveFrom: string;
  /** Date (UTC) the prices were last checked against the sources. */
  checkedOn: string;
  sources: Array<{ label: string; url: string }>;
  /** USD per 1M tokens, paid tier, text/image input. Thinking is billed as output. */
  geminiPerMillionTokens: Record<string, { input: number; output: number }>;
  /** USD per 1M characters after the monthly free tier, keyed by voice type. */
  ttsPerMillionCharacters: Record<string, number>;
}

export const AI_PRICING: AiPricing = {
  effectiveFrom: "2026-10-01",
  checkedOn: "2026-10-01",
  sources: [
    {
      label: "Gemini API pricing",
      url: "https://ai.google.dev/gemini-api/docs/pricing",
    },
    {
      label: "Cloud Text-to-Speech pricing",
      url: "https://cloud.google.com/text-to-speech/pricing",
    },
  ],
  geminiPerMillionTokens: {
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  },
  ttsPerMillionCharacters: {
    Standard: 4,
    Wavenet: 4,
    Neural2: 16,
    Polyglot: 16,
    "Chirp3-HD": 30,
    Studio: 160,
  },
};
