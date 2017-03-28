var fs = require('fs')
var path = require('path')
var xtend = require('xtend')
var mkdirp = require('mkdirp')
var hyperdrive = require('hyperdrive')
var network = require('hyperdiscovery')
var ram = require('random-access-memory')
var mirror = require('mirror-folder')
var count = require('count-files')
var datIgnore = require('dat-ignore')
var debug = require('debug')('dat')

module.exports = run

function run (src, dest, opts, cb) {
  var key
  if (dest) {
    key = src
    src = null
  }

  var archive = hyperdrive(storage(), key, opts)
  archive.on('ready', function () {
    var progress = importFiles()
    var swarm = joinNetwork()
    cb(archive, swarm, progress)
  })

  function storage () {
    if (!opts.sleep) return ram
    if (typeof opts.sleep === 'string') return opts.sleep
    if (!src) return path.join(dest, '.dat') // TODO: if dest is file

    var isDir = fs.statSync(src).isDirectory()
    if (isDir) return path.join(src, '.dat')
    return cb(new Error('Specify dir for sleep files: --sleep <dir>'))
  }

  function importFiles () {
    if (!archive.metadata.writable) return
    var progress
    var ignore = datIgnore(src)

    progress = mirror(src, {name: '/', fs: archive}, {
      ignore: ignore
    })

    progress.on('error', function (err) {
      debug('IMPORT ERROR:', err)
    })

    count(src, { ignore: ignore }, function (err, data) {
      if (err) return progress.emit('error', err)
      progress.emit('count', data)
    })

    return progress
  }

  function joinNetwork () {
    var swarm = network(archive, xtend({
      stream: function (peer) {
        var stream = archive.replicate({
          live: !archive.metadata.writable && opts.sync
        })
        stream.on('error', function (err) {
          debug('Replication error:', err.message)
        })
        stream.on('end', function () {
          archive.downloaded = true
        })
        return stream
      }
    }, opts))
    return swarm
  }
}