const assert = require('assert')
const { join } = require('path')
const { homedir, tmpdir, platform } = require('os')
const {
  promises: { writeFile, rename, open }
} = require('fs')
const { ensureDir } = require('fs-extra')
const level = require('level')
const sub = require('subleveldown')
const AutoIndex = require('level-auto-index')
const { Type } = require('@avro/types')
const envPaths = require('env-paths')
const discovery = require('hyperdiscovery')
const uniqueString = require('unique-string')
const DatEncoding = require('dat-encoding')
const debug = require('debug')('p2pcommons')
const DatHelper = require('./lib/dat-helper')
const Codec = require('./codec')
const ContentSchema = require('./schemas/content.json')
const ProfileSchema = require('./schemas/profile.json')

const DEFAULT_SWARM_OPTS = {
  extensions: []
}

const createDatJSON = ({
  type,
  title = '',
  description = '',
  url = '',
  writable
}) => {
  assert.strictEqual(typeof type, 'string', 'type is required')
  const obj = {}
  obj.title = title
  obj.description = description
  obj.url = url
  obj.main = ''
  obj.license = ''
  obj.modType = type
  obj.writable = writable

  if (type.endsWith('profile')) {
    obj.type = 'profile'
    obj.follows = []
    obj.contents = []
  } else {
    obj.type = 'content'
    obj.authors = []
    obj.parents = []
  }

  return obj
}

class SDK {
  constructor (opts = {}) {
    debug('p2pcommons:constructor')
    this.paths = envPaths('p2pcommons')
    this.platform = platform()
    // NOTE(dk): consider switch to envPaths usage
    this.home =
      process.env.HOME ||
      (this.windows && this.windowsHome()) ||
      homedir() ||
      tmpdir()
    this.windows = this.platform === 'win32'
    opts.baseDir = opts.baseDir || '.p2pcommons'
    this.baseDir = join(this.home, opts.baseDir)
    this.persist = opts.persist || true
    this.storage = opts.storage || undefined
    this.verbose = opts.verbose || false
    this.dbPath = opts.dbPath || this.paths.data
    // start hyperswarm
    this.disableSwarm = !!opts.disableSwarm
    if (!this.disableSwarm) {
      debug('p2pcommons:constructor starting swarm')
      this.swarm = discovery(Object.assign({}, DEFAULT_SWARM_OPTS, opts.swarm))
    }
  }

  _getAvroTypeName (appType) {
    // Note(dk): fix this. Decide between keeping an type === content || profile or '-profile' (endsWith)
    if (appType === 'content') {
      return this.contentType.name
    }
    if (appType === 'profile') {
      return this.profileType.name
    }
  }

  _getDb (type) {
    assert.ok(type, 'type is required')
    if (type.endsWith('profile')) return this.profiledb
    if (type.endsWith('content')) return this.contentdb
    throw new Error(`Unknown type: ${type}`)
  }

  async ready () {
    await ensureDir(this.dbPath)
    return new Promise((resolve, reject) => {
      // start local db
      const registry = {}
      this.contentType = Type.forSchema(ContentSchema, { registry })
      this.profileType = Type.forSchema(ProfileSchema, { registry })
      const codec = new Codec(registry)
      debug('p2pcommons:ready dbpath', this.dbPath)
      level(join(this.dbPath, 'db'), { valueEncoding: codec }, (err, db) => {
        if (err instanceof level.errors.OpenError) {
          if (this.verbose) {
            console.error('p2pcommons:failed to open database')
          }
          reject(err)
        }
        this.db = db
        // create partitions
        this.contentdb = sub(this.db, 'content', {
          valueEncoding: codec
        })

        this.profiledb = sub(this.db, 'profile', {
          valueEncoding: codec
        })

        // create index
        this.idx = {
          title: sub(this.db, 'title'),
          description: sub(this.db, 'description')
        }

        // indexes / filters
        this.by = {}
        this.by.title = AutoIndex(this.contentdb, this.idx.title, container =>
          container.value.title.toLowerCase()
        )

        this.by.description = AutoIndex(
          this.contentdb,
          this.idx.description,
          container => container.value.description.toLowerCase()
        )

        /*
        this.profileByFollows = AutoIndex(
          this.profiledb,
          this.idx.follows,
          profile => {
            if (
              !profile ||
              !profile.follows ||
              !Array.isArray(profile.follows)
            ) {
              return
            }
            return profile.follows.map(
              p => `${p}_${profile.url.toString('hex')}`
            )
          }
        )
        */
        resolve()
      })
    })
  }

  async init ({ type, title = '', description = '', ...rest }) {
    // follow module spec: https://github.com/p2pcommons/specs/pull/1/files?short_path=2d471ef#diff-2d471ef4e3a452b579a3367eb33ccfb9
    // 1. create folder with unique name
    // 2. initialize an hyperdrive inside
    // 3. createDatJSON with the correct metadata and save it there
    //
    assert.ok(typeof type === 'string', 'type is required')
    assert.ok(
      type.endsWith('profile') || type.endsWith('content'),
      "type should be 'content' or 'profile'"
    )
    debug(`p2pcommons:init ${type}`)

    const tmp = join(this.baseDir, uniqueString())

    await ensureDir(tmp)

    const datHelper = await DatHelper(tmp, {
      persist: this.persist,
      storageFn: this.storage,
      storageOpts: { ...rest.storageOpts }
    })
    const { archive } = datHelper
    await archive.ready()

    const hash = archive.key.toString('hex')

    debug('p2pcommons:init hash', hash)
    if (!this.disableSwarm) {
      this.swarm.add(archive)

      archive.once('close', () => {
        debug(`p2pcommons:closing archive ${archive.publicKey}...`)
        const discoveryKey = DatEncoding.encode(archive.discoveryKey)
        this.swarm.leave(discoveryKey)
        this.swarm._replicatingFeeds.delete(discoveryKey)
        // Note(dk): should we handle multiple drives?
        // drives.delete(stringKey)
      })
    }

    const datJSON = createDatJSON({
      type,
      title,
      description,
      url: archive.key,
      writable: archive.writable
    })

    // write dat.json
    await writeFile(join(tmp, 'dat.json'), JSON.stringify(datJSON))

    await rename(tmp, join(this.baseDir, hash))

    if (this.verbose) {
      // Note(dk): this kind of output can be part of the cli
      console.log(`Initialized new ${datJSON.type}, dat://${hash}`)
    }
    debug('p2pcommons:init datJSON', datJSON)

    await this.saveItem(datJSON)

    if (this.verbose) {
      console.log(`Saved new ${datJSON.type}, with key: ${hash}`)
    }
    return datJSON
  }

  async saveItem (metadata) {
    debug('p2pcommons:saveItem', metadata)
    assert.strictEqual(typeof metadata, 'object', 'An object is expected')
    assert.strictEqual(
      typeof metadata.type,
      'string',
      'type property is required'
    )

    const db = this._getDb(metadata.type)
    return db.put(metadata.url.toString('hex'), {
      type: this._getAvroTypeName(metadata.type),
      value: metadata
    })
  }

  async set (values) {
    assert.strictEqual(typeof values, 'object', 'values should be an object')
    assert.ok(values.url, 'Invalid metadata. Missing property: url')
    assert.ok(
      values.type.endsWith('profile') || values.type.endsWith('content'),
      "type should be 'content' or 'profile'"
    )

    return this.saveItem(values)
  }

  async get (type, hash) {
    assert.strictEqual(typeof type, 'string', 'type is required')
    assert.strictEqual(typeof hash, 'string', 'hash is required')
    const db = this._getDb(type)
    return db.get(hash)
  }

  async filterExact (feature, criteria) {
    assert.strictEqual(
      typeof feature,
      'string',
      'A valid filter type is required'
    )
    assert.ok(criteria, 'filter criteria is required')
    return new Promise((resolve, reject) => {
      this.by[feature].get(criteria, (err, data) => {
        if (err) return reject(err)

        if (!Array.isArray(data)) return resolve([data])
        return resolve(data)
      })
    })
  }

  async filter (feature, criteria) {
    assert.strictEqual(
      typeof feature,
      'string',
      'A valid filter type is required'
    )
    assert.ok(criteria, 'filter criteria is required')
    return new Promise((resolve, reject) => {
      const out = []
      const criteriaLower = criteria.toLowerCase()
      const s = this.by[feature].createValueStream({
        gte: criteriaLower
      })
      s.on('data', v => {
        if (v[feature] && v[feature].toLowerCase().includes(criteriaLower)) {
          out.push(v)
        }
      })
      s.on('end', () => resolve(out))
      s.on('error', reject)
    })
  }

  async listContent () {
    return new Promise((resolve, reject) => {
      const out = []
      const s = this.contentdb.createValueStream()
      s.on('data', val => {
        if (val.writable) out.push(val)
      })
      s.on('end', () => resolve(out))
      s.on('error', reject)
    })
  }

  async listProfiles () {
    return new Promise((resolve, reject) => {
      const out = []
      const s = this.profiledb.createValueStream()
      s.on('data', val => {
        if (val.writable) out.push(val)
      })
      s.on('end', () => resolve(out))
      s.on('error', reject)
    })
  }

  async openFile (type, key) {
    assert.strictEqual(typeof type, 'string', 'type is required')
    assert.strictEqual(typeof key, 'string', 'key is required')
    const { main } = await this.get(type, key)
    if (!main) {
      throw new Error('Empty main file')
    }
    return open(main)
  }

  async destroy () {
    debug('p2pcommons:destroying swarm')
    if (this.disableSwarm) return
    await this.db.close()
    return this.swarm.close()
  }
}

module.exports = SDK
