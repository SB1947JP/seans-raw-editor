/** A handful of traditional Japanese colour names (Nippon Colors), toned
 *  down further (blended ~25% toward neutral gray) from their muted form so
 *  they read as barely-there section accents rather than competing with the
 *  photo itself. */
export const JAPANESE_PALETTE = {
  shuiro: '#AE7C69', // 朱色 — vermillion, muted
  yamabukiiro: '#B09562', // 山吹色 — golden yellow, muted
  asagiiro: '#608B95', // 浅葱色 — light indigo / pale blue-green, muted
  wakatakeiro: '#789381', // 若竹色 — young bamboo green, muted
  fujiiro: '#89849B', // 藤色 — wisteria purple, muted
  nakabeni: '#A8747F', // 中紅 — muted rose, for the Colour Grading section
  edocha: '#9C7A5B', // 江戸茶 — muted Edo brown, for the Tone Curve section
} as const;
