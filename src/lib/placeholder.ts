/**
 * Inline SVG placeholder shown when a thumbnail is not generated yet or
 * failed to load. 16:9 so it scales cleanly with object-cover.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="#262626"/><path d="M68 30v30l26-15z" fill="#525252"/></svg>`;

export const PLACEHOLDER_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
