// Sustituye al módulo "os" de Node para fengari (solo necesita saber la plataforma)
const os = { platform: () => 'browser', tmpdir: () => '/tmp', EOL: '\n' }
export default os
export const platform = os.platform
