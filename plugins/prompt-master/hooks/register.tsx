import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Status } from '../types'

const status = atom({ plugin: 'prompt-master', key: 'status' } as const, 'idle' as Status)
const original = atom({ plugin: 'prompt-master', key: 'original' } as const, null as string | null)

const SYSTEM = `You are Prompt Master. You turn a rough draft into a strong, ready-to-send prompt for an AI assistant (Claude). You never answer the draft, never talk to the user, and never ask the user anything: your only output is the improved prompt itself.

How to rewrite:
1. Work out the real goal behind the draft and state it plainly in the first sentence.
2. Make it actionable. Spell out what the assistant should do, step by step where that helps: what to investigate or gather first, what to produce, and what "done" looks like (e.g. a reproducing test that now passes, a measured before/after, a structured document with named sections).
3. Fill gaps with sensible defaults instead of questions. Where a detail is missing (stack, audience, format, scope), tell the assistant to find it out itself (read the code, check the config, measure) or to pick a reasonable default and state the assumption in its answer. Never insert placeholders like [company name] or <your stack>.
4. The assistant may ask the user at most one clarifying question, and only if the task truly cannot start without it. Prefer "proceed with a reasonable assumption and note it" every time.
5. Keep every fact, name, file path, code snippet and constraint the user gave. Do not invent facts about their situation; framing, structure and success criteria are yours to add.
6. Fix spelling and grammar. Write in the user's voice ("I need…", "Please…"), addressed to the assistant. Use short headings or bullets when the task has several parts. Be concise: a small fix needs about 80-150 words, a large open-ended task at most about 300. Cut generic advice the assistant would already follow.

Output ONLY the rewritten prompt: no preamble, no quotes, no commentary, no questions to the user.`

// `given` is text passed to /prompt-master; otherwise the draft in the prompt box.
type Outcome = { filled: true } | { filled: false; text?: string; error?: string }

async function rewrite($: Engine, given?: string): Promise<Outcome> {
  if ((await read($, status)) === 'working') return { filled: false, error: 'already rewriting' }
  const text = given ?? (await $.prompt.read()).text
  const draft = text.trim()
  if (!draft) {
    $.ui.toast('Prompt Master: type a rough prompt first')
    return { filled: false, error: 'nothing to rewrite' }
  }
  await update($, status, () => 'working')
  const r = await $.model.complete({
    model: 'sonnet',
    system: SYSTEM,
    prompt: `<draft>\n${draft}\n</draft>`,
    maxTokens: 2000,
    timeoutMs: 60000,
  })
  if (!r.isAnswered || !r.text.trim()) {
    await update($, status, () => 'idle')
    const error = `rewrite failed (${r.isAnswered ? 'empty reply' : r.reason})`
    $.ui.toast(`Prompt Master: ${error}`)
    return { filled: false, error }
  }
  // Don't clobber the box if the person kept typing while we worked.
  const now = await $.prompt.read()
  if (given === undefined && now.text.trim() !== draft) {
    await update($, status, () => 'idle')
    $.ui.toast('Prompt Master: draft changed while rewriting, left it as is')
    return { filled: false, error: 'draft changed while rewriting' }
  }
  const better = r.text.trim()
  const { isFilled } = await $.prompt.fill({ text: better, mode: 'replace' })
  if (!isFilled) {
    // No prompt box to fill (e.g. a client that draws no composer): hand the text back.
    await update($, status, () => 'idle')
    return { filled: false, text: better }
  }
  await update($, original, () => text)
  await update($, status, () => 'done')
  return { filled: true }
}

async function undo($: Engine) {
  const prev = await read($, original)
  if (prev === null) return
  await $.prompt.fill({ text: prev, mode: 'replace' })
  await update($, original, () => null)
  await update($, status, () => 'idle')
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-master',
      description: 'Rewrite a rough prompt into a better one: /prompt-master <rough prompt>',
    })
    return next(e)
  })

  on('command.run', { command: 'prompt-master' }, async ($, e, next) => {
    if (!e.args.trim()) {
      return { text: 'Usage: /prompt-master <rough prompt>, or type your draft and press ✨ Prompt Master above the prompt box.' }
    }
    const out = await rewrite($, e.args)
    if (out.filled) {
      return { text: 'Prompt Master: the rewritten prompt is in your prompt box. Review it, then send.', isTextDisplayOnly: true }
    }
    if (out.text) {
      return { text: `Prompt Master rewrite (copy it and send it as your next message):\n\n${out.text}`, isTextDisplayOnly: true }
    }
    return { text: `Prompt Master: ${out.error ?? 'nothing happened'}`, isTextDisplayOnly: true }
  })

  // Once the prompt is sent, forget the undo snapshot.
  // Never let this bookkeeping block a send.
  on('prompt.submit', async ($, e, next) => {
    await Promise.all([
      update($, original, () => null),
      update($, status, () => 'idle'),
    ]).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, status)
    const canUndo = (await read($, original)) !== null

    return (
      <Box flexDirection="row" gap={1}>
        <Button
          key="rewrite"
          label={s === 'working' ? '✨ Rewriting…' : '✨ Prompt Master'}
          onPress={() => void rewrite($)}
        />
        {canUndo ? <Button key="undo" label="↩ Undo" onPress={() => undo($)} /> : null}
        {s === 'done' ? <Text dimColor>Rewritten — review, then send</Text> : null}
      </Box>
    )
  })
}
