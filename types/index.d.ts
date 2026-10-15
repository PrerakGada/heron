/** Answer keys (see answerKeys in hooks/rules.ts) of every reply that ended a turn. */
export type Finals = Record<string, true>

declare module 'claude-code' {
  interface PluginState {
    heron: {
      /** False after /heron off: everything draws as Claude Code draws it. */
      enabled: boolean
      /** True while a main-loop turn runs. */
      running: boolean
      /** The newest text block the model wrote this turn, shown as the one live line. */
      latestStep: string | null
      finals: Finals
    }
  }
}
