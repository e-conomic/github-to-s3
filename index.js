var request = require('request')
var tar = require('tar-fs')
var zlib = require('zlib')
var pump = require('pump')
var os = require('os')
var fs = require('fs')
var ignore = require('ignore-file')
var rimraf = require('rimraf')
var path = require('path')
var mime = require('mime-types')
var proc = require('child_process')
var debug = require('debug')('github-to-s3')

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
  var user = github.user || github.username
  var repo = github.repo || github.repository

  if (repo.indexOf('/') === -1) repo = user+'/'+repo

  var folder = path.join(os.tmpDir(), 'github-to-s3', repo.replace(/\//g, '-'))

  var upload = function(file, cb) {
    var name = file.slice(folder.length+1)
    if (opts.prefix) name = opts.prefix+'/'+name
    name = name.replace(/\\/g, '/')

    var onresponse = function(err, response) {
        if (err) return cb(err)
        if (response.statusCode !== 200) return cb(new Error('bad status code: '+response.statusCode))
        cb()
    }

    fs.stat(file, function(err, st) {
      if (err) return cb(err)

      var headers = {'Content-Length':st.size}
      if (mime.lookup(name)) headers['Content-Type'] = mime.lookup(name)

      var req = {
        url: 'https://'+opts.s3.bucket+'.s3.amazonaws.com/'+name,
        headers: headers,
        aws: opts.s3
      }

      debug('uploading '+name+' to '+req.url)

      pump(
        fs.createReadStream(file),
        request.put('https://'+opts.s3.bucket+'.s3.amazonaws.com/'+name, req, onresponse)
      )
    })
  }

  var onextract = function(err) {
    if (err) return cb(err)

    debug('tarball extracted')

    var install = function(next) {
      if (opts.install === false) return next()
      debug('installing project')
      proc.exec(opts.install || 'npm install --production', {cwd:folder}, next)
    }

    var build = function(next) {
      if (opts.build === false) return next()
      debug('building project')
      proc.exec(opts.build || 'npm run build', {cwd:folder}, next)
    }

    install(function(err) {
      if (err) return cb(err)
      build(function(err) {
        if (err) return cb(err)

        folder = path.join(folder, opts.folder || '.')
        ignore(path.join(folder, '.deployignore'), function(err, filter) {
          if (err) return cb(err)
          debug('uploading project to s3 ('+opts.s3.bucket+')')
          walk(folder, filter || ignore.compile('node_modules'), upload, cb)
        })
      })
    })
  }

  var auth = opts.github.token ? opts.github.token+':x-oauth-basic@' : ''
  var url = 'https://'+auth+'github.com/'+repo+'/archive/'+(github.checkout || 'master')+'.tar.gz'

  rimraf(folder, function() {
    debug('fetching '+url)

    pump(
      request(url),
      zlib.createGunzip(),
      tar.extract(folder, {map:map}),
      onextract
    )
  })
}