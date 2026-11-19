export type Status = 'idle' | 'working' | 'done'

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': { status: Status; original: string | null }
  }
}
