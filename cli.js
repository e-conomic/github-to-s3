#!/usr/bin/env node

var ghauth = require('ghauth')
var awsauth = require('awsauth')
var minimist = require('minimist')
var githubToS3 = require('./')

var argv = minimist(process.argv)

if (argv._.length < 4) {
  console.error('Usage: github-to-s3 username/project bucket[/prefix]? [options]')
  console.error()
  console.error(' --install,  -i  to set install command       [npm install]')
  console.error(' --build,    -b  to set build command         [npm run build]')
  console.error(' --checkout, -c  to set the tag to use        [master]')
  console.error(' --folder,   -f  to set the folder to upload  [.]')
  console.error()
  process.exit(1)
}

var bucket = argv._[3]
var repo = argv._[2]
var prefix = ''

if (bucket.indexOf('/') > -1) {
  prefix = bucket.split('/')[1]
  bucket = bucket.split('/')[0]
}


var onerror = function(err) {
  if (err) throw err
}

ghauth({configName: 'github-to-s3', scopes:['repo'], note:'This is for github-to-s3'}, function(err, github) {
  if (err) return onerror(err)

  awsauth({profile: 'github-to-s3'}, function(err, aws) {
    if (err) return onerror(err)

    var opts = {}

    opts.folder = argv.folder || argv.f
    opts.install = argv.install || argv.i
    opts.build = argv.build || argv.b
    opts.checkout = argv.checkout || argv.c
    opts.prefix = prefix

    opts.github = github
    opts.s3 = aws
    opts.s3.bucket = bucket
    opts.github.repo = repo

    githubToS3(opts, function(err) {
      if (err) throw err
      console.log(repo+' build and uploaded to https://'+opts.s3.bucket+'s3.amazonaws.com/'+prefix)
    })
  })
})