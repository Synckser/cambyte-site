# cambyte.co.uk

Static site for Cambyte (app development, AI consulting — Cambridge, UK). No build step.

## Edit
Change `index.html` / `apps/index.html` / `privacy/index.html`, commit, push `main`. **Live host is GitHub Pages** (custom domain cambyte.co.uk, Wix DNS A records) — redeploys in ~1 min. Cloudflare Pages below is a spare mirror only; see `HANDOVER.md`.

Preview: `python3 -m http.server 8765` then open http://localhost:8765/

## Hosting
- Cloudflare Pages project `cambyte-site` (Git integration, repo Synckser/cambyte-site, branch main, no build, output `/`). Preview URL: https://cambyte-site.pages.dev
- Cloudflare zone `cambyte.co.uk` (Free). DNS: CNAME @ → cambyte-site.pages.dev (proxied), CNAME www → cambyte-site.pages.dev (proxied). Old Zoho MX/TXT removed 2026-10-03.
- Domain registered at Wix (separate Wix account, not the Apple-relay one). Nameservers must be `harmony.ns.cloudflare.com` + `jarred.ns.cloudflare.com`.
- Email Routing: rule hello@cambyte.co.uk → piresbobrob@gmail.com created (active). MX/SPF/DKIM records add only once zone is active.
- `_headers` sets security + cache headers (Pages reads it automatically).

## Status (2026-10-03)
**Wix does not allow nameserver changes on Wix-registered domains** (no "Edit Name Servers" option exists). Only route to Cloudflare DNS = transfer the domain to Cloudflare Registrar:
1. Cloudflare → Domains → Transfers → add `cambyte.co.uk` (free for .uk, no year added). Needs a payment card on the Cloudflare account.
2. Wix → Domains → ⋯ → **Transfer away from Wix** → IPS tag `CLOUDFLARE` → Submit. Transfer completes within ~24 h; zone goes active automatically with its assigned nameservers.
Also re-add in Cloudflare DNS: `CNAME bob → bob-ai-jehc.onrender.com` (DNS only) — existed at Wix (Render app), Cloudflare's scan missed it.

Zone PENDING until that transfer completes. After that, two clicks in Cloudflare:
1. Workers & Pages → cambyte-site → Custom domains → add `cambyte.co.uk`, then `www.cambyte.co.uk` (CNAMEs already exist).
2. Email Routing → cambyte.co.uk → Settings → DNS records → **Add missing records**.
Then: SSL/TLS → Edge Certificates → Always Use HTTPS on; add Redirect Rule www → apex if wanted.

## Design spec
`docs/2026-10-02-cambyte-site-design.md`
