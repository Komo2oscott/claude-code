import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Status } from '../types'

const status = atom({ plugin: 'prompt-master', key: 'status' } as const, 'idle' as Status)
const original = atom({ plugin: 'prompt-master', key: 'original' } as const, null as string | null)

const SYSTEM = `You are Prompt Master, an expert prompt engineer. The user gives you a rough draft of a message they are about to send to an AI coding assistant (Claude). Rewrite it into a clearer, more effective prompt.

Rules:
- Keep the user's intent, scope, facts, names, file paths, code and constraints exactly. Never invent requirements, files or details they did not give.
- State the goal first, then relevant context, then concrete requirements or constraints, then what a good result looks like (e.g. tests pass, output format).
- Fix spelling and grammar; remove filler. Use short bullet lists only when there are several distinct requirements.
- Write in the user's voice (first person, addressed to the assistant). Keep it concise: no longer than it needs to be.
- If something important is ambiguous, add a brief line asking the assistant to check with you on it rather than guessing.
- Output ONLY the rewritten prompt. No preamble, no quotes, no explanation.`

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
