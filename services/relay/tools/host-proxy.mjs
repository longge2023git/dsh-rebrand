/**
 * Dev-only TCP forwarder: expose a host proxy bound to 127.0.0.1 to Docker
 * containers. Containers cannot reach the host loopback, so point them at a
 * host LAN address that this listener binds.
 *
 * Usage: node tools/host-proxy.mjs [listenPort] [targetPort] [bindAddress]
 * Example: node tools/host-proxy.mjs 10809 10808 192.168.1.10
 *
 * Bind a LAN address, not 0.0.0.0, on untrusted networks.
 */
import net from 'node:net'

const listenPort = Number(process.argv[2] ?? 10809)
const targetPort = Number(process.argv[3] ?? 10808)
const bindAddress = process.argv[4] ?? '0.0.0.0'

if (!Number.isInteger(listenPort) || !Number.isInteger(targetPort)) {
  console.error('usage: node tools/host-proxy.mjs [listenPort] [targetPort] [bindAddress]')
  process.exit(2)
}

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: '127.0.0.1', port: targetPort })
  upstream.on('error', () => client.destroy())
  client.on('error', () => upstream.destroy())
  client.pipe(upstream)
  upstream.pipe(client)
})

server.listen(listenPort, bindAddress, () => {
  console.log(`forwarding ${bindAddress}:${listenPort} -> 127.0.0.1:${targetPort}`)
})
