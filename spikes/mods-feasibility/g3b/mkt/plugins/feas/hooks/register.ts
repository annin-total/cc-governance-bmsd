import type { Register } from 'claude-code'

const CODE_VERSION = 'code-v1'
const MARK = 'MARK-ORIGIN'

export const register: Register = (on, options) => {
  const tag = String(options.tag ?? '')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'feas-where', description: '実行元と版を返す' })
    const prev = await $.store.get('starts')
    const starts = (typeof prev === 'number' ? prev : 0) + 1
    await $.store.set('starts', starts)
    await $.store.set('lastStart', { code: CODE_VERSION, mark: MARK, root: $.plugin.root })
    return next(e)
  })

  on('command.run', { command: 'feas-where' }, async $ => {
    const starts = await $.store.get('starts')
    return { text: `code=${CODE_VERSION} mark=${MARK} root=${$.plugin.root} tag=${tag || 'none'} starts=${String(starts)}` }
  })
}
