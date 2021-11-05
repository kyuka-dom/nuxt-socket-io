import ava from 'ava'
import { delay } from 'les-utils/utils/promise.js'
import { register } from '../lib/module.js'
import Plugin from '../lib/plugin.js'
import * as indexStore from '../store/index.js'
import * as examplesStore from '../store/examples.js'
import { wrapPlugin } from './utils/plugin.js'

const { serial: test, before, after } = ava
let ioServerObj

const cleanStore = () => {
  const store = {
    state: indexStore.state(),
    mutations: indexStore.mutations,
    actions: indexStore.actions
  }
  store.state.examples = examplesStore.state()
  store.mutations.examples = examplesStore.mutations
  store.actions.examples = examplesStore.actions
  return store
}

const ChatMsg = {
  date: new Date(),
  from: '',
  to: '',
  text: ''
}

const clientAPI = {
  label: 'ioApi_page',
  version: 1.31,
  evts: {
    undefApiData: {},
    undefEvt: {},
    alreadyDefd: {},
    warnings: {
      data: {
        lostSignal: false,
        battery: 0
      }
    }
  },
  methods: {
    undefMethod: {},
    receiveMsg: {
      msg: ChatMsg,
      resp: {
        status: ''
      }
    }
  }
}

const ctx = wrapPlugin(Plugin)
ctx.$config.nuxtSocketIO = {}
ctx.Plugin(null, ctx.inject)

/**
 * @param {import('socket.io-client').Socket} s
 */
function waitForSocket (s) {
  return new Promise((resolve) => {
    if (s.connected) {
      resolve(s)
      return
    }
    s.on('connect', () => resolve(s))
  })
}

/**
 * @param {import('socket.io-client').Socket} s
 * @param {function} trigger
 * @param {Array<String>} evts
 */
function triggerEvents (s, trigger, evts) {
  const p = evts.map(evt =>
    new Promise((resolve) => {
      s.on(evt, resolve)
    })
  )
  trigger()
  return Promise.all(p)
}

function waitForEchoBack (s, evts) {
  const p = evts.map(evt =>
    new Promise((resolve) => {
      s.on(evt, resolve)
      s.emit('echoBack', { evt, data: 'abc123' })
    })
  )
  return Promise.all(p)
}

function RefImpl (arg) {
  this.value = arg
}

before(async (t) => {
  ioServerObj = await register.server({ port: 3000 })
  global.window = {
    // @ts-ignore
    location: {
      host: 'localhost:4000',
      hostname: 'localhost',
      href: 'http://localhost:4000/',
      port: '4000',
      origin: 'http://localhost:4000'
    }
  }
})

after(() => {
  ioServerObj.io.close()
  ioServerObj.server.close()
})

test('nuxtSocket injected', (t) => {
  t.truthy(ctx.$nuxtSocket)
})

test('Store selection (if $store undefined)', (t) => {
  delete ctx.$store
  ctx.$config.io = {
    sockets: [{ url: 'http://someUrl' }]
  }
  ctx.$nuxtSocket({ warnings: false, info: false })
  t.truthy(ctx.store.state.$nuxtSocket)
})

test('Socket plugin (runtime IO $config defined, sockets undef)', (t) => {
  ctx.$config.io = {}
  try {
    ctx.$nuxtSocket({ name: 'runtime' })
  } catch (err) {
    t.is(err.message, "Please configure sockets if planning to use nuxt-socket-io: \r\n [{name: '', url: ''}]")
  }
})

test('Socket plugin (runtime IO $config defined, duplicate sockets)', (t) => {
  ctx.$config.io = {
    sockets: [
      {
        name: 'runtime',
        url: 'http://localhost:3000'
      },
      {
        name: 'runtime',
        url: 'http://someurl'
      }
    ]
  }
  ctx.socketStatus = {}
  const socket = ctx.$nuxtSocket({ name: 'runtime', info: false })
  t.truthy(socket)
  t.is(ctx.socketStatus.connectUrl, 'http://localhost:3000')
})

test('Socket plugin (runtime IO $config defined, merges safely with modOptions)', (t) => {
  ctx.$config.io = {
    sockets: [
      {
        name: 'runtime',
        url: 'http://localhost:3000'
      }
    ]
  }
  ctx.$config.nuxtSocketIO = {
    sockets: [
      {
        name: 'main',
        url: 'http://localhost:3001'
      }
    ]
  }
  ctx.socketStatus = {}
  ctx.$nuxtSocket({ default: true, info: false })
  t.is(ctx.socketStatus.connectUrl, 'http://localhost:3001')
  ctx.socketStatus = {}
  ctx.$nuxtSocket({ name: 'runtime', info: false })
  t.is(ctx.socketStatus.connectUrl, 'http://localhost:3000')
})

test('Socket.url not defined', (t) => {
  ctx.$config.nuxtSocketIO = {
    sockets: [
      {
        name: 'main'
      }
    ]
  }
  ctx.socketStatus = {}
  ctx.$nuxtSocket({ info: false })
  t.is(ctx.socketStatus.connectUrl, window.location.origin)
})

test('Socket Persistence (persist = true)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  const s1 = ctx.$nuxtSocket({ persist: true, teardown: false })
  await waitForSocket(s1)
  const s2 = ctx.$nuxtSocket({ persist: true, teardown: false })
  await waitForSocket(s2)
  t.is(s1.id, s2.id)
  s1.close()
  s2.close()
})

test('Socket Persistence (persist = label)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  const s1 = ctx.$nuxtSocket({ persist: 'mySocket', teardown: false })
  await waitForSocket(s1)
  const s2 = ctx.$nuxtSocket({ persist: 'mySocket', teardown: false })
  await waitForSocket(s2)
  t.is(s1.id, s2.id)
  s1.close()
  s2.close()
})

test('Socket Persistence (persist = true, persisted socket disconnected)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  const s1 = ctx.$nuxtSocket({ persist: true, teardown: false })
  await waitForSocket(s1)
  s1.close()
  const s2 = ctx.$nuxtSocket({ persist: true, teardown: false })
  await waitForSocket(s2)
  t.not(s1.id, s2.id)
})

test('Vuex module', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'home',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  const s = ctx.$nuxtSocket({
    channel: '/dynamic',
    persist: true,
    emitTimeout: 3000
  })
  await waitForSocket(s)
  t.truthy(ctx.$store.state.$nuxtSocket)
  const state = ctx.$store.state.$nuxtSocket
  const commit = ctx.$store.commit
  commit('$nuxtSocket/SET_API', {
    label: 'home/dynamic',
    api: {
      version: '1.2.3'
    }
  })
  commit('$nuxtSocket/SET_CLIENT_API', {
    label: 'home/dynamic',
    version: '2.2.1'
  })
  t.is(state.ioApis['home/dynamic'].version, '1.2.3')
  t.is(state.clientApis['home/dynamic'].version, '2.2.1')

  t.is(state.emitTimeouts['home/dynamic'], 3000)
  await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'getAPI'
  })
    .catch((err) => {
      // Error occurs because this line fails (on purpose here):
      // const _socket = socket || _sockets[label]
      // (persist was set to true instead of a label)
      t.is(
        err.message,
        'socket instance required. Please provide a valid socket label or socket instance'
      )
    })

  await ctx.$store
    .dispatch('$nuxtSocket/emit', {
      evt: 'getAPIxyz',
      label: 'home/dynamic',
      emitTimeout: 500
    })
    .catch((err) => {
      t.is(err.message, 'emitTimeout')
    })

  await ctx.$store
    .dispatch('$nuxtSocket/emit', {
      evt: 'getAPIxyz',
      socket: s,
      emitTimeout: 500
    })
    .catch((err) => {
      const json = JSON.parse(err.message)
      t.is(json.message, 'emitTimeout')
    })

  ctx.$store.state.$nuxtSocket.emitErrors['home/dynamic'].badRequest = []
  await ctx.$store
    .dispatch('$nuxtSocket/emit', {
      evt: 'badRequest',
      socket: s
    })
    .catch((err) => {
      const json = JSON.parse(err.message)
      t.is(json.message, 'badRequest...Input does not match schema')
    })

  await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'badRequest',
    label: 'home/dynamic'
  })

  t.truthy(state.emitErrors['home/dynamic'])
  t.true(state.emitErrors['home/dynamic'].badRequest.length > 0)
  t.is(
    state.emitErrors['home/dynamic'].badRequest[0].message,
    'badRequest...Input does not match schema'
  )

  const s2 = ctx.$nuxtSocket({ channel: '/' })
  const r2 = await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'echo',
    msg: 'hi',
    socket: s2
  })
  const r3 = await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'echo',
    msg: 'hi',
    socket: s2,
    noAck: true
  })

  const r4 = await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'echoUndef',
    socket: s2
  })
  t.is(r2, 'hi')
  t.falsy(r3)
  t.falsy(r4)
  s.close()
  s2.close()
})

test('Namespace config (registration)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000',
          namespacesx: {
            '/': {
              emitters: ['echo2 --> respx'],
              listeners: ['xyz']
            }
          }
        }
      ]
    }
  }
  ctx.resp = ''

  ctx.$nuxtSocket({
    channel: '/',
    namespaceCfg: {
      emitters: { echo: 'resp' }
    }
  })
  t.falsy(ctx.echo)

  const s = ctx.$nuxtSocket({
    channel: '/',
    namespaceCfg: {
      emitters: [
        'echo --> resp'
      ]
    }
  })
  await waitForSocket(s)
  await ctx.echo('Hi')
  t.is(ctx.resp, 'Hi')
  s.close()
})

test('Namespace config (emitters)', async (t) => {
  let preEmit, handleAck
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  Object.assign(ctx, {
    chatMessage2: '',
    chatMessage4: '',
    message5Rxd: '',
    echoBack: {}, // Expect to be overwritten by nspCfg.
    resp: '',
    testMsg: 'A test msg',
    userInfo: {
      name: 'John Smith'
    },
    ids: [123, 444],
    items: [],
    titleResp: '',
    hello: new RefImpl(false),
    preEmit () {
      preEmit = true
    },
    preEmitFail () {
      return false
    },
    handleAck () {
      handleAck = true
    }
  })
  const s = ctx.$nuxtSocket({
    channel: '/index',
    emitTimeout: 5000,
    namespaceCfg: {
      emitters: [
        'echoBack --> echoBack',
        'preEmit] titleFromUser + userInfo --> titleResp [handleAck',
        'preEmitFail] echo',
        'echoError',
        'echoHello --> hello',
        'getItems + ids --> items',
        'echoUndefMsg + undefMsg',
        111 // invalid type...nothing should happen
      ]
    }
  })
  t.is(typeof ctx.echoBack, 'function')
  const resp = await ctx.echoBack({ data: 'Hi' })
  t.is(resp.data, 'Hi')
  await ctx.titleFromUser()
  t.true(preEmit)
  t.true(handleAck)
  t.is(ctx.titleResp.data, 'received msg John Smith!')
  const r2 = await ctx.echo('Hi')
  t.falsy(r2)

  await ctx.echoError()
    .catch((err) => {
      t.is(err.message, 'SomeError')
    })
  ctx.emitErrors = {}
  await ctx.echoError()
  t.is(ctx.emitErrors.echoError[0].message, 'SomeError')

  const s2 = ctx.$nuxtSocket({
    channel: '/index',
    emitTimeout: 100,
    namespaceCfg: {
      emitters: ['noHandler']
    }
  })
  await ctx.noHandler()
  t.is(ctx.emitErrors.noHandler[0].message, 'emitTimeout')
  delete ctx.emitErrors
  await ctx.noHandler().catch((err) => {
    t.is(err.message, 'emitTimeout')
  })
  await ctx.echoHello()
  t.is(ctx.hello.value.data, 'hello')

  await ctx.getItems()
  t.is(ctx.items.length, 2)

  const resp3 = await ctx.echoUndefMsg()
  t.falsy(resp3)

  s.close()
  s2.close()
})

test('Namespace config (listeners)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  let preEmit, handleAck
  Object.assign(ctx, {
    chatMessage2: '',
    chatMessage4: '',
    message5Rxd: '',
    testMsg: 'A test msg',
    preEmit () {
      preEmit = true
    },
    handleAck () {
      handleAck = true
    }
  })

  const s = ctx.$nuxtSocket({
    channel: '/index',
    namespaceCfg: {
      emitters: [
        'getMessage2 + testMsg --> message2Rxd'
      ],
      listeners: [
        'preEmit] chatMessage2 [handleAck',
        'undef1] chatMessage3 --> message3Rxd [undef2',
        'chatMessage4',
        'chatMessage5 --> message5Rxd'
      ]
    }
  })

  await waitForSocket(s)
  t.truthy(ctx.getMessage2)
  await triggerEvents(s, ctx.getMessage2, ['chatMessage2', 'chatMessage3'])
  t.falsy(ctx.message2Rxd)
  t.true(preEmit)
  t.true(handleAck)
  t.is(ctx.chatMessage2, 'Hi, this is a chat message from IO server!')
  t.falsy(ctx.chatMessage3)
  t.is(ctx.chatMessage4.data, 'Hi again')
  t.is(ctx.message5Rxd.data, 'Hi again from 5')
  s.close()
})

test('Namespace config (emitBacks)', async (t) => {
  let preEmit, postEmit
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  Object.assign(ctx, {
    hello: false,
    hello2: false,
    sample3: 100,
    myObj: {
      sample4: 50
    },
    sample5: 421,
    preEmit () {
      preEmit = true
    },
    preEmitValid ({ data }) {
      return data === 'yes'
    },
    postEmitHook () {
      postEmit = true
    },
    handleDone ({ msg }) {
      t.is(msg, 'rxd sample ' + newData.sample3)
    }
  })
  const newData = {
    sample3: ctx.sample3 + 1,
    'myObj.sample4': ctx.myObj.sample4 + 1,
    'myObj.sample5': ctx.myObj.sample5 + 1,
    sample5: 111,
    hello: 'no',
    hello2: 'yes'
  }
  const emitEvts = Object.keys(newData)
  ctx.$watch = (label, cb) => {
    t.true(emitEvts.includes(label))
    cb(newData[label])
    if (label === 'sample5') {
      t.true(preEmit)
    }
  }

  const s = ctx.$nuxtSocket({
    channel: '/examples',
    namespaceCfg: {
      emitBacks: [
        'sample3 [handleDone',
        'noMethod] sample4 <-- myObj.sample4 [handleX',
        'myObj.sample5',
        'preEmit] sample5',
        'preEmitValid] hello [postEmitHook',
        'preEmitValid] echoHello <-- hello2 [postEmitHook'
      ]
    }
  })
  await delay(1000)
  t.true(postEmit)
  s.close()
})

test('Vuex Opts', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000',
          vuex: {
            mutations: {}
          }
        }
      ]
    }
  }
  const store = cleanStore()
  const state = store.state
  Object.assign(ctx.$store, store)
  const newData = { sample: 123 }
  let watchCnt = 0
  ctx.$store.watch = (stateCb, dataCb) => {
    watchCnt++
    stateCb(state)
    dataCb(newData)
  }
  let preEmit; let postEmit = 0; let preEmitFail
  Object.assign(ctx, {
    postEmitHook (args) {
      postEmit++
    },
    preEmitVal (args) {
      preEmit = true
    },
    preEmitValFail () {
      preEmitFail = true
      return false
    }
  })
  const s = ctx.$nuxtSocket({})
  const s2 = ctx.$nuxtSocket({
    channel: '/examples',
    vuex: {
      actions: [
        'nonExist1] someAction [nonExist2',
        'pre1] someAction2 --> format2 [post1',
        'chatMessage --> FORMAT_MESSAGE'
      ],
      mutations: ['SET_MESSAGE', 'someMutation --> examples/SET_SAMPLE'],
      emitBacks: [
        'noPre] examples/sample [noPost',
        'sample2 <-- examples/sample2', // TBD
        'preEmit] sample2b <-- examples/sample2b [postAck',
        'titleFromUser', // defined in store/index.js (for issue #35)
        'preEmitVal] echoHello <-- examples/hello [postEmitHook',
        'preEmitValFail] echoHello <-- examples/helloFail [postEmitHook'
      ]
    }
  })
  await waitForSocket(s2)
  await waitForEchoBack(s2, ['SET_MESSAGE'])
  t.is(state.chatMessages, 'abc123')
  await waitForEchoBack(s2, ['someMutation'])
  t.is(state.examples.sample, 'abc123')
  await waitForEchoBack(s2, ['someAction', 'someAction2', 'chatMessage'])
  t.true(state.action)
  t.is(state.action2, 'ABC123')
  t.true(state.chatMessages.length > 'abc123'.length)
  await delay(1000)
  t.true(preEmit)
  t.true(preEmitFail)
  t.is(postEmit, 1)
  const s3 = ctx.$nuxtSocket({
    channel: '/examples',
    vuex: {
      actions: [
        'nonExist1] someAction [nonExist2'
      ]
    }
  })
  // Check that duplicate listeners weren't registered
  // Only need to check one...
  t.false(s3.hasListeners('someAction'))
  const preDupeCnt = watchCnt
  try {
    const s4 = ctx.$nuxtSocket({
      vuex: {
        emitBacks: [
          'examples/sample', // attempt to re-register...
          'xyz'
        ]
      }
    })
    s4.close()
  } catch (e) {
    t.is(e.message, [
      '[nuxt-socket-io]: Trying to register emitback xyz failed',
      'because it is not defined in Vuex.',
      'Is state set up correctly in your stores folder?'
    ].join('\n'))
  }
  t.is(watchCnt, preDupeCnt + 1)

  s.close()
  s2.close()
  s3.close()
})

test('Teardown', (t) => {
  const ctx = wrapPlugin(Plugin)
  ctx.$config.nuxtSocketIO = {}
  ctx.Plugin(null, ctx.inject)
  let componentDestroyCnt = 0
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  Object.assign(ctx, {
    $destroy () {
      componentDestroyCnt++
    }
  })

  const s = ctx.$nuxtSocket({ teardown: true })
  const s2 = ctx.$nuxtSocket({ teardown: true })
  s.on('someEvt', () => {})
  s2.on('someEvt', () => {})
  t.true(s.hasListeners('someEvt'))
  t.true(s2.hasListeners('someEvt'))
  ctx.$destroy()
  t.is(componentDestroyCnt, 1)
  t.false(s.hasListeners('someEvt'))
  t.false(s2.hasListeners('someEvt'))

  const ctx3 = { ...ctx }
  Object.assign(ctx3, {
    registeredTeardown: false,
    onUnmounted: ctx.$destroy
  })

  const s3 = ctx3.$nuxtSocket({ teardown: true })
  ctx3.onUnmounted()
  t.is(componentDestroyCnt, 2)
})

test('Stubs (composition api support)', async (t) => {
  const ctx = wrapPlugin(Plugin)
  ctx.$config.nuxtSocketIO = { sockets: [{ url: 'http://localhost:3000' }] }
  ctx.Plugin(null, ctx.inject)

  async function validateEventHub () {
    const props = ['$on', '$off', '$once', '$emit']
    props.forEach(p => t.truthy(ctx[p]))

    let rxCnt = 0
    let rx2Cnt = 0
    ctx.$on('msg', (arg) => {
      rxCnt++
      t.is(arg, 'hello')
    })
    ctx.$once('msg2', (arg) => {
      rx2Cnt++
      t.is(arg, 'hello 2')
    })
    ctx.$emit('msg', 'hello')
    ctx.$off('msg')
    ctx.$emit('msg', 'hello again')
    ctx.$emit('msg2', 'hello 2')
    await delay(100)
    t.is(rxCnt, 1)
    t.is(rx2Cnt, 1)
  }

  function validateSet () {
    const obj = {
      val1: new RefImpl(10),
      val2: 10
    }
    ctx.$set(obj, 'val1', 22)
    ctx.$set(obj, 'val2', 22)
    t.is(obj.val1.value, 22)
    t.is(obj.val2, 22)
  }

  function validateWatch () {
    ctx.$watch('someLabel', () => {})
    t.pass()
  }
  ctx.$nuxtSocket({})
  const p = [validateEventHub(), validateSet(), validateWatch()]
  await Promise.all(p)
})

test('Dynamic API Feature (Server)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  const apiIgnoreEvts = ['ignoreMe']
  ctx.$nuxtSocket({
    channel: '/dynamic',
    serverAPI: {},
    apiIgnoreEvts
  })
  await delay(500)
  t.falsy(ctx.ioApi)
  Object.assign(ctx, {
    ioApi: {},
    ioData: {}
  })

  const s = ctx.$nuxtSocket({
    channel: '/dynamic',
    serverAPI: {},
    apiIgnoreEvts
  })
  // eslint-disable-next-line no-console
  console.log('creating a duplicate listener to see if plugin handles it')
  s.on('itemRxd', () => {})
  await delay(500)
  t.true(ctx.ioApi.ready)
  t.truthy(ctx.$store.state.$nuxtSocket.ioApis['main/dynamic'])
  const items = await ctx.ioApi.getItems()
  const item1 = await ctx.ioApi.getItem({ id: 'abc123' })
  Object.assign(ctx.ioData.getItem.msg, { id: 'something' })
  const item2 = await ctx.ioApi.getItem()
  const noResp = await ctx.ioApi.noResp()
  t.true(items.length > 0)
  t.is(item1.id, 'abc123')
  t.is(item2.id, 'something')
  Object.keys(ctx.ioApi.evts).forEach((evt) => {
    if (!apiIgnoreEvts.includes(evt)) {
      t.true(s.hasListeners(evt))
    } else {
      t.false(s.hasListeners(evt))
    }
  })
  t.true(Object.keys(noResp).length === 0)

  Object.assign(ctx, {
    ioApi: {},
    ioData: {}
  })

  const s2 = ctx.$nuxtSocket({
    channel: '/p2p',
    serverAPI: {},
    clientAPI
  })
  await delay(500)
  t.truthy(ctx.$store.state.$nuxtSocket.ioApis['main/p2p'])
  const props = ['evts', 'methods']
  props.forEach((prop) => {
    const clientProps = Object.keys(clientAPI[prop])
    const serverProps = Object.keys(ctx.ioApi[prop])
    clientProps.forEach((cProp) => {
      t.true(serverProps.includes(cProp))
    })
  })
  t.true(ctx.ioApi.ready)
})

test('Dynamic API Feature (Client)', async (t) => {
  ctx.$config = {
    nuxtSocketIO: {
      sockets: [
        {
          name: 'main',
          url: 'http://localhost:3000'
        }
      ]
    }
  }
  Object.assign(ctx, {
    ioApi: {},
    ioData: {},
    alreadyDefdEmit () {

    }
  })
  const s = ctx.$nuxtSocket({
    channel: '/p2p',
    clientAPI: {}
  })

  t.falsy(ctx.$store.state.$nuxtSocket.clientApis['main/p2p'])
  s.close()
  const callCnt = { receiveMsg: 0 }
  Object.assign(ctx, {
    undefApiData: {},
    warnings: {},
    receiveMsg (msg) {
      callCnt.receiveMsg++
      return Promise.resolve({
        status: 'ok'
      })
    }
  })
  const s2 = ctx.$nuxtSocket({
    channel: '/p2p',
    persist: true,
    serverAPI: {},
    clientAPI
  })
  t.truthy(ctx.$store.state.$nuxtSocket.clientApis)
  await ctx.$store.dispatch('$nuxtSocket/emit', {
    evt: 'sendEvts',
    msg: {},
    socket: s2
  })
  t.is(callCnt.receiveMsg, 2)
  Object.keys(clientAPI.evts.warnings.data).forEach((prop) => {
    t.true(ctx.warnings[prop] !== undefined)
  })
  ctx.warnings.battery = 11

  const resp = await ctx.warningsEmit()
  const resp2 = await ctx.warningsEmit({ ack: true })
  const resp3 = await ctx.warningsEmit({ ack: true, battery: 22 })
  t.falsy(resp)
  t.truthy(resp2)
  t.is(resp2.battery, ctx.warnings.battery)
  t.is(resp3.battery, 22)

  ctx.$nuxtSocket({
    warnings: true, // show the warnings
    channel: '/p2p',
    persist: true,
    serverAPI: {},
    clientAPI
  })

  ctx.$nuxtSocket({
    warnings: false, // hide the warnings
    channel: '/p2p',
    persist: true,
    serverAPI: {},
    clientAPI
  })
})

test('Promisified emit and once', async (t) => {
  const ctx = wrapPlugin(Plugin)
  ctx.$config.nuxtSocketIO = { sockets: [{ url: 'http://localhost:3000' }] }
  ctx.Plugin(null, ctx.inject)
  const s = ctx.$nuxtSocket({ channel: '/index', teardown: false, reconnection: true })
  t.truthy(s.emitP)
  t.truthy(s.onceP)
  const p = s.onceP('chatMessage')
  t.true(s.hasListeners('chatMessage'))
  const r = await s.emitP('getMessage', { id: 'abc123' })
  const r2 = await p
  t.false(s.hasListeners('chatMessage'))
  t.is(r, 'It worked! Received msg: {"id":"abc123"}')
  t.is(r2, 'Hi, this is a chat message from IO server!')
})
