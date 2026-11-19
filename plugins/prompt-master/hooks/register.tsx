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
async function rewrite($: Engine, given?: string) {
  if ((await read($, status)) === 'working') return
  const text = given ?? (await $.prompt.read()).text
  const draft = text.trim()
  if (!draft) {
    $.ui.toast('Prompt Master: type a rough prompt first')
    return
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
    $.ui.toast(`Prompt Master: rewrite failed (${r.isAnswered ? 'empty reply' : r.reason})`)
    return
  }
  // Don't clobber the box if the person kept typing while we worked.
  const now = await $.prompt.read()
  if (given === undefined && now.text.trim() !== draft) {
    await update($, status, () => 'idle')
    $.ui.toast('Prompt Master: draft changed while rewriting, left it as is')
    return
  }
  await $.prompt.fill({ text: r.text.trim(), mode: 'replace' })
  await update($, original, () => text)
  await update($, status, () => 'done')
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
    void rewrite($, e.args)
    return { text: 'Prompt Master is rewriting it — the result will land in your prompt box.' }
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
          onPress={() => rewrite($)}
        />
        {canUndo ? <Button key="undo" label="↩ Undo" onPress={() => undo($)} /> : null}
        {s === 'done' ? <Text dimColor>Rewritten — review, then send</Text> : null}
      </Box>
    )
  })
}
