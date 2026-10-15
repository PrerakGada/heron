import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { answerKeys, isFinal, oneLine, replyKeys, splitRecap, toolLine } from './rules'

const STEP = "I found the login certs on `server`. I'll check which zone each cert can reach."
const ANSWER =
  '**The CNAME is live.** docs.example.com now points at the new host, DNS-only, created with the token on `server`.\n\n' +
  'Nothing else changed in the zone, and the old record it replaced was already unused. Saved to memory and the infra README.'

// What sits beneath Heron in a session: the engine's own drawing and turn ends.
function engine(on: On, drawnText?: string[]) {
  const drawn = async () => ({ type: 'engine' as const, ref: 0 })
  on('ui.render', { component: 'UserMessage' }, drawn)
  on('ui.render', { component: 'AssistantMessage' }, async (_$, e) => {
    drawnText?.push(e.props.text)
    return drawn()
  })
  on('ui.render', { component: 'ToolGroup' }, drawn)
  on('ui.render', { component: 'ToolUse' }, drawn)
  on('ui.render', { component: 'ToolResult' }, drawn)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('command.register', async () => ({ value: { command: 'heron' } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  mock.store(on)
}

const complete = (answer: string) => ({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const })
// The kit has nothing beneath session.append to store the row; Heron's hook has run by then.
const append = ($: { session: { append: (i: ReturnType<typeof step>) => Promise<unknown> } }, text: string) =>
  $.session.append(step(text)).catch(() => undefined)
const step = (text: string) => ({
  message: { type: 'assistant' as const, role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  door: 'response' as const,
  origin: { kind: 'model' as const, model: 'claude-opus-5-5' },
  uuid: 'u-' + text.length,
})

test('rules: one line is plain and cut; tools read as words; keys match a lightly changed answer', async () => {
  expect(oneLine('## **Done.** All `good` here\nmore', 80)).toBe('Done. All good here')
  expect(oneLine('x'.repeat(50), 20)).toHaveLength(20)
  expect(toolLine('Bash', { command: 'ls -la', description: 'List files' })).toBe('List files')
  expect(toolLine('Edit', { file_path: '/a/b/register.tsx' })).toBe('Editing register.tsx')
  expect(toolLine('mcp__claude_ai_Gmail__search_threads', {})).toBe('claude ai Gmail · search threads')
  const finals = Object.fromEntries(answerKeys(ANSWER).map(k => [k, true as const]))
  expect(isFinal(ANSWER + '\n<!-- hidden -->', finals)).toBe(true)
  expect(isFinal(STEP, finals)).toBe(false)
  expect(isFinal('Done.\n\n**In one line:** Shipped it.', {})).toBe(true)
})

test('the recap splits off without its label', async () => {
  expect(splitRecap('Did it.\n\n**In one line:** Renamed the mod to Heron.')).toEqual({ body: 'Did it.', recap: 'Renamed the mod to Heron.' })
  expect(splitRecap('No recap here.')).toBe(null)
  const finals = Object.fromEntries(replyKeys(ANSWER + '\n\n**In one line:** Added the CNAME.').map(k => [k, true as const]))
  expect(isFinal(ANSWER, finals)).toBe(true)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the recap sits in its own cell at the foot of the answer box (${surface})`, async ($, on) => {
    const drawnText: string[] = []
    engine(on, drawnText)
    const ui = await $.ui.mount({
      plugin: 'heron',
      surface,
      component: 'AssistantMessage',
      props: { text: ANSWER + '\n\n**In one line:** Added the CNAME.', isFirstOfReply: true },
    })
    expect(await ui.find({ key: 'heron-answer' })).toBeDefined()
    expect(await ui.find({ key: 'heron-recap' })).toBeDefined()
    expect(await ui.find({ text: /In one line/ })).toBe(undefined)
    expect(drawnText.at(-1)).toBe(ANSWER)
  })

  test(`a typed prompt sits in an outlined box (${surface})`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({
      plugin: 'heron',
      surface,
      component: 'UserMessage',
      props: { text: 'fix the build', origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ key: 'heron-prompt' })).toBeDefined()
  })

  test(`a step is the live line while the turn runs, then gone; the answer is boxed (${surface})`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/tmp', surface, isInteractive: true })
    await $.turn.start({ text: 'go', turnId: 't1' })
    await append($, STEP)

    const stepUi = await $.ui.mount({ plugin: 'heron', surface, component: 'AssistantMessage', props: { text: STEP, isFirstOfReply: true } })
    expect(await stepUi.find({ type: 'Text', text: /^I found the login certs/ })).toBeDefined()

    await append($, ANSWER)
    await $.turn.complete(complete(ANSWER))

    expect(await stepUi.find({ type: 'Text', text: /login certs/ })).toBe(undefined)
    const answerUi = await $.ui.mount({ plugin: 'heron', surface, component: 'AssistantMessage', props: { text: ANSWER, isFirstOfReply: true } })
    expect(await answerUi.find({ key: 'heron-answer' })).toBeDefined()
  })

  test(`tool rows: one line while running, nothing once done, a plan always shown (${surface})`, async ($, on) => {
    engine(on)
    const props = { tool_use_id: 'x', tool: 'Bash', input: { command: 'ssh server', description: 'Create the CNAME' }, isErrored: false, isInterrupted: false }
    const live = await $.ui.mount({ plugin: 'heron', surface, component: 'ToolUse', props: { ...props, isRunning: true } })
    expect(await live.find({ type: 'Text', text: /^Create the CNAME/ })).toBeDefined()
    const done = await $.ui.mount({ plugin: 'heron', surface, component: 'ToolUse', props: { ...props, isRunning: false } })
    expect(await live.find({ key: 'heron-line' })).toBeDefined()
    expect(await done.find({ type: 'Text' })).toBe(undefined)
    const plan = await $.ui.mount({ plugin: 'heron', surface, component: 'ToolUse', props: { ...props, tool: 'ExitPlanMode', isRunning: false } })
    expect(await plan.find({ key: 'heron-line' })).toBe(undefined)
  })

  test(`/heron off draws every row as Claude Code does (${surface})`, async ($, on) => {
    engine(on)
    on('command.run', async () => ({ text: '' }))
    await $.session.start({ cwd: '/tmp', surface, isInteractive: true })
    await $.command.run({ command: 'heron', args: 'off', origin: { kind: 'composer' } } as Parameters<typeof $.command.run>[0])
    const ui = await $.ui.mount({ plugin: 'heron', surface, component: 'AssistantMessage', props: { text: STEP, isFirstOfReply: true } })
    expect(await ui.find({ key: 'heron-line' })).toBe(undefined)
    expect(await ui.find({ key: 'heron-answer' })).toBe(undefined)
  })
}
