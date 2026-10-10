import { app } from './app'
export { app } from './app'
const port = Number(process.env.PORT ?? 3000)
export const startServer = () => app.listen(port, '0.0.0.0', () => {
  console.log(`TecnoDesk API iniciada en el puerto ${port} (${process.env.NODE_ENV ?? 'development'})`)
})
if (require.main === module) startServer()
