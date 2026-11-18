/**
 * Example customer brands shown on the website (content, not the Daily Funded palette).
 * The screenshots in assets/site/brand-*.webp are captured with exactly these names/colours
 * (scripts/capture-screens.cjs, D96).
 */
export const SHOWCASE_BRANDS = [
  { key: 'lime', name: 'Your Firm', domain: 'app.yourfirm.com', swatch: '#AFE604' },
  { key: 'orange', name: 'Nova Capital', domain: 'app.novacapital.com', swatch: '#F97316' },
  { key: 'cyan', name: 'Atlas Funding', domain: 'app.atlasfunding.com', swatch: '#22D3EE' },
  { key: 'violet', name: 'Vertex Prop', domain: 'app.vertexprop.com', swatch: '#A78BFA' },
] as const;
