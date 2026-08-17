# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js 20 ES-module application that turns photographed notes into organized PDFs.

- `servidor.js` starts the local HTTP server, serves the browser client, and exposes the API.
- `lib/` contains focused backend modules: Vision AI integration, PDF generation, and note storage.
- `web/` contains plain HTML, CSS, and browser-side JavaScript. Keep shared motion helpers in `web/mola.js`.
- `testes/teste.js` is the self-contained test suite; generated test artifacts belong in `testes/saida/`.
- `dados/` holds local runtime data and is intentionally ignored by Git.
- `.env.example` documents supported configuration. Never commit `.env`, API keys, generated PDFs, or `node_modules/`.

## Build, Test, and Development Commands

Install dependencies with Node.js 20 or newer:

```sh
npm install
cp .env.example .env   # then add one Vision API key
npm start
npm test
```

`npm start` runs `node servidor.js`; open `http://localhost:3000` unless `PORTA` is set. `npm test` runs the custom assertion-based suite without contacting paid APIs. There is no compilation step or separate linter configured.

## Coding Style & Naming Conventions

Use ES modules (`import`/`export`), two-space indentation, single quotes, semicolons, and trailing commas in multiline structures. Prefer small functions and Node built-ins over new dependencies. Follow the repository's Portuguese vocabulary: camelCase for variables/functions (`listarNotas`), UPPER_SNAKE_CASE for constants (`LIMITE_CORPO`), and lowercase descriptive filenames (`armazenamento.js`). Keep user-facing text and comments in Portuguese unless an existing interface requires otherwise.

## Testing Guidelines

Add tests to `testes/teste.js` using the local `teste('comportamento esperado', fn)` helper and strict `node:assert`. Test names should describe observable behavior in Portuguese. Cover success paths, malformed input, limits, and persistence cleanup. Tests must remain deterministic and must not require real provider credentials or paid network calls. Run `npm test` before every pull request.

## Commit & Pull Request Guidelines

History uses short, imperative summaries such as `Update README.md` and `New notes Mockup`. Keep each commit focused and use a concise subject that states the change. Pull requests should explain the user-visible outcome, list verification performed, link related issues, and include screenshots for changes under `web/`. Call out configuration changes and never include secrets or personal note data.
