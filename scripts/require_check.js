// Quick module require check for syntax errors
const paths = [
  '../extension.js',
  '../ui/webviewProvider.js',
  '../modes/legacy.js',
  '../tools/writefile.js',
  '../ui/webview-client.js'
];
for (const p of paths) {
  try {
    console.log('Requiring', p);
    require(p);
    console.log('OK:', p);
  } catch (err) {
    console.error('ERROR requiring', p, err && err.stack ? err.stack : err);
    process.exitCode = 2;
  }
}
console.log('Require check complete');
