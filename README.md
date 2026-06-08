# LLMTaskOrchestrator

A small, dependency-free demo project for visualizing how a coordinator delegates work to
multiple tasks and tracks their progress.

## Demo

Open `/tmp/workspace/seanlconnelly-1430/LLMTaskOrchestrator/index.html` in a browser to view
the interactive task orchestration demo.

The demo shows:

- the coordinator's current state
- task dependencies and status transitions
- messages exchanged between the coordinator and tasks
- a live event log of the orchestration flow

## Local usage

You can open the file directly in a browser, or serve the repository locally:

```bash
cd /tmp/workspace/seanlconnelly-1430/LLMTaskOrchestrator
python3 -m http.server 8000
```

Then visit `http://localhost:8000/index.html`.
