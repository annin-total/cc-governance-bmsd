import type { Register } from 'claude-code'

const REASON = 'guard-reg: classic hook に触れる利用者の mod は読み込めません'

// '*'、'classic.*'、'classic.X'、'!classic.*' 以外の否定はいずれも classic イベントを選ぶ
const _touchesClassic = (p: string): boolean =>
  p === '*' || p.startsWith('classic.') || (p.startsWith('!') && p !== '!classic.*')

export const register: Register = (on) => {
  on('plugin.register', { tier: 'user' }, async ($, e, next) => {
    try {
      if (e.uses.events.some(_touchesClassic)) return { refuse: `${REASON} (${e.provenance})` }
      return await next(e)
    } catch (err) {
      return { refuse: `guard-reg: 判定に失敗したため拒否 (${String(err)})` }
    }
  })
}
