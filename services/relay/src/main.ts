/** Process entry: start the relay and shut it down cleanly. */
import { startFromEnv } from './server.ts'

const relay = await startFromEnv()

const shutdown = async (): Promise<void> => {
  await relay.close()
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
