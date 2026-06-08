'use client'

import { useState, useEffect } from 'react'
import { Task, TaskResult, CoordinatorConfig, MODELS } from '@/lib/types'

const DEFAULT_TASKS: Task[] = [
  {
    id: '1',
    name: 'Market Analysis',
    description: 'Analyze the market opportunity and competitive landscape',
    systemPrompt: 'You are a market research analyst. Provide concise, data-driven insights.',
    userPrompt:
      'Analyze the current market opportunity for AI-powered productivity tools for software developers. Focus on market size, growth trends, and key competitors.',
    model: 'claude-sonnet-4-6',
    effort: 'medium',
  },
  {
    id: '2',
    name: 'Technical Feasibility',
    description: 'Assess technical requirements and implementation challenges',
    systemPrompt: 'You are a senior software architect. Provide technical depth and practical considerations.',
    userPrompt:
      'What are the key technical challenges and requirements for building an AI-powered developer productivity tool? Consider infrastructure, latency, accuracy, and integration concerns.',
    model: 'claude-sonnet-4-6',
    effort: 'medium',
  },
]

const DEFAULT_COORDINATOR: CoordinatorConfig = {
  model: 'claude-opus-4-8',
  effort: 'high',
  systemPrompt:
    'You are a strategic synthesis expert. Integrate the following task outputs into a unified, actionable analysis. Highlight key insights, identify connections between findings, and provide clear recommendations.',
}

type RunPhase = 'idle' | 'tasks' | 'coordinator' | 'done'

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS)
  const [coordinator, setCoordinator] = useState<CoordinatorConfig>(DEFAULT_COORDINATOR)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isNewTask, setIsNewTask] = useState(false)
  const [runPhase, setRunPhase] = useState<RunPhase>('idle')
  const [taskResults, setTaskResults] = useState<Record<string, TaskResult>>({})
  const [coordinatorResult, setCoordinatorResult] = useState<{
    status: TaskResult['status']
    content: string
  }>({ status: 'idle', content: '' })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tasks')
      if (saved) setTasks(JSON.parse(saved))
      const savedCoord = localStorage.getItem('coordinator')
      if (savedCoord) setCoordinator(JSON.parse(savedCoord))
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem('coordinator', JSON.stringify(coordinator))
  }, [coordinator])

  function openNewTask() {
    setIsNewTask(true)
    setEditingTask({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      systemPrompt: '',
      userPrompt: '',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
    })
  }

  function openEditTask(task: Task) {
    setIsNewTask(false)
    setEditingTask({ ...task })
  }

  function saveTask(task: Task) {
    if (isNewTask) {
      setTasks((prev) => [...prev, task])
    } else {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
    setEditingTask(null)
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setTaskResults((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function streamResponse(
    url: string,
    body: Record<string, unknown>,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let content = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      content += chunk
      onChunk(chunk)
    }

    const tail = decoder.decode()
    if (tail) {
      content += tail
      onChunk(tail)
    }

    return content
  }

  async function runAll() {
    if (tasks.length === 0) return

    setRunPhase('tasks')
    setCoordinatorResult({ status: 'idle', content: '' })

    const initResults: Record<string, TaskResult> = {}
    tasks.forEach((t) => {
      initResults[t.id] = { status: 'running', content: '' }
    })
    setTaskResults(initResults)

    const taskOutputs: Record<string, string> = {}

    await Promise.all(
      tasks.map(async (task) => {
        try {
          const content = await streamResponse(
            '/api/task',
            {
              systemPrompt: task.systemPrompt,
              userPrompt: task.userPrompt,
              model: task.model,
              effort: task.effort,
            },
            (chunk) => {
              setTaskResults((prev) => ({
                ...prev,
                [task.id]: {
                  status: 'running',
                  content: (prev[task.id]?.content ?? '') + chunk,
                },
              }))
            }
          )
          taskOutputs[task.id] = content
          setTaskResults((prev) => ({
            ...prev,
            [task.id]: { status: 'done', content },
          }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed'
          const errorContent = `Error: ${msg}`
          setTaskResults((prev) => ({
            ...prev,
            [task.id]: { status: 'error', content: errorContent },
          }))
          taskOutputs[task.id] = `[Task failed: ${msg}]`
        }
      })
    )

    setRunPhase('coordinator')
    setCoordinatorResult({ status: 'running', content: '' })

    const coordinatorInput = tasks
      .map((task) => `## ${task.name}\n**Description:** ${task.description}\n\n${taskOutputs[task.id] ?? '[No output]'}`)
      .join('\n\n---\n\n')

    try {
      const content = await streamResponse(
        '/api/coordinator',
        {
          systemPrompt: coordinator.systemPrompt,
          userPrompt: coordinatorInput,
          model: coordinator.model,
          effort: coordinator.effort,
        },
        (chunk) => {
          setCoordinatorResult((prev) => ({ ...prev, content: prev.content + chunk }))
        }
      )
      setCoordinatorResult({ status: 'done', content })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setCoordinatorResult({ status: 'error', content: `Error: ${msg}` })
    }

    setRunPhase('done')
  }

  const isRunning = runPhase === 'tasks' || runPhase === 'coordinator'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">LLM Task Orchestrator</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Define parallel tasks · Synthesize with a coordinator
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Tasks</h2>
            <button
              onClick={openNewTask}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded-md transition-colors font-medium"
            >
              + Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center text-zinc-500 text-sm">
              No tasks yet. Add a task to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  result={taskResults[task.id]}
                  onEdit={() => openEditTask(task)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Coordinator */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mb-4">
            Coordinator
          </h2>
          <CoordinatorPanel
            config={coordinator}
            result={coordinatorResult}
            onChange={setCoordinator}
          />
        </section>

        {/* Run */}
        <div className="flex items-center gap-4 pb-8">
          <button
            onClick={runAll}
            disabled={tasks.length === 0 || isRunning}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
          >
            {runPhase === 'tasks' && (
              <>
                <Spinner className="text-blue-300" />
                Running tasks…
              </>
            )}
            {runPhase === 'coordinator' && (
              <>
                <Spinner className="text-blue-300" />
                Synthesizing…
              </>
            )}
            {(runPhase === 'idle' || runPhase === 'done') && <>▶ Run All</>}
          </button>
          {runPhase === 'done' && (
            <span className="text-green-400 text-sm font-medium">✓ Complete</span>
          )}
          {tasks.length === 0 && (
            <span className="text-zinc-500 text-sm">Add at least one task to run</span>
          )}
        </div>
      </main>

      {editingTask && (
        <TaskEditorModal
          task={editingTask}
          isNew={isNewTask}
          onChange={setEditingTask}
          onSave={saveTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  )
}

// ── TaskCard ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  result,
  onEdit,
  onDelete,
}: {
  task: Task
  result?: TaskResult
  onEdit: () => void
  onDelete: () => void
}) {
  const modelDef = MODELS.find((m) => m.id === task.model)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{task.name || 'Unnamed Task'}</p>
          {task.description && (
            <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
              {modelDef?.name ?? task.model}
            </span>
            {modelDef && modelDef.efforts.length > 0 && (
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                {task.effort}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {result ? (
            <>
              {result.status === 'running' && <Spinner className="text-blue-400" />}
              {result.status === 'done' && (
                <span className="text-green-400 text-sm font-medium">✓</span>
              )}
              {result.status === 'error' && (
                <span className="text-red-400 text-sm font-medium">✗</span>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                title="Edit"
                className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <PencilIcon />
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </div>

      {result && result.content && (
        <div className="border-t border-zinc-800 px-4 py-3 overflow-y-auto max-h-60 bg-zinc-950/50">
          <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
            {result.content}
            {result.status === 'running' && (
              <span className="inline-block w-1.5 h-3.5 bg-zinc-400 ml-0.5 align-middle animate-pulse" />
            )}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── CoordinatorPanel ─────────────────────────────────────────────────────────

function CoordinatorPanel({
  config,
  result,
  onChange,
}: {
  config: CoordinatorConfig
  result: { status: TaskResult['status']; content: string }
  onChange: (c: CoordinatorConfig) => void
}) {
  const modelDef = MODELS.find((m) => m.id === config.model)
  const supportsEffort = (modelDef?.efforts.length ?? 0) > 0
  const effortOptions = modelDef?.efforts ?? []

  function handleModelChange(model: CoordinatorConfig['model']) {
    const newModelDef = MODELS.find((m) => m.id === model)
    const validEfforts = newModelDef?.efforts ?? []
    const newEffort = validEfforts.includes(config.effort) ? config.effort : (validEfforts[2] as CoordinatorConfig['effort']) ?? 'medium'
    onChange({ ...config, model, effort: newEffort })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">System Prompt</label>
          <textarea
            value={config.systemPrompt}
            onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
            rows={3}
            placeholder="How should the coordinator synthesize the task outputs?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
            <select
              value={config.model}
              onChange={(e) => handleModelChange(e.target.value as CoordinatorConfig['model'])}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {supportsEffort && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Effort</label>
              <select
                value={config.effort}
                onChange={(e) => onChange({ ...config, effort: e.target.value as CoordinatorConfig['effort'] })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                {effortOptions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {result.status !== 'idle' && (
        <div className="border-t border-zinc-800">
          <div className="px-4 py-2.5 flex items-center gap-2 bg-zinc-950/30 border-b border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Synthesis
            </span>
            {result.status === 'running' && <Spinner className="text-blue-400" />}
            {result.status === 'done' && (
              <span className="text-green-400 text-xs font-medium">✓ Complete</span>
            )}
            {result.status === 'error' && (
              <span className="text-red-400 text-xs font-medium">✗ Error</span>
            )}
            {result.status === 'done' && (
              <button
                onClick={() => downloadMarkdown(result.content)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                <DownloadIcon />
                Save as Markdown
              </button>
            )}
          </div>
          <div className="p-4 overflow-y-auto max-h-96 bg-zinc-950/50">
            <pre className="text-sm text-zinc-200 font-mono whitespace-pre-wrap leading-relaxed">
              {result.content}
              {result.status === 'running' && (
                <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 align-middle animate-pulse" />
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TaskEditorModal ───────────────────────────────────────────────────────────

function TaskEditorModal({
  task,
  isNew,
  onChange,
  onSave,
  onClose,
}: {
  task: Task
  isNew: boolean
  onChange: (t: Task) => void
  onSave: (t: Task) => void
  onClose: () => void
}) {
  const modelDef = MODELS.find((m) => m.id === task.model)
  const supportsEffort = (modelDef?.efforts.length ?? 0) > 0
  const effortOptions = modelDef?.efforts ?? []

  function handleModelChange(model: Task['model']) {
    const newModelDef = MODELS.find((m) => m.id === model)
    const validEfforts = newModelDef?.efforts ?? []
    const newEffort = validEfforts.includes(task.effort) ? task.effort : (validEfforts[2] ?? 'medium') as Task['effort']
    onChange({ ...task, model, effort: newEffort })
  }

  const canSave = task.name.trim() && task.userPrompt.trim()

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold text-base">{isNew ? 'New Task' : 'Edit Task'}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={task.name}
                onChange={(e) => onChange({ ...task, name: e.target.value })}
                placeholder="e.g. Market Analysis"
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description</label>
              <input
                type="text"
                value={task.description}
                onChange={(e) => onChange({ ...task, description: e.target.value })}
                placeholder="Short description"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">System Prompt</label>
            <textarea
              value={task.systemPrompt}
              onChange={(e) => onChange({ ...task, systemPrompt: e.target.value })}
              rows={3}
              placeholder="Define the model's role and behavior..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              User Prompt <span className="text-red-400">*</span>
            </label>
            <textarea
              value={task.userPrompt}
              onChange={(e) => onChange({ ...task, userPrompt: e.target.value })}
              rows={4}
              placeholder="The task instruction sent to the model..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
              <select
                value={task.model}
                onChange={(e) => handleModelChange(e.target.value as Task['model'])}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {supportsEffort && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Effort</label>
                <select
                  value={task.effort}
                  onChange={(e) => onChange({ ...task, effort: e.target.value as Task['effort'] })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  {effortOptions.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(task)}
            disabled={!canSave}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
          >
            {isNew ? 'Add Task' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Icons & utilities ─────────────────────────────────────────────────────────

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function downloadMarkdown(content: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `synthesis-${timestamp}.md`
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
