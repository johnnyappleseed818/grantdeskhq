# GrantDesk interactive demo implementation plan

1. Establish the React 18, TypeScript, Vite, Tailwind, React Router, Lucide, ESLint, and Vitest toolchain without changing the isolated repository or domain binding.
2. Build a typed synthetic grant-reporting model with exact budget, transaction, evidence, requirement, narrative, and review-gate calculations.
3. Create shared accessible navigation plus the landing, interactive demo, sample report, pilot, privacy, and fallback routes with responsive financial-software styling.
4. Implement deterministic local interactions for mapping review, evidence drawers, tailored missing-input collection, contradiction/unsupported-claim controls, quality resolution, and export enablement.
5. Generate clearly labelled synthetic PDF, XLSX, and CSV sample assets from the same required figures and expose working download links.
6. Add calculation, policy, route, navigation, asset, accessibility-label, and mobile-menu tests; then run lint, tests, asset generation, and the production build until clean.
7. Document architecture, limitations, commands, and GitHub Pages, Vercel, and Netlify deployment procedures in `README.md`; verify repository isolation and tracked-file status before release.
