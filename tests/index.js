const test = require('tape')
const tempy = require('tempy')
const SDK = require('../')

const createDb = () =>
  new SDK({
    disableSwarm: true,
    persist: false,
    baseDir: tempy.directory()
  })

test('ready', async t => {
  const p2p = createDb()
  t.doesNotThrow(async () => p2p.ready(), 'ready method should not throw')
  t.end()
})

test('init: create content module', async t => {
  const p2p = createDb()
  await p2p.ready()
  const metadata = {
    type: 'content',
    subtype: 'Theory',
    title: 'demo',
    description: 'lorem ipsum',
    main: 'file.txt'
  }
  const output = await p2p.init(metadata)

  t.same(output.type, metadata.type)
  t.same(output.subtype, metadata.subtype)
  t.same(output.title, metadata.title)
  t.same(output.description, metadata.description)
  t.same(typeof output.url, 'string', 'url is a string')
  t.same(
    output.links.license[0].href,
    'https://creativecommons.org/publicdomain/zero/1.0/legalcode'
  )
  t.same(output.links.spec[0].href, 'https://p2pcommons.com/specs/module/0.2.0')
  t.same(output.main, metadata.main)
  t.same(output.authors, [])
  t.same(output.parents, [])
  t.end()
  await p2p.destroy()
})

test('init: creation should throw a ValidationError', async t => {
  const p2p = createDb()
  await p2p.ready()
  const metadata = {
    type: 'content'
  }
  try {
    await p2p.init(metadata)
  } catch (err) {
    t.ok(err, 'An error should happen')
    t.ok(
      err instanceof SDK.errors.ValidationError,
      'It should be a custom SDK error'
    )
    t.end()
    await p2p.destroy()
  }
})

test('init: create profile module', async t => {
  const p2p = createDb()
  await p2p.ready()
  const metadata = {
    type: 'profile',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const output = await p2p.init(metadata)
  t.same(output.type, metadata.type)
  t.same(output.title, metadata.title)
  t.same(output.description, metadata.description)
  t.same(typeof output.url, 'string', 'url is a string')
  t.same(
    output.links.license[0].href,
    'https://creativecommons.org/publicdomain/zero/1.0/legalcode'
  )
  t.same(output.links.spec[0].href, 'https://p2pcommons.com/specs/module/0.2.0')
  t.same(output.follows, [])
  t.same(output.contents, [])
  t.end()
  await p2p.destroy()
})

test('get: retrieve a value from the sdk', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = {
    type: 'profile',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const metadata = await p2p.init(sampleData)
  const key = metadata.url.toString('hex')

  const { rawJSON } = await p2p.get(key)

  t.same(rawJSON, metadata)
  t.end()
  await p2p.destroy()
})

test('set: update a value', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = {
    type: 'content',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const metadata = await p2p.init(sampleData)
  const key = metadata.url.toString('hex')

  const description = 'A more accurate description'
  await p2p.set({ url: key, description })
  const { rawJSON } = await p2p.get(key)

  t.same(rawJSON.description, description)
  t.end()
  await p2p.destroy()
})

test('set: should throw InvalidKeyError with invalid update', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = {
    type: 'content',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const metadata = await p2p.init(sampleData)
  const key = metadata.url.toString('hex')

  const license = 'anewkey123456'

  p2p.set({ url: key, license }).catch(err => {
    t.ok(
      err instanceof SDK.errors.InvalidKeyError,
      'error should be instance of InvalidKeyError'
    )
    t.end()
  })
})

test('set: update should fail with bad data', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = {
    type: 'content',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const metadata = await p2p.init(sampleData)
  const key = metadata.url.toString('hex')

  try {
    await p2p.set({ url: key, title: '' })
  } catch (err) {
    t.ok(
      err instanceof SDK.errors.ValidationError,
      'error should be instance of ValidationError'
    )
    t.end()
  }
})

test('update: check version change', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = {
    type: 'content',
    title: 'demo',
    description: 'lorem ipsum'
  }
  const metadata = await p2p.init(sampleData)
  const key = metadata.url.toString('hex')

  const { metadata: metadata1 } = await p2p.get(key, false)

  const description = 'A more accurate description'
  await p2p.set({ url: key, description })
  const { rawJSON: rawJSON2, metadata: metadata2 } = await p2p.get(key, false)

  t.same(rawJSON2.description, description)
  t.ok(
    metadata2.version > metadata1.version,
    'latest version should be bigger than previous version after update'
  )
  t.ok(
    metadata2.lastModified > metadata1.lastModified,
    'lastModified should be bigger than previous lastModified'
  )
  t.end()
  await p2p.destroy()
})

test('list content', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleDataContent = [
    {
      type: 'content',
      title: 'demo',
      description: 'lorem ipsum'
    },
    {
      type: 'content',
      title: 'demo 2'
    },
    { type: 'content', title: 'sample' }
  ]

  const sampleDataProfile = [{ type: 'profile', title: 'Professor X' }]

  await Promise.all(
    []
      .concat(sampleDataContent)
      .concat(sampleDataProfile)
      .map(d => p2p.init(d))
  )
  const result = await p2p.listContent()
  t.same(result.length, sampleDataContent.length)
  t.end()
  await p2p.destroy()
})

test('list profiles', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleDataContent = [
    {
      type: 'content',
      title: 'demo',
      description: 'lorem ipsum'
    },
    {
      type: 'content',
      title: 'demo 2'
    },
    { type: 'content', title: 'sample' }
  ]

  const sampleDataProfile = [{ type: 'profile', title: 'Professor X' }]

  await Promise.all(
    []
      .concat(sampleDataContent)
      .concat(sampleDataProfile)
      .map(d => p2p.init(d))
  )
  const result = await p2p.listProfiles()
  t.same(result.length, sampleDataProfile.length)
  t.end()
  await p2p.destroy()
})

test('list modules', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = [
    {
      type: 'content',
      title: 'demo',
      description: 'lorem ipsum'
    },
    {
      type: 'content',
      title: 'demo 2'
    },
    { type: 'content', title: 'sample' },
    { type: 'profile', title: 'Professor X' }
  ]

  await Promise.all([].concat(sampleData).map(d => p2p.init(d)))
  const result = await p2p.list()
  t.same(result.length, sampleData.length)
  t.end()
  await p2p.destroy()
})

test('multiple writes with persistance', async t => {
  try {
    const dir = tempy.directory()
    const p2p1 = new SDK({
      baseDir: dir
    })

    await p2p1.ready()
    const { url } = await p2p1.init({ type: 'content', title: 'title' })
    t.same(typeof url, 'string')
    await p2p1.destroy()

    // create a new instance with same basedir
    const p2p2 = new SDK({
      baseDir: dir
    })
    await p2p2.ready()
    const metadata = { url, title: 'beep' }
    await p2p2.set(metadata)
    await p2p2.set({ url, description: 'boop' })
    const { rawJSON } = await p2p2.get(url)
    t.same(rawJSON.title, metadata.title)
    t.same(rawJSON.description, 'boop')
    await p2p2.destroy()
    t.end()
  } catch (err) {
    t.error(err)
  }
})

test('register - local contents', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = [
    {
      type: 'content',
      title: 'demo',
      description: 'lorem ipsum'
    },
    { type: 'profile', title: 'Professor X' }
  ]
  await Promise.all([].concat(sampleData).map(d => p2p.init(d)))

  const profiles = await p2p.listProfiles()
  const contents = await p2p.listContent()

  const { rawJSON: profile } = profiles[0]
  const { rawJSON: content1 } = contents[0]
  const authors = [profile.url]

  // update author on content module
  await p2p.set({ url: content1.url, authors })

  await p2p.register(content1.url, profile.url)
  const { rawJSON } = await p2p.get(profile.url)
  t.same(
    rawJSON.contents,
    [content1.url],
    'registration results in the addition of a dat key to the contents property of the target profile'
  )
  await p2p.destroy()
  t.end()
})

test('verify', async t => {
  const p2p = createDb()
  await p2p.ready()
  const sampleData = [
    {
      type: 'content',
      title: 'demo',
      description: 'lorem ipsum'
    },
    {
      type: 'content',
      title: 'demo 2'
    },
    { type: 'profile', title: 'Professor X' }
  ]

  await Promise.all([].concat(sampleData).map(d => p2p.init(d)))

  const profiles = await p2p.listProfiles()
  const contents = await p2p.listContent()

  const { rawJSON: profile } = profiles[0]
  const { rawJSON: content1 } = contents[0]
  const { rawJSON: content2 } = contents[1]
  const authors = [profile.url]

  // ATOMIC OP?
  // update author on content module
  await p2p.set({ url: content1.url, authors })
  // update content in author profile
  await p2p.set({ url: profile.url, contents: [content1.url] })
  // END ATOMIC OP

  const { rawJSON: content1Updated } = await p2p.get(content1.url)

  const result = await p2p.verify(content1Updated)

  t.ok(result, 'content1 meets the verification requirements')

  const result2 = await p2p.verify(content2)
  t.notOk(result2, 'content2 does not has authors registered')

  await p2p.destroy()
  t.end()
})
