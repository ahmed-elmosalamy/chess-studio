import {
  AiError,
  type AiExplainRequest,
  type AiExplainResponse,
  type AiModel,
  type AiRawPage,
  type AiRequest,
  type AiResponse,
  type AiSettings
} from '../../shared/ai.ts'
import { isKeyless, presetFor, sendsReasoningField } from '../../shared/aiProviders.ts'

export type AiFetchDeps = { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void> }

export const STRUCTURE_MARKER = 'STRUCTURE-READ'
export const DETAIL_MARKER = 'DETAIL-READ'
export const DIAGRAM_MARKER = 'DIAGRAM-READ'

const SYSTEM_PROMPT =
  'You are a chess-book transcription engine. You read scanned pages and return strict JSON. Output exactly one JSON object and nothing else: no markdown, no code fences, no commentary. Transcribe only what is printed; never invent, translate, or correct content.'

const EXPLAIN_SYSTEM_PROMPT =
  'You are a chess coach explaining one mistake to a club player. Answer in one or two short sentences of plain text, no markdown and no lists. Use only the engine facts given; never invent a different best move or evaluation.'

const BRILLIANT_SYSTEM_PROMPT =
  'You are a chess coach explaining why one strong move works to a club player. Answer in one or two short sentences of plain text, no markdown and no lists. Use only the engine facts given; never invent a different move or evaluation.'

const BACKOFF_MS = [2000, 8000, 20000]
const ATTEMPTS = BACKOFF_MS.length + 1
const TIMEOUT_MS = 120_000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const prompt = (kind: AiRequest['kind'], pages: number[]): string => {
  if (kind === 'structure') {
    return `${STRUCTURE_MARKER}
Task: index the chapter headings and example captions printed on pages ${pages.join(', ')} of a scanned chess book.
Each image below is prefixed "Page N:". Attribute every item to the page where it is actually printed.
Return exactly one JSON object, no fences, no prose:
{"pages":[{"page":N,"chapters":[{"title":"...","level":1}],"examples":[{"label":"..."}]}]}
- chapters: only headings printed on that page. title = exact printed words, no translation or correction. level 1 = chapter, level 2 = sub-section.
- examples: only example/game captions printed on that page. label = exact printed words.
- Every requested page appears once, in order. A page with no heading and no caption: "chapters":[],"examples":[].
- Output compact JSON. No extra fields, no commentary, no markdown.`
  }
  if (kind === 'diagram') {
    return `${DIAGRAM_MARKER}
Task: transcribe the single chess diagram on page ${pages[0]} into a FEN. The image is cropped to the board and enlarged; white is at the bottom.
Return exactly one JSON object, no fences, no prose:
{"pages":[{"page":${pages[0]},"blocks":[{"kind":"diagram","fen":"<placement> <side>"}]}]}
FEN = piece placement + side to move only:
- Rank 8 down to rank 1, file a to h. White uppercase KQRBNP, black lowercase kqrbnp. Consecutive empty squares = one digit 1-8. "/" between ranks. Then a space and "w" or "b".
- Eight ranks, each rank summing to exactly eight squares.
- Example: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w
No commentary, no other fields. Output compact JSON.`
  }
  return `${DETAIL_MARKER}
Task: transcribe pages ${pages.join(', ')} of a scanned chess book into structured blocks.
Each image below is prefixed "Page N:". Attribute every block to the page where it is printed. Read every diagram with White at the bottom.
Return exactly one JSON object, no fences, no prose:
{"pages":[{"page":N,"blocks":[{"kind":"prose","text":"..."}]}]}
Block kinds — use exactly the fields shown for each:
- heading: {"kind":"heading","text":"<exact title>","level":1}   (level 1 = chapter, 2 = sub-section)
- prose:   {"kind":"prose","text":"<verbatim>"}   copy exactly as printed, keep typos, never summarise/correct/translate.
- moves:   {"kind":"moves","moves":["21...e5","22.Re1"]}   one block per move list; each half-move in SAN, black written "...", keep the printed move number.
- diagram: {"kind":"diagram","fen":"<placement> <side>","caption":"<exact caption, or empty>","box":[0.15,0.3,0.62,0.77]}   one block per board diagram. box = the printed board's edges as fractions of the page: left, top, right, bottom (0..1).
FEN = piece placement + side to move only:
- Rank 8 down to rank 1, file a to h. White uppercase KQRBNP, black lowercase kqrbnp. Consecutive empty squares = one digit 1-8. "/" between ranks. Then a space and "w" or "b" (side to move from the caption/turn marker; default "w" if unmarked).
- Example: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w
Rules:
- Blocks in reading order. Every requested page appears once, in order. A page with nothing readable: "blocks":[].
- box must tightly frame the printed board, edges just outside the squares.
- Only the fields shown for each kind. No null fields, no extra fields, no commentary, no markdown. Output compact JSON.`
}

function parseContent(text: string): unknown {
  const body = text.trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AiError('bad-response', 'Model answered without JSON')
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown
  } catch {
    throw new AiError('bad-response', 'Model answered with unreadable JSON')
  }
}

function toPages(value: unknown, requested: number[]): AiRawPage[] {
  const pages = (value as { pages?: unknown })?.pages
  if (!Array.isArray(pages)) throw new AiError('bad-response', 'Model answer holds no pages array')
  const wanted = new Set(requested)
  const clean: AiRawPage[] = []
  for (const entry of pages) {
    const page = (entry as AiRawPage)?.page
    if (typeof page !== 'number' || !Number.isInteger(page) || !wanted.has(page)) continue
    clean.push({ ...entry, page })
  }
  if (clean.length === 0) throw new AiError('bad-response', 'Model answer holds none of the requested pages')
  return clean
}

/** Best-effort server explanation from an error body; providers shape it as {error:{message}} or {message}. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim()
    if (!text) return ''
    let message = text
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown }
      const inner = typeof parsed.error === 'object' && parsed.error !== null ? parsed.error.message : parsed.error
      if (typeof inner === 'string' && inner.trim()) message = inner
      else if (typeof parsed.message === 'string' && parsed.message.trim()) message = parsed.message
    } catch {
      // plain-text error body
    }
    return ` ${message.replace(/\s+/g, ' ').slice(0, 200)}`
  } catch {
    return ''
  }
}

async function call(path: string, body: unknown, settings: AiSettings, key: string, deps: AiFetchDeps): Promise<unknown> {
  const label = presetFor(settings.provider).label
  const keyless = isKeyless(settings)
  if (!keyless && !key.trim()) throw new AiError('no-key', `Add a key for ${label} in Settings.`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await deps.fetchImpl(`${settings.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(key.trim() ? { Authorization: `Bearer ${key.trim()}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    })
    if (response.status === 401 || response.status === 403) throw new AiError('unauthorized', `${label} rejected the key (${response.status}).${await errorDetail(response)}`)
    if (response.status === 429) throw new AiError('quota', `${label} quota is full for now.${await errorDetail(response)}`)
    if (!response.ok) {
      const detail = await errorDetail(response)
      // 4xx means the model/endpoint/request is wrong, not the network: pause honestly instead of
      // retrying a retired model or masking a capability mismatch as "no network".
      if (response.status === 404) throw new AiError('no-model', `${label} could not find that model or endpoint (404).${detail} Check the model id and base URL in Settings.`)
      if (response.status < 500) throw new AiError('no-model', `${label} rejected the request (${response.status}).${detail} Try another vision model in Settings.`)
      throw new AiError('offline', `${label} returned ${response.status}.${detail}`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof AiError) throw error
    if ((error as Error)?.name === 'AbortError') throw new AiError('offline', `${label} did not answer in time.`)
    throw new AiError('offline', `Could not reach ${label}: ${(error as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

async function withRetry<T>(attempt: () => Promise<T>, deps: AiFetchDeps): Promise<T> {
  let lastError: AiError | null = null
  let quotaCooled = false
  for (let index = 0; index < ATTEMPTS; index += 1) {
    try {
      return await attempt()
    } catch (error) {
      const aiError = error instanceof AiError ? error : new AiError('offline', String((error as Error)?.message ?? error))
      if (aiError.kind === 'no-key' || aiError.kind === 'no-model' || aiError.kind === 'unauthorized') throw aiError
      if (aiError.kind === 'bad-response' && index >= 1) throw aiError
      // Daily caps do not heal in seconds; one cooldown catches per-minute limits without burning quota.
      if (aiError.kind === 'quota') {
        if (quotaCooled) throw aiError
        quotaCooled = true
        await deps.sleep(30_000)
        continue
      }
      lastError = aiError
      if (index < ATTEMPTS - 1) await deps.sleep(BACKOFF_MS[index])
    }
  }
  throw lastError ?? new AiError('offline', 'AI request failed')
}

const defaultDeps: AiFetchDeps = { fetchImpl: fetch, sleep }

export async function readPages(request: AiRequest, settings: AiSettings, key: string, deps: AiFetchDeps = defaultDeps): Promise<AiResponse> {
  if (!settings.model.trim()) throw new AiError('no-model', 'Choose a model in Settings.')
  if (request.images.length === 0) throw new AiError('bad-response', 'No pages to read')
  const pages = request.images.map((image) => image.page)
  const started = Date.now()
  const answer = await withRetry(async () => {
    const body = {
      model: settings.model,
      response_format: { type: 'json_object' },
      // A reasoning model spends the whole cap thinking and answers null, so reasoning is turned off.
      // Only OpenRouter accepts the field; strict providers reject unknown body fields.
      ...(sendsReasoningField(settings) ? { reasoning: { enabled: false } } : {}),
      max_tokens:
        request.kind === 'structure'
          ? Math.min(4000, Math.max(2000, 400 * request.images.length))
          : request.kind === 'diagram'
            ? Math.min(2000, Math.max(800, 200 * request.images.length))
            : Math.min(16000, Math.max(8000, 4000 * request.images.length)),
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt(request.kind, pages) },
            ...request.images.flatMap((image) => [
              { type: 'text', text: `Page ${image.page}:` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.jpeg}` } }
            ])
          ]
        }
      ]
    }
    const raw = (await call('/chat/completions', body, settings, key, deps)) as { choices?: { finish_reason?: unknown; message?: { content?: unknown } }[]; usage?: { total_tokens?: number } }
    const choice = raw?.choices?.[0]
    const content = choice?.message?.content
    if (typeof content !== 'string') {
      throw new AiError(
        'bad-response',
        choice?.finish_reason === 'length' ? 'Model ran out of tokens before it answered' : 'Model answer is empty'
      )
    }
    return { pages: toPages(parseContent(content), pages), tokens: raw?.usage?.total_tokens ?? 0 }
  }, deps)
  return { pages: answer.pages, model: settings.model, ms: Date.now() - started, tokens: answer.tokens }
}

export async function explain(
  request: AiExplainRequest,
  settings: AiSettings,
  key: string,
  deps: AiFetchDeps = defaultDeps
): Promise<AiExplainResponse> {
  if (!settings.model.trim()) throw new AiError('no-model', 'Choose a model in Settings.')
  const brilliant = request.kind === 'brilliant'
  const system = brilliant ? BRILLIANT_SYSTEM_PROMPT : EXPLAIN_SYSTEM_PROMPT
  const played = `${request.playedSan} was played.`
  const userText = brilliant
    ? [
        `Position (FEN): ${request.fen}`,
        `${played}${request.bestSan === request.playedSan ? " It is the engine's top move." : ''}`,
        `The evaluation goes from ${request.beforeLabel} to ${request.afterLabel} even though ${request.playedSan} gives up material.`,
        `Explain why ${request.playedSan} is strong and what it achieves.`
      ].join('\n')
    : [
        `Position (FEN): ${request.fen}`,
        `${played} ${request.bestSan ? `The engine's best move was ${request.bestSan}.` : 'The engine had a better move.'}`,
        `The evaluation went from ${request.beforeLabel} to ${request.afterLabel}, losing ${(Math.max(0, request.loss) / 100).toFixed(1)} pawns.`,
        `Explain why ${request.playedSan} is bad and what ${request.bestSan ?? 'a better move'} achieves.`
      ].join('\n')
  const started = Date.now()
  const answer = await withRetry(async () => {
    const body = {
      model: settings.model,
      // A reasoning model spends the whole cap thinking and answers null, so reasoning is turned off.
      ...(sendsReasoningField(settings) ? { reasoning: { enabled: false } } : {}),
      max_tokens: 200,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: userText
        }
      ]
    }
    const raw = (await call('/chat/completions', body, settings, key, deps)) as {
      choices?: { finish_reason?: unknown; message?: { content?: unknown } }[]
      usage?: { total_tokens?: number }
    }
    const choice = raw?.choices?.[0]
    const content = choice?.message?.content
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) {
      throw new AiError(
        'bad-response',
        choice?.finish_reason === 'length' ? 'Model ran out of tokens before it answered' : 'Model answer is empty'
      )
    }
    return { text, tokens: raw?.usage?.total_tokens ?? 0 }
  }, deps)
  return { text: answer.text, model: settings.model, ms: Date.now() - started, tokens: answer.tokens }
}

export async function listModels(settings: AiSettings, key: string, deps: AiFetchDeps = defaultDeps): Promise<AiModel[]> {
  const preset = presetFor(settings.provider)
  const freeByDefault = preset.id === 'groq' || preset.id === 'gemini' || preset.id === 'nvidia' || preset.id === 'ollama'
  const defaultEntry: AiModel = {
    id: preset.defaultModel,
    label: preset.defaultModel,
    free: freeByDefault,
    vision: preset.visionPattern ? new RegExp(preset.visionPattern).test(preset.defaultModel) : false
  }
  let raw: unknown
  try {
    raw = await withRetry(() => call('/models', undefined, settings, key, deps), deps)
  } catch (error) {
    // Test connection must still leave a usable model when /models is down or shaped differently.
    if (preset.defaultModel) return [defaultEntry]
    throw error
  }
  const models: AiModel[] = []
  for (const entry of Array.isArray((raw as { data?: unknown[] })?.data) ? (raw as { data: unknown[] }).data : []) {
    const item = entry as { id?: unknown; name?: unknown; architecture?: { input_modalities?: unknown }; pricing?: { prompt?: unknown; completion?: unknown } }
    if (typeof item.id !== 'string') continue
    const modalities = Array.isArray(item.architecture?.input_modalities) ? (item.architecture.input_modalities as unknown[]) : []
    const hasPricing = item.pricing !== undefined && item.pricing !== null
    const price = [item.pricing?.prompt, item.pricing?.completion].map((value) => Number(value ?? 0))
    models.push({
      id: item.id,
      label: typeof item.name === 'string' && item.name ? item.name : item.id,
      free: hasPricing ? price.every((value) => Number.isFinite(value) && value === 0) : freeByDefault,
      vision: modalities.length > 0 ? modalities.includes('image') : preset.visionPattern ? new RegExp(preset.visionPattern).test(item.id) : false
    })
  }
  if (preset.defaultModel && !models.some((model) => model.id === preset.defaultModel)) models.push(defaultEntry)
  const rank = (model: AiModel): number => (model.vision && model.free ? 0 : model.vision ? 1 : 2)
  return models.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}
