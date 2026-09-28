/**
 * dsh-bubble — host half.
 *
 * Registers one exact HTTP route (`/dsh-bubble/insult`) that answers a JSON
 * `{ok, text}` payload with a fresh LLM-varied grumble line in Chinese, a
 * variation of "敲！又让我干活了！". The browser half fetches this route when
 * it observes a new user message and renders the line as a floating bubble.
 * A canned fallback line is returned whenever the model call fails, so the
 * bubble keeps working without the LLM.
 *
 * The route is unauthenticated and bound to the webserver's configured host
 * (127.0.0.1 by default), matching the surface's localhost posture.
 *
 * The token budget is generous on purpose: the DeepSeek route runs with
 * thinking enabled, and the model spends most of its budget on reasoning
 * before emitting the one-line answer (measured ~230 reasoning tokens), so a
 * small cap truncates the output before any text appears.
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'

/** Cordis plugin name (matches the loader row id). */
export const name = 'bubble'

/** Required host services: the HTTP route registry and the LLM runtime. */
export const inject = ['webServer', 'llm']

/** Default LLM route, matching the base agent-default-model row. */
const PROVIDER = 'deepseek-official'
const MODEL = 'deepseek-v4-flash'

/** End-to-end deadline for one grumble request. */
const TIMEOUT_MS = 20000

/**
 * Output-token cap for one grumble. Thinking is disabled for this call (see
 * `purpose` below), so a tiny cap comfortably fits the one-line answer.
 */
const MAX_TOKENS = 120

/** Canned lines used when the model call fails or returns nothing. */
const FALLBACKS = Object.freeze([
  '敲！又让我干活了！',
  '得，又来活儿了……',
  '哼，又使唤我！',
  '行行行，我来干。',
])

/** Fixed instruction: one short playful Chinese complaint, a fresh variation of the idea. */
const SYSTEM = [
  'You are a grumpy but secretly eager coding assistant.',
  'The user just sent you a new message. Produce ONE short complaint line in Simplified Chinese,',
  'a fresh variation of the idea "敲！又让我干活了！" (roughly "Ugh! You are making me work again!").',
  'It should sound playful and a little dramatic, never mean or rude, and each time slightly different.',
  'Return ONLY the line itself. No quotes, no prefix, no emoji, no punctuation-heavy effects, under 30 characters.',
].join('\n')

/** Pick one canned fallback line at random. */
export function fallback() {
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
}

/**
 * Generate one grumble line through the configured LLM route. The call uses
 * the `session-title` purpose because the DeepSeek adapter maps that purpose
 * to thinking-off: the model answers immediately instead of burning the whole
 * token budget on reasoning before emitting the one-line reply (measured
 * ~230 reasoning tokens with thinking on).
 * @param ctx - plugin context carrying the llm service.
 * @returns the model line plus an optional diagnostic, or a canned fallback.
 */
export async function generateGrumble(ctx) {
  const timeout = deadline(new AbortController().signal, TIMEOUT_MS, 'BUBBLE_TIMEOUT')
  try {
    const messages = [createUserMessage({
      content: [{ type: 'text', text: 'A new message just arrived.' }],
      source: { kind: 'plugin', plugin: 'dsh-bubble' },
    })]
    const options = Object.freeze({
      provider: PROVIDER,
      model: MODEL,
      messages,
      system: SYSTEM,
      maxTokens: MAX_TOKENS,
      purpose: 'session-title',
      signal: timeout.signal,
    })
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
    const finish = assembler.finish
    const text = assembler.blocks()
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim()
    if (text.length > 0) return { text }
    if (finish.kind !== 'stop') {
      const detail = finish.kind === 'error' || finish.kind === 'aborted' ? finish.failure.message : ''
      return { text: fallback(), error: `finish=${finish.kind} ${detail}`.trim() }
    }
    return { text: fallback(), error: 'empty model output' }
  } catch (error) {
    return { text: fallback(), error: `thrown: ${String(error)}` }
  } finally {
    timeout[Symbol.dispose]()
  }
}

/**
 * Mount the route. The handler never throws to the client: a generation
 * failure still answers `{ok: true, text}` with a canned line, so the bubble
 * is always servable.
 * @param ctx - plugin context carrying webServer and llm.
 */
export function apply(ctx) {
  const disposeRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bubble/insult',
    handler: async (_req, res) => {
      try {
        const { text, error } = await generateGrumble(ctx)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, text, ...(error === undefined ? {} : { error }) }))
      } catch (error) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, text: fallback(), error: String(error) }))
      }
    },
  })
  ctx.effect(() => disposeRoute, 'bubble: route')
}