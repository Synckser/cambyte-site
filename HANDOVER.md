# CAMBYTE — Website handover (last updated 2026-10-08, 00:42)

Cambyte = Roberto's company (sole trader; **app development + AI consulting ONLY**; Cambridge UK). IT support/setup was DROPPED from the business and the site on 2026-10-07 — do not add it back.

## HTTPS — DONE 2026-10-08 00:31
- Let's Encrypt cert issued by GitHub Pages at 00:30 (CN cambyte.co.uk, SAN www.cambyte.co.uk, valid to 2027-01-05; GitHub auto-renews). `https_enforced=true` set by the watcher at 00:30:53. `https://cambyte.co.uk` 200, `http://` → 301 → https, `https://www.` → 301 → apex.
- Timeline: cert stuck at `authorization_created` from 3 Oct; custom domain removed + re-added 7 Oct 23:41 (other session); approved 8 Oct 00:30 (~49 min later). DNS was never the problem.
- Watcher LaunchAgent `com.roberto.cambyte-https-watch` did its job and unloaded itself; plist deleted. Script kept at `~/.claude-cred-backups/cambyte-https-watch.sh` (log `.log`) in case this ever recurs — re-create the plist (StartInterval 120, RunAtLoad) and bootstrap it.
- Check any time: `gh api repos/Synckser/cambyte-site/pages --jq '{https_enforced,cert:.https_certificate.state}'`; DNS health: `gh api repos/Synckser/cambyte-site/pages/health` (first call may return `{}` = 202 in progress, retry).
- If HTTPS ever breaks again: remove + re-add the custom domain (Settings → Pages, or `gh api -X PUT repos/Synckser/cambyte-site/pages -f cname=` then `-f cname=cambyte.co.uk`), wait up to 1 h. Ruled-out list from 8 Oct: DNSSEC, CAA, AAAA, letsdebug.net preflight, domain conflict with other repos.

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
- Static HTML/CSS, no build. Files: `index.html`, `apps/index.html` (app-development landing + pricing, added 2026-10-07), `privacy/index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `_headers`, `assets/`.
- Hero has two big teal buttons (2026-10-08): **App Development** → `/apps/`, **AI Consulting** → `#ai-consulting` (id on the AI card). No dedicated AI page yet — natural next step is an `/ai/` landing page like `/apps/`, then repoint the button. CSS block "Hero: two big service buttons" in `assets/style.css`.
- Services section = 2 cards (App development, AI consulting). All "IT support / repair / laptop / network" copy removed 2026-10-07. Hero trust badge now "Google Cybersecurity certified"; About creds list only the Cybersecurity certificate (the Google IT Support certificate line was dropped on purpose — Roberto can re-add as a plain qualification if he wants).
- OG image `assets/img/og.png` regenerated 2026-10-07 from `docs/og-source.html` (open in headless Chrome at 1200×630: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1200,630 --screenshot=og.png docs/og-source.html`).
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
- 2026-10-08 00:42: hero service buttons live (commit 3f69533).
- 2026-10-08 00:31: HTTPS LIVE. Cert approved, enforcement on, redirects verified. Watcher unloaded, plist removed.
- 2026-10-08 00:05: IT support removed from site (commit 393876e, live). OG image regenerated. HTTPS cert still `authorization_created`; DNS health check all green; watcher LaunchAgent installed. Handover + memory updated.
- 2026-10-07 23:41–23:47 (other session): custom domain removed + re-added to retrigger cert; `/apps/` landing page with pricing added (commit f3ae69f).
- 2026-10-03 01:35: email records set (ForwardEmail). Test mail sent to hello@ → ForwardEmail confirmed delivery (self-send notice in Gmail). Email WORKING.
- 2026-10-03 01:45: all paths verified 200 via GitHub IP; .nojekyll added; HTTPS cert still provisioning (watcher running).
- 2026-10-03 01:30: switched to GitHub Pages + Wix DNS. A/CNAME records set in Wix (Claude via Chrome; MX edits blocked by permission classifier). cambyte.co.uk serving over HTTP; HTTPS pending cert.
- 2026-10-02: site designed + built, repo created, pushed.
- 2026-10-03: Cloudflare zone, Pages project, DNS CNAMEs, Zoho removed, Email Routing rule. Discovered Wix NS lock. Handover written.
