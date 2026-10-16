/* Run only when explicitly requested; existing demos are untouched. */
process.env.PREMIUM_THEME_STATIC='false'
const {createFixtureServer}=require('./premium-theme-browser.cjs')
const {createFixtureState}=require('./premium-theme-fixtures.cjs')
const state=createFixtureState({themePreference:'DARK'}),port=Number(process.env.MOBILE_UX_DEMO_PORT)||5299
createFixtureServer(port,state).then(server=>{console.log(`Synthetic interactive Mobile UX demo: http://127.0.0.1:${port}/admin/configuracion#negocio`);console.log('Use Apariencia in Mi negocio to change theme. Restart resets in-memory state. Financial writes return 405.');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0)})}).catch(error=>{console.error(error);process.exitCode=1})
