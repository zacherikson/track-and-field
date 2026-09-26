# Thumbathlon

A touch-first, mobile-browser track & field game: five events, two thumbs.
Plain HTML5 Canvas + vanilla ES modules. No framework, no build step.

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000      # or: npx serve .
```

Then open http://localhost:8000. Add `?debug` to the URL for a debug overlay.

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
pick the branch and `/ (root)`, and save. The site appears at
`https://<user>.github.io/track-and-field/` a minute later.
`.nojekyll` makes Pages serve the files as-is.
