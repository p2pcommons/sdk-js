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
    description: 'lorem ipsum'
  }
  const output = await p2p.init(metadata)

  t.same(output.type, metadata.type)
  t.same(output.subtype, metadata.subtype)
  t.same(output.title, metadata.title)
  t.same(output.description, metadata.description)
  t.same(typeof output.url, 'string', 'url is a string')
  t.same(
    output.license,
    'https://creativecommons.org/publicdomain/zero/1.0/legalcode'
  )
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
    output.license,
    'https://creativecommons.org/publicdomain/zero/1.0/legalcode'
  )
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

  const result = await p2p.get(key)

  t.same(result, metadata)
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
  const result = await p2p.get(key)

  t.same(result.description, description)
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

  const result1 = await p2p.get(key, false)

  const description = 'A more accurate description'
  await p2p.set({ url: key, description })
  const result2 = await p2p.get(key, false)

  t.same(result2.rawJSON.description, description)
  t.ok(
    result2.version > result1.version,
    'latest version should be bigger than previous version after update'
  )
  t.ok(
    result2.lastModified > result1.lastModified,
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

  const profile = profiles[0]
  const content1 = contents[0]
  const content2 = contents[1]
  const authors = [profile.url]

  // ATOMIC OP
  // update author
  await p2p.set({ url: content1.url, authors })
  // update content in author profile
  await p2p.set({ url: profile.url, contents: [content1.url] })
  // END ATOMIC OP

  const updated = await p2p.get(content1.url)

  const result = await p2p.verify(updated, profile)

  t.ok(result, 'content1 meets the verification requirements')

  const result2 = await p2p.verify(content2, profile)
  t.notOk(result2, 'content2 does not has authors registered')

  t.end()
  await p2p.destroy()
})
