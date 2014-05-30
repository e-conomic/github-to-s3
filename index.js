var request = require('request')
var tar = require('tar-fs')
var zlib = require('zlib')
var pump = require('pump')
var os = require('os')
var fs = require('fs')
var ignore = require('ignore-file')
var rimraf = require('rimraf')
var path = require('path')
var proc = require('child_process')

var noop = function() {}

var map = function(header) {
  header.name = header.name.slice(header.name.indexOf('/')+1)
  return header
}

var parseGithub = function(github) {
  if (typeof github === 'object') return github
  github = github.split('/')
  return {
    username:github[0],
    repository:github[1].split('#')[0],
    checkout:github[1].split('#')[1]
  }
}

var walk = function(base, filter, visit, cb) {
  if (!cb) cb = noop

  var each = function(file, cb) {
    if (filter(file.slice(base.length+1))) return cb()

    fs.stat(file, function(err, stat) {
      if (err) return cb(err)
      if (!stat.isDirectory()) return visit(file, cb)

      fs.readdir(file, function(err, files) {
        if (err) return cb(err)

        var loop = function(err) {
          if (err) return cb(err)
          var f = files.shift()
          if (!f) return cb()
          each(path.join(file, f), loop)
        }

        loop()
      })
    })
  }

  each(base, cb)
}

module.exports = function(opts, cb) {
  if (!opts.github) throw new Error('options.github is required')
  if (!cb) cb = noop

  var github = parseGithub(opts.github)
  var folder = path.join(os.tmpDir(), 'github-to-s3', github.username+'-'+github.repository)

  var upload = function(file, cb) {
    var name = file.slice(folder.length+1)
    console.log(name, '<--')
    cb()
  }

  var onextract = function(err) {
    if (err) return cb(err)

    var install = function(next) {
      if (opts.install === false) return next()
      proc.exec(opts.install || 'npm install --production', {cwd:folder}, next)
    }

    var build = function(next) {
      if (opts.build === false) return next()
      proc.exec(opts.install || 'npm run build', {cwd:folder}, next)
    }

    install(function(err) {
      if (err) return cb(err)
      build(function(err) {
        if (err) return cb(err)

        folder = path.join(folder, opts.folder || '.')
        ignore(path.join(folder, '.deployignore'), function(err, filter) {
          if (err) return cb(err)
          walk(folder, filter || ignore.compile('node_modules'), upload, cb)
        })
      })
    })
  }

  rimraf(folder, function() {
    pump(
      request('https://github.com/'+github.username+'/'+github.repository+'/archive/'+(github.checkout || 'master')+'.tar.gz'),
      zlib.createGunzip(),
      tar.extract(folder, {map:map}),
      onextract
    )
  })
}

if (require.main !== module) return

module.exports({
  install: 'npm-buildpack',
  github: {
    username: 'e-conomic',
    repository: 'git-fork'
  },
  s3: {
    access: '...',
    secret: '...',
    bucket: 'mathiasbuus'
  }
})