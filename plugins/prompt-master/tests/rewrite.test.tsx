import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: button rewrites the draft, undo restores it`, async ($, on) => {
    let box = 'fix the login bug its broke when pw has spaces'
    on('prompt.read', () => ({ value: { text: box, cursor: box.length } }) as never)
    on('prompt.fill', (_, e) => {
      box = e.text
      return { isFilled: true, text: e.text, cursor: e.text.length }
    })
    let asked = ''
    on('model.complete', (_, e) => {
      asked = e.prompt
      return { value: {
        isAnswered: true,
        text: 'Fix the login bug: sign-in fails when the password contains spaces.',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      } } as never
    })

    const ui = await $.ui.mount({
      plugin: 'prompt-master',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9, contentRows: 1 }, view: {} },
    } as never)
    await ui.press({ key: 'rewrite' })
    expect(asked).toContain('pw has spaces')
    expect(box).toBe('Fix the login bug: sign-in fails when the password contains spaces.')

    await ui.press({ key: 'undo' })
    expect(box).toBe('fix the login bug its broke when pw has spaces')
    await ui.unmount()
  })
}

test('/prompt-master shows the rewrite in chat when no prompt box can take it', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('prompt.fill', (_, e) => ({ isFilled: false, text: '', cursor: 0 }) as never)
  on('model.complete', () => ({ value: {
    isAnswered: true,
    text: 'Add dark mode to the settings page.',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } }) as never)
  on('command.run', () => ({ text: 'beneath' }))

  const out = await $.command.run({ command: 'prompt-master', args: 'add dark mod to setings' } as never)
  expect((out as { text?: string }).text).toContain('Add dark mode to the settings page.')
})
