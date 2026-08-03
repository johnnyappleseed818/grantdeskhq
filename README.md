# grantdesk static website project

This is a standalone static marketing site for `{{PRODUCT_NAME}}`, a temporary
product name for an early-stage post-award grant-reporting workflow. The local
project codename is `grantdesk`; the public-facing name remains the literal
`{{PRODUCT_NAME}}` placeholder until a final name is approved.

The site describes an AI-assisted draft and evidence-assembly system that
requires professional human review. All visible product demonstrations and
downloadable samples are explicitly identified as synthetic data.

## Project isolation

- Git root: `/home/eli_katz/grantdesk`
- External Git remotes: none by default
- Frameworks: none
- Package installation: none
- External scripts, fonts, analytics and trackers: none

This repository is independent from the ZenLLM and RoyalStyle repositories.

## Files

```text
grantdesk/
├── index.html    # Semantic page content, metadata, form and accessible modal
├── styles.css    # Responsive financial-software visual system
├── script.js     # Configuration, navigation, modal, form and sample downloads
└── README.md     # Setup, configuration and deployment instructions
```

The favicon placeholder is an inline SVG data URL in `index.html`, so it adds
no network request and requires no separate asset.

## Local preview

The site can be opened directly from `index.html`, but a local HTTP server gives
the closest behavior to a deployment:

```bash
cd /home/eli_katz/grantdesk
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build command is required.

## Required configuration

All runtime URLs are grouped at the top of `script.js` in the clearly labelled
`SITE_CONFIG` object:

```js
const SITE_CONFIG = Object.freeze({
  productName: "{{PRODUCT_NAME}}",
  formSubmissionEndpoint: "",
  downloadUrls: Object.freeze({
    sampleReportPdf: "generated://synthetic-sample-report.pdf",
    glMappingXlsx: "generated://synthetic-gl-mapping.xlsx",
  }),
  previewVideoUrl: "",
});
```

### Product name

Replace the literal `{{PRODUCT_NAME}}` only after a final product name has been
approved. It appears in `index.html`, `script.js` and this README.

### Lead-form endpoint

Set `formSubmissionEndpoint` to a reviewed HTTPS endpoint before production.
The form sends a JSON `POST` request containing only the visible form fields,
plus these two identifiers:

```json
{
  "product": "{{PRODUCT_NAME}}",
  "source": "founding-pilot-marketing-site"
}
```

The endpoint should:

1. Accept `Content-Type: application/json`.
2. Return a `2xx` status after accepting the inquiry.
3. Apply appropriate server-side validation and abuse controls.
4. Avoid requesting or accepting client files through this form.

When no endpoint is configured, the form validates normally and presents a
clear configuration message instead of pretending that an inquiry was sent.

### Synthetic sample downloads

The default `generated://` URLs create a small synthetic PDF and a valid
synthetic XLSX file in the browser without third-party libraries. To use
reviewed hosted files instead, replace either value with an HTTPS or same-origin
URL:

```js
downloadUrls: Object.freeze({
  sampleReportPdf: "/assets/reviewed-synthetic-sample-report.pdf",
  glMappingXlsx: "/assets/reviewed-synthetic-gl-mapping.xlsx",
}),
```

Keep the synthetic-data labels in both the page and the files.

### Preview video

Set `previewVideoUrl` to a reviewed HTTPS video URL. Until then, the accessible
modal displays a static synthetic workflow frame and a clear configuration
notice. The modal supports keyboard focus containment, `Escape` to close and
focus restoration.

## Netlify deployment

### Netlify dashboard

1. Put this repository in a new, dedicated Git repository if remote hosting is
   desired.
2. In Netlify, choose **Add new site** → **Import an existing project**.
3. Select the dedicated repository.
4. Leave **Build command** empty.
5. Set **Publish directory** to `.`.
6. Deploy the site.
7. Configure `formSubmissionEndpoint`, download URLs and the preview-video URL
   before using a production domain.

### Netlify CLI

From the project directory, after installing and authenticating the Netlify CLI:

```bash
netlify deploy --dir .
netlify deploy --dir . --prod
```

The lead form uses a configurable JSON endpoint rather than Netlify Forms. Use
a reviewed serverless function or form service and place its URL in
`SITE_CONFIG.formSubmissionEndpoint`.

## Vercel deployment

### Vercel dashboard

1. Import the dedicated repository into a new Vercel project.
2. Choose **Other** as the framework preset if prompted.
3. Leave **Build command** empty.
4. Set **Output directory** to `.`.
5. Deploy.
6. Configure a reviewed form endpoint and the optional hosted asset URLs before
   using a production domain.

### Vercel CLI

From the project directory, after installing and authenticating the Vercel CLI:

```bash
vercel
vercel --prod
```

For the form, a Vercel Function can accept the JSON payload. Keep that function
in a separately reviewed server-side implementation and set its HTTPS URL in
the static site configuration.

## Pre-launch checklist

- Replace `{{PRODUCT_NAME}}` with the approved name.
- Configure and test the lead-form endpoint.
- Confirm the endpoint does not accept file uploads from this form.
- Review the synthetic PDF and XLSX samples.
- Add a reviewed preview video or retain the honest static fallback.
- Replace footer privacy, pilot-term and data-handling anchors with reviewed
  policy pages when those pages exist.
- Replace the Company LinkedIn placeholder only when an official URL exists.
- Add a canonical URL and reviewed Open Graph image after the production domain
  and brand assets exist.
- Re-run keyboard, screen-reader, mobile and reduced-motion checks.
- Verify all public claims against current product and policy documentation.

## Accessibility and performance notes

- Semantic landmarks, headings, labels and table structure are included.
- The mobile menu exposes expanded state and supports `Escape`.
- The preview modal traps focus, closes with `Escape` and restores focus.
- The wide sample table is keyboard-focusable and horizontally scrollable.
- Form errors use native validation plus accessible invalid-state attributes.
- Motion is reduced when `prefers-reduced-motion` is enabled.
- The project uses system fonts and no third-party JavaScript, CSS or images.
- No analytics or tracking code is included.
