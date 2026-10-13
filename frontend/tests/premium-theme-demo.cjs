/* Local synthetic preview. Writes only in-memory fixture preference state. */
const {createFixtureServer}=require('./premium-theme-browser.cjs')
const {createFixtureState}=require('./premium-theme-fixtures.cjs')
const state=createFixtureState({themePreference:'DARK'}),port=Number(process.env.PREMIUM_THEME_PORT)||5199
createFixtureServer(port,state).then(server=>{
 console.log(`Local visual demo: http://127.0.0.1:${port}/admin/configuracion#negocio`)
 console.log('Automatic synthetic account; no credentials required. Financial/destructive writes are refused.')
 const stop=async()=>{await server.close();process.exit(0)};process.on('SIGINT',stop);process.on('SIGTERM',stop)
}).catch(error=>{console.error(error);process.exitCode=1})
