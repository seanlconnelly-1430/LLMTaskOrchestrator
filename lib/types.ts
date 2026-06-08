export type Model = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Task {
  id: string
  name: string
  description: string
  systemPrompt: string
  userPrompt: string
  model: Model
  effort: Effort
}

export interface TaskResult {
  status: 'idle' | 'running' | 'done' | 'error'
  content: string
}

export interface CoordinatorConfig {
  model: Model
  effort: Effort
  systemPrompt: string
}

export const MODELS: { id: Model; name: string; efforts: Effort[] }[] = [
  {
    id: 'claude-opus-4-8',
    name: 'Opus 4.8',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    efforts: [],
  },
]
