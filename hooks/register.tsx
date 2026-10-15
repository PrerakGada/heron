// heron — signal, not noise.
//
// The transcript keeps what is worth reading and folds away the rest:
// - each prompt typed at the terminal sits in a blue outlined box;
// - each reply that ended a turn sits in an outlined box in Claude's colour;
// - everything in between (the narration the model writes between tool calls,
//   tool rows, their output, diffs) folds into ONE dim live line while the
//   turn runs, and disappears once it ends;
// - background-task notices shrink to one dim line.
// Rows that need reading as they are (a plan to approve, a question's
// answers) stay. /heron off draws everything as Claude Code does; /heron on
// brings it back.
//
// Which reply ended a turn: turn.complete says so, and Heron keeps its keys
// (across sessions too). A reply ending in the `**In one line:**` recap counts
// as one even in a session Heron never saw finish.
import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Finals } from '../types'
import { isFinal, KEEP_TOOLS, oneLine, replyKeys, sameText, splitRecap, textBlocks, toolLine } from './rules'

const enabled = atom({ plugin: 'heron', key: 'enabled' } as const, true)
const running = atom({ plugin: 'heron', key: 'running' } as const, false)
const latestStep = atom({ plugin: 'heron', key: 'latestStep' } as const, null as string | null)
const finals = atom({ plugin: 'heron', key: 'finals' } as const, {} as Finals)

// A live line wraps; past this many characters it is cut.
const LONG = 600

// Answer keys kept across sessions; the oldest drop off past this many.
const FINALS_MAX = 4000

const USER_COLOR = 'suggestion'
const ANSWER_COLOR = 'claude'
const RECAP_COLOR = 'success'

async function markFinal($: Engine, text: string): Promise<void> {
  const keys = replyKeys(text)
  if (!keys.length) return
  const kept = ((await $.store.get('finals')) as string[] | undefined) ?? []
  const next = [...kept.filter(k => !keys.includes(k)), ...keys].slice(-FINALS_MAX)
  await $.store.set('finals', next)
  await update($, finals, f => {
    const out: Finals = { ...f }
    for (const k of keys) out[k] = true
    return out
  })
}

async function setEnabled($: Engine, on: boolean): Promise<string> {
  await update($, enabled, () => on)
  await $.store.set('enabled', on)
  return on
    ? 'Heron on: prompts and answers boxed, working steps folded into one live line.'
    : 'Heron off: the transcript draws as Claude Code draws it. /heron on brings it back.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'heron',
      description: 'Heron: /heron on | off (bare /heron toggles). Off shows every step, tool row and diff again.',
    })
    const kept = ((await $.store.get('finals')) as string[] | undefined) ?? []
    const loaded: Finals = {}
    for (const k of kept) loaded[k] = true
    await update($, finals, f => ({ ...loaded, ...f }))
    const wasOn = await $.store.get('enabled')
    if (wasOn === false) await update($, enabled, () => false)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, running, () => true)
    await update($, latestStep, () => null)
    return next(e)
  })

  // The newest thing the model said is the live line.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const texts = textBlocks(e.message.content)
      const last = texts[texts.length - 1]
      if (last) await update($, latestStep, () => last)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    // An interrupted turn has no answer: its last words stand in for one.
    const answer = e.answer.trim() || (await read($, latestStep)) || ''
    if (answer) await markFinal($, answer)
    await update($, running, () => false)
    await update($, latestStep, () => null)
    return next(e)
  })

  on('command.run', { command: 'heron' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on') return { text: await setEnabled($, true) }
    if (arg === 'off') return { text: await setEnabled($, false) }
    return { text: await setEnabled($, !(await read($, enabled))) }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const kind = e.props.origin.kind
    if (kind === 'composer' || kind === 'bridge') {
      return (
        <Box key="heron-prompt" flexDirection="column" borderStyle="round" borderColor={USER_COLOR} paddingX={1}>
          {await next(e)}
        </Box>
      )
    }
    if (kind === 'task-notification' && !e.props.isExpanded) {
      return (
        <Box key="heron-line" flexDirection="row" paddingLeft={2}>
          <Text dimColor>{'◦ '}</Text>
          <Text dimColor wrap="wrap">
            {oneLine(e.props.text, LONG)}
          </Text>
        </Box>
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const text = e.props.text
    if (isFinal(text, await read($, finals))) {
      // The closing recap leaves the reply and sits in its own cell at the box's foot.
      const split = splitRecap(text)
      const body = split ? split.body : text
      const { Markdown } = $.ui.resolve(e)
      return (
        <Box key="heron-answer" flexDirection="column" borderStyle="round" borderColor={ANSWER_COLOR} paddingX={1}>
          {body.trim() ? await next(split ? { ...e, props: { ...e.props, text: body } } : e) : null}
          {split && (
            <Box key="heron-recap" borderStyle="round" borderColor={RECAP_COLOR} paddingX={1} marginTop={body.trim() ? 1 : 0}>
              <Markdown text={split.recap} />
            </Box>
          )}
        </Box>
      )
    }
    if ((await read($, running)) && sameText(await read($, latestStep), text)) {
      return (
        <Box key="heron-line" flexDirection="row" paddingLeft={2}>
          <Text dimColor>{'⋯ '}</Text>
          <Text dimColor italic wrap="wrap">
            {oneLine(text, LONG)}
          </Text>
        </Box>
      )
    }
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, enabled)) || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const calls = e.props.calls
    const now = [...calls].reverse().find(c => c.isRunning) ?? calls[calls.length - 1]
    if (e.props.isActive && now && (await read($, running))) {
      return (
        <Box key="heron-line" flexDirection="row" paddingLeft={2}>
          <Text dimColor>{'⋯ '}</Text>
          <Text dimColor wrap="wrap">
            {oneLine(toolLine(now.tool, now.input), LONG)}
          </Text>
        </Box>
      )
    }
    return <Box />
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, enabled)) || KEEP_TOOLS.has(e.props.tool)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (e.props.isRunning) {
      return (
        <Box key="heron-line" flexDirection="row" paddingLeft={2}>
          <Text dimColor>{'⋯ '}</Text>
          <Text dimColor wrap="wrap">
            {oneLine(toolLine(e.props.tool, e.props.input), LONG)}
          </Text>
        </Box>
      )
    }
    if (e.props.isInterrupted) {
      return (
        <Box key="heron-line" flexDirection="row" paddingLeft={2}>
          <Text dimColor>{'✕ '}</Text>
          <Text dimColor wrap="wrap">
            {'Interrupted: ' + oneLine(toolLine(e.props.tool, e.props.input), LONG)}
          </Text>
        </Box>
      )
    }
    return <Box />
  })

  // Tool output and diffs: folded away.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, enabled)) || KEEP_TOOLS.has(e.props.tool)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
