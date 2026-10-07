# CAMBYTE — Website handover (last updated 2026-10-03, 01:30)

Cambyte = Roberto's IT company (sole trader; app development, IT support, AI consulting; Cambridge UK).
Site = cambyte.co.uk. Read this file first before touching anything.

## Where things are
| Thing | Location |
|---|---|
| Site source | `~/Desktop/DEVELOPER FOLDER/cambyte-site` → GitHub `Synckser/cambyte-site` (branch `main`) |
| Design spec | `cambyte-site/docs/2026-10-02-cambyte-site-design.md` |
| **LIVE SITE** | **https://cambyte.co.uk** — GitHub Pages (repo Settings → Pages, branch main, root, CNAME file). Auto-deploys on push. |
| Spare mirror | https://cambyte-site.pages.dev (Cloudflare Pages, also auto-deploys) |
| Cloudflare account | Bob.pires@hotmail.co.uk, account id `0df8ea9a20396b69f6bf6eb56162293f` |
| Cloudflare zone | cambyte.co.uk — PENDING, **not in use**. Wix forbids NS change and Cloudflare Registrar needs NS first → parked. |
| Domain registrar | **Wix**, account bob.pires@hotmail.co.uk (NOT the Apple-relay Wix login). Renews 3 Apr 2027. |
| Contact email | hello@cambyte.co.uk → ForwardEmail.net (free, DNS-only) → piresbobrob@gmail.com. MX mx1/mx2.forwardemail.net (50/60), TXT `forward-email=hello:piresbobrob@gmail.com`, SPF `v=spf1 include:spf.forwardemail.net ~all`. Set 2026-10-03 by Roberto. |

## Site facts
- **`/apps/` (added 2026-10-07)**: standalone app-development landing page — pricing (Starter £1,500 / Business £3,500 / Custom £7,500, add-ons, Care plans £49/£149/£299), Draw & Learn try-it block with QR (`assets/img/dl-qr.svg`, App Store link `?ct=cambyte-apps`), FAQ. Own header, no main nav; page-only CSS inline in `apps/index.html`. Homepage App card links to it. Change prices there only.
- HTTPS cert was stuck at `authorization_created` since 3 Oct; custom domain removed + re-added via API on 2026-10-07 to retrigger. Check: `gh api repos/Synckser/cambyte-site/pages --jq '{https_enforced,cert:.https_certificate.state}'`; once `approved`, set `https_enforced=true`.
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

## CURRENT HOSTING (decided 2026-10-03): GitHub Pages + Wix DNS
Wix DNS (authoritative, ns2/ns3.wixdns.net) now has:
- A @ → 185.199.108.153 / 185.199.109.153 / 185.199.110.153 / 185.199.111.153 (GitHub Pages)
- CNAME www → synckser.github.io (GitHub redirects www → apex)
- CNAME bob → bob-ai-jehc.onrender.com (untouched, Render app)
- MX mx1.forwardemail.net 50 / mx2.forwardemail.net 60; TXT forward-email + SPF (ForwardEmail). Zoho verification + DKIM TXT left (harmless).
GitHub Pages: enabled via API, custom domain cambyte.co.uk, status built. HTTPS: cert provisioning; a watcher script sets `https_enforced=true` once issued. Verify: `gh api repos/Synckser/cambyte-site/pages --jq '{status,https_enforced,cert:.https_certificate.state}'`.
Note `_headers` file is Cloudflare-only; GitHub Pages ignores it (harmless). `.nojekyll` present so Pages serves files verbatim. Setting the custom domain via API makes GitHub commit `CNAME` to the repo — `git pull --rebase` before pushing if you see a rejected push.
Testing tip: a Mac may cache the old Wix IP (34.58.143.4, nginx: 200 on `/`, 404 elsewhere) for up to 1 h; test with `curl --resolve cambyte.co.uk:80:185.199.108.153 http://cambyte.co.uk/<path>`.

## Email — DONE 2026-10-03 (Roberto clicked; Claude is permission-blocked on MX/TXT edits)
Wix → Manage DNS Records → MX section → **Manage mailbox** → provider "Other":
- Replace rows with: `mx1.forwardemail.net` priority 10, `mx2.forwardemail.net` priority 20 (delete mx3 row). Save.
TXT section → delete `v=spf1 include:zohomail.eu ~all` + zoho-verification + zmail._domainkey; add two TXT at host `cambyte.co.uk`:
- `forward-email=hello:piresbobrob@gmail.com`
- `v=spf1 include:spf.forwardemail.net ~all`
Then test: send mail to hello@cambyte.co.uk → lands in Gmail. (ForwardEmail free tier needs no account; alias defined purely in DNS.)

## HISTORY — Wix forbids nameserver changes (why Cloudflare is parked)
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
- 2026-10-03 01:35: email records set (ForwardEmail). Test mail sent to hello@ → ForwardEmail confirmed delivery (self-send notice in Gmail). Email WORKING.
- 2026-10-03 01:45: all paths verified 200 via GitHub IP; .nojekyll added; HTTPS cert still provisioning (watcher running).
- 2026-10-03 01:30: switched to GitHub Pages + Wix DNS. A/CNAME records set in Wix (Claude via Chrome; MX edits blocked by permission classifier). cambyte.co.uk serving over HTTP; HTTPS pending cert.
- 2026-10-02: site designed + built, repo created, pushed.
- 2026-10-03: Cloudflare zone, Pages project, DNS CNAMEs, Zoho removed, Email Routing rule. Discovered Wix NS lock. Handover written.
