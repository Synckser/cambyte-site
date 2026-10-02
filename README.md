# cambyte.co.uk

Static site for Cambyte (apps, IT support, AI consulting — Cambridge, UK). No build step.

## Edit
Change `index.html` / `privacy/index.html`, commit, push `main`. Cloudflare Pages redeploys in ~1 min.

Preview: `python3 -m http.server 8765` then open http://localhost:8765/

## Hosting
- Cloudflare Pages project `cambyte-site`, custom domain `cambyte.co.uk` (+ `www`).
- Domain registered at Wix; nameservers point to Cloudflare.
- Email Routing: hello@cambyte.co.uk → piresbobrob@gmail.com.
- `_headers` sets security + cache headers (Pages reads it automatically).

## Design spec
`docs/2026-10-02-cambyte-site-design.md`
