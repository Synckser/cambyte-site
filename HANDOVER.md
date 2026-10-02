# CAMBYTE — Website handover (last updated 2026-10-03)

Cambyte = Roberto's IT company (sole trader; app development, IT support, AI consulting; Cambridge UK).
Site = cambyte.co.uk. Read this file first before touching anything.

## Where things are
| Thing | Location |
|---|---|
| Site source | `~/Desktop/cambyte-site` → GitHub `Synckser/cambyte-site` (branch `main`) |
| Design spec | `cambyte-site/docs/2026-10-02-cambyte-site-design.md` |
| Live preview | https://cambyte-site.pages.dev (Cloudflare Pages, auto-deploys on push) |
| Cloudflare account | Bob.pires@hotmail.co.uk, account id `0df8ea9a20396b69f6bf6eb56162293f` |
| Cloudflare zone | cambyte.co.uk — **PENDING** (nameservers not yet Cloudflare) |
| Domain registrar | **Wix**, account bob.pires@hotmail.co.uk (NOT the Apple-relay Wix login). Renews 3 Apr 2027. |
| Contact email | hello@cambyte.co.uk → Email Routing rule → piresbobrob@gmail.com (rule exists, MX not yet active) |

## Site facts
- Static HTML/CSS, no build. Files: `index.html`, `privacy/index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `_headers`, `assets/`.
- Edit → commit → push → live in ~1 min. Preview locally: `python3 -m http.server 8791`.
- Palette teal `#0E7C66`, ink `#1A2421`; fonts Archivo / Public Sans / IBM Plex Mono. Dark mode supported.
- Footer says sole trader. If Cambyte becomes Ltd: add company number + registered address to footer + privacy page (UK law).
- Portfolio shown: Draw & Learn (App Store id6777554616, `?ct=cambyte` tracking), p5.js platformer, data-vis demos. CV PDF at `/assets/Roberto-Pires-Almeida-CV.pdf`.

## Cloudflare state (done 2026-10-03)
- Pages project `cambyte-site` connected to GitHub (app installed on that repo only). No build command, output `/`.
- DNS records in zone: `CNAME @ → cambyte-site.pages.dev` (proxied), `CNAME www → cambyte-site.pages.dev` (proxied).
- Old Zoho Mail MX + SPF + DKIM + verification TXT **deleted** (Roberto: "Zoho is old, drop it").
- Email Routing: rule `hello@cambyte.co.uk → piresbobrob@gmail.com` ACTIVE; destination already verified. MX/SPF/DKIM records cannot be added until zone is active.
- Assigned nameservers: `harmony.ns.cloudflare.com`, `jarred.ns.cloudflare.com`.

## THE BLOCKER — Wix forbids nameserver changes
Wix does not let you edit nameservers on Wix-registered domains (no menu option exists). Only way onto Cloudflare DNS = **transfer the registration to Cloudflare Registrar**. .uk transfers: free, no extra year, uses IPS tag (no auth code), completes within ~24 h.

### Roberto must do (Claude is permission-blocked on domain/DNS clicks in both dashboards)
1. Cloudflare → Domains → Transfers: https://dash.cloudflare.com/0df8ea9a20396b69f6bf6eb56162293f/domains/transfer → add `cambyte.co.uk` → confirm (card on file needed, £0 for .uk).
2. Wix → Domains → ⋯ next to cambyte.co.uk → **Transfer away from Wix** → IPS tag `CLOUDFLARE` → Continue → Submit Request.
3. Wait up to 24 h. Check: `dig +short NS cambyte.co.uk` should show the two Cloudflare nameservers.

### After zone is active (Claude can do, or 3 clicks)
1. Workers & Pages → `cambyte-site` → Custom domains → add `cambyte.co.uk`, then `www.cambyte.co.uk`.
2. Email Routing → cambyte.co.uk → Settings → DNS records → **Add missing records**.
3. DNS → Add record: `CNAME bob → bob-ai-jehc.onrender.com`, DNS only. (Wix DNS had this → a Render app at bob.cambyte.co.uk; Cloudflare's import missed it. Skip if app is dead.)
4. SSL/TLS → Edge Certificates → Always Use HTTPS on. Optional Redirect Rule www → apex.
5. Verify: `curl -I https://cambyte.co.uk` 200, `https://www.cambyte.co.uk` 200, send test mail to hello@.

## Old Wix DNS snapshot (for reference, before transfer)
- A @ → 34.58.143.4 (nginx default page, unknown host — not needed)
- CNAME www → cambyte.co.uk
- CNAME bob → bob-ai-jehc.onrender.com
- MX mx.zoho.eu 10 / mx2.zoho.eu 20 / mx3.zoho.eu 50
- TXT spf zohomail.eu, zoho-verification, zmail._domainkey DKIM
- NS ns2.wixdns.net, ns3.wixdns.net

## Ideas backlog (not started)
- Contact form via Pages Function (currently mailto only).
- Google Search Console verify + submit sitemap once on real domain.
- OG image already at `/assets/img/og.png`.

## Log
- 2026-10-02: site designed + built, repo created, pushed.
- 2026-10-03: Cloudflare zone, Pages project, DNS CNAMEs, Zoho removed, Email Routing rule. Discovered Wix NS lock. Handover written.
