# scripts

- `r2-cors.mjs` — applies `infra/r2-cors.json` to the R2 bucket (`npm run r2:cors`).
- `e2e-r2.mjs` — stand-in for R2 in the end-to-end tests: single PUT and multipart (create, upload part, complete, abort), `GET /__state?contains=…` for what happened. File names containing `reject`, `vanish` or `slow` make it misbehave on purpose.
- Content pipeline (`prepare-book`, Telegram downloader, import) arrives with the content
  track (C1–C3 in the implementation plan).
