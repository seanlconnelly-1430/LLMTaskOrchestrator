import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(request: Request) {
  const { systemPrompt, userPrompt, model, effort } = await request.json()

  const supportsEffort = ['claude-opus-4-8', 'claude-sonnet-4-6'].includes(model)

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any = {
          model,
          max_tokens: 8096,
          messages: [{ role: 'user', content: userPrompt }],
        }

        if (systemPrompt?.trim()) {
          params.system = systemPrompt.trim()
        }

        if (supportsEffort) {
          params.output_config = { effort }
        }

        const stream = client.messages.stream(params)

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(encoder.encode(`\n[Error: ${message}]`))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
