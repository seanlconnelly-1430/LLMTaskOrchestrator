# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**LLM Task Orchestrator** — A Next.js web app that lets users define multiple LLM tasks (each with its own system/user prompt and model config), run them in parallel with real-time streaming output, and synthesize the results through a coordinator model.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build (also runs TypeScript check)
npm run lint      # ESLint
```

## Environment

Copy `.env.local.example` to `.env.local` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Architecture

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · `@anthropic-ai/sdk`

**Key files**:
- `app/page.tsx` — All UI: task list, coordinator config, task editor modal, result cards (all in one `'use client'` file)
- `app/api/task/route.ts` — POST handler: streams a single task response using `client.messages.stream()`
- `app/api/coordinator/route.ts` — POST handler: streams the coordinator synthesis
- `lib/types.ts` — Shared types (`Task`, `TaskResult`, `CoordinatorConfig`) and the `MODELS` constant

**Run flow**:
1. All tasks fire in parallel via `Promise.all` — each streams text chunks into its own card in real time
2. After all tasks complete, the coordinator fires — it receives all task outputs formatted as markdown sections in its user prompt
3. The coordinator streams its synthesis into the panel below the config

**Streaming pattern** (both API routes):
```ts
const stream = client.messages.stream(params)
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    controller.enqueue(encoder.encode(event.delta.text))
  }
}
```

**Model / effort handling**:
- Opus 4.8: `output_config: { effort: low|medium|high|xhigh|max }`
- Sonnet 4.6: `output_config: { effort: low|medium|high }`
- Haiku 4.5: no `output_config` (not supported — passing it returns a 400)
- No `temperature` — removed from all modern Claude models

**Persistence**: Task definitions and coordinator config are saved to `localStorage`.
