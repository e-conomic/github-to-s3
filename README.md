# github-to-s3

Download a repo, build it and upload it to s3

```
npm install github-to-s3
```

## Usage

``` js

var githubToS3 = require('github-to-s3')

githubToS3({
  prefix: 'prefix-s3-folder-with-me'
  github: {
    token: 'oauthtoken-if-repo-is-private',
    repo: 'e-conomic/github-to-s3'
  },
  s3: {
    key: 'some-access-key-id',
    secret: 'some-secret-key',
    bucket: 'some-bucket'
  }
}, function(err) {
  console.log('i have been uploaded to s3')
})

```

## CLI

```
npm install -g github-to-s3
github-to-s3 # will print help
```


## License

MIT