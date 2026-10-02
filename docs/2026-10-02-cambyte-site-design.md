# cambyte.co.uk — site design (2026-10-02)

## Purpose
Business site for Cambyte, Roberto Pires Almeida's IT company (Cambridge, UK). Audience: small businesses and individuals hiring for app development, IT support/setup, AI consulting. Portfolio is proof, not the product.

## Success
- Visitor understands the three services in 10 seconds and can email hello@cambyte.co.uk in one click.
- Live on https://cambyte.co.uk over HTTPS via Cloudflare Pages; Lighthouse ≥ 95 performance/accessibility on mobile.

## Scope
Static HTML/CSS, no build step, no JS beyond nav toggle. Files: index.html, privacy/index.html, 404.html, robots.txt, sitemap.xml, assets/.
Sections: Hero · Services (Apps, IT support, AI) · Work (Draw & Learn case study, platformer, data-vis) · How it works (chat → quote → build/support) · About · Contact · Footer.
Contact: mailto only. No form, no analytics, no cookies (privacy page states this).
Footer legal: sole trader name until told Cambyte is a Ltd (then add company number + registered address).

## Look
Palette from earlier cambyte-v2 draft: teal #0E7C66, ink #1A2421, bg #F2F4F1; dark mode via prefers-color-scheme. Fonts Archivo / Public Sans / IBM Plex Mono (Google Fonts). Mobile-first, 16px gutters, no horizontal scroll.

## Hosting
Repo Synckser/cambyte-site → Cloudflare Pages (Git integration). Domain stays registered at Wix; nameservers → Cloudflare. Email Routing hello@ → piresbobrob@gmail.com.

## Out of scope
Blog, CMS, contact form backend, pricing page, i18n.
