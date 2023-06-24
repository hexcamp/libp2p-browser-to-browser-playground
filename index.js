import { multiaddr, protocols } from '@multiformats/multiaddr'
import { pipe } from 'it-pipe'
import { fromString, toString } from 'uint8arrays'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { pushable } from 'it-pushable'
import { mplex } from '@libp2p/mplex'
import { createLibp2p } from 'libp2p'
import { circuitRelayTransport } from 'libp2p/circuit-relay'
import { noise } from '@chainsafe/libp2p-noise'
import { identifyService } from 'libp2p/identify'
import { MemoryBlockstore } from 'blockstore-core'
import { MemoryDatastore } from 'datastore-core'
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { CID } from 'multiformats/cid'

const WEBRTC_CODE = protocols('webrtc').code

const output = document.getElementById('output')
const sendSection = document.getElementById('send-section')
const appendOutput = line => {
  const div = document.createElement('div')
  div.appendChild(document.createTextNode(line))
  output.append(div)
}
const clean = line => line.replaceAll('\n', '')
const sender = pushable()

const node = await createLibp2p({
  addresses: {
    listen: ['/webrtc']
  },
  transports: [
    webSockets({
      filter: filters.all
    }),
    webRTC(),
    circuitRelayTransport({
      discoverRelays: 1
    })
  ],
  connectionEncryption: [noise()],
  streamMuxers: [mplex()],
  connectionGater: {
    denyDialMultiaddr: () => {
      // by default we refuse to dial local addresses from the browser since they
      // are usually sent by remote peers broadcasting undialable multiaddrs but
      // here we are explicitly connecting to a local node so do not deny dialing
      // any discovered address
      return false
    }
  },
  services: {
    identify: identifyService()
  }
})

await node.start()

// the blockstore is where we store the blocks that make up files
const blockstore = new MemoryBlockstore()

// application-specific data lives in the datastore
const datastore = new MemoryDatastore()

const helia = await createHelia({
  datastore,
  blockstore,
  libp2p: node
})

const fs = unixfs(helia)

// handle the echo protocol
await node.handle('/echo/1.0.0', ({ stream }) => {
  pipe(
    stream,
    async function* (source) {
      for await (const buf of source) {
        const incoming = toString(buf.subarray())
        appendOutput(`Received message '${clean(incoming)}'`)
        yield buf
      }
    },
    stream
  )
})

function updateConnList () {
  // Update connections list
  const connListEls = node.getConnections().map(connection => {
    if (connection.remoteAddr.protoCodes().includes(WEBRTC_CODE)) {
      sendSection.style.display = 'block'
    }

    const el = document.createElement('li')
    el.textContent = connection.remoteAddr.toString()
    return el
  })
  document.getElementById('connections').replaceChildren(...connListEls)
}

node.addEventListener('connection:open', event => {
  console.log('Jim connection:open', event)
  updateConnList()
  const connection = event.detail
  async function run () {
    const outgoing_stream = await connection.newStream(['/echo/1.0.0'])
    pipe(sender, outgoing_stream, async src => {
      for await (const buf of src) {
        const response = toString(buf.subarray())
        appendOutput(`Received echo reply '${clean(response)}'`)
      }
    })
  }
  if (isWebrtc(connection.remoteAddr)) {
    run()
  }
})
node.addEventListener('connection:close', event => {
  console.log('Jim connection:close', event)
  updateConnList()
})

node.addEventListener('self:peer:update', event => {
  console.log('Jim self:peer:update', event)
  // Update multiaddrs list
  const multiaddrs = node.getMultiaddrs().map(ma => {
    const el = document.createElement('li')
    el.textContent = ma.toString()
    return el
  })
  document.getElementById('multiaddrs').replaceChildren(...multiaddrs)
})

const isWebrtc = ma => {
  return ma.protoCodes().includes(WEBRTC_CODE)
}

window.connect_relay.onclick = async () => {
  const ma = multiaddr(
    '/dns4/hexcamp-libp2p-webrtc-relay.quick.cluster-4.localnet.farm/tcp/443/wss/p2p/12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN'
  )
  appendOutput(`Dialing '${ma}'`)
  await node.dial(ma)

  appendOutput(`Connected to '${ma}'`)
}

window.connect.onclick = async () => {
  const ma = multiaddr(window.peer.value)
  appendOutput(`Dialing '${ma}'`)
  const connection = await node.dial(ma)

  if (isWebrtc(ma)) {
    const outgoing_stream = await connection.newStream(['/echo/1.0.0'])
    pipe(sender, outgoing_stream, async src => {
      for await (const buf of src) {
        const response = toString(buf.subarray())
        appendOutput(`Received echo reply '${clean(response)}'`)
      }
    })
  }

  appendOutput(`Connected to '${ma}'`)
}

window.publish.onclick = async () => {
  const text = window.publish_text.value

  const encoder = new TextEncoder()

  try {
    const cid = await fs.addBytes(encoder.encode(text), helia.blockstore)
    console.log('Added file:', cid.toString())
    appendOutput(`Published '${text}', CID: ${cid.toString()}`)
    window.publish_cid.innerText = `CID: ${cid.toString()}`
  } catch (e) {
    console.error(e)
  }
}

window.retrieve.onclick = async () => {
  const cid = CID.parse(window.retrieve_cid.value)

  const decoder = new TextDecoder()

  let text = ''
  try {
    console.log('Downloading', cid)
    for await (const chunk of fs.cat(cid)) {
      text += decoder.decode(chunk, {
        stream: true
      })
    }
    console.log('Decoded text:', text)
    window.retrieve_result.innerText = text
  } catch (e) {
    console.error(e)
  }
}

window.send.onclick = async () => {
  const message = `${window.message.value}\n`
  appendOutput(`Sending message '${clean(message)}'`)
  sender.push(fromString(message))
}
