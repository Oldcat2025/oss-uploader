const http = require('http');
const crypto = require('crypto');
const OSS = require('ali-oss');

const AK = process.env.OSS_ACCESS_KEY_ID || '';
const SK = process.env.OSS_ACCESS_KEY_SECRET || '';
const BUCKET = process.env.OSS_BUCKET || '';
const REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';
const TOKEN = process.env.UPLOAD_TOKEN || '';

if (!AK || !SK || !BUCKET) {
  console.error('缺少 OSS 凭证：请设置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET');
  process.exit(1);
}

const client = new OSS({
  accessKeyId: AK,
  accessKeySecret: SK,
  bucket: BUCKET,
  region: REGION,
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bucket: BUCKET }));
    return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    if (TOKEN) {
      const auth = req.headers['authorization'] || '';
      if (auth !== 'Bearer ' + TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const p = JSON.parse(body || '{}');
        let b64 = String(p.base64 || '');
        if (!b64) throw new Error('base64 不能为空');
        const m = b64.match(/^data:([^;]+);base64,([\s\S]*)$/);
        let mime = 'image/png';
        if (m) { mime = m[1]; b64 = m[2]; }
        const buf = Buffer.from(b64, 'base64');
        const dir = String(p.dir || 'assets').replace(/^\/+|\/+$/g, '') || 'assets';
        let ext = (mime.split('/')[1] || 'png').toLowerCase();
        if (ext === 'jpeg') ext = 'jpg';
        const filename = String(p.filename || (Date.now() + '-' + crypto.randomBytes(6).toString('hex'))) + '.' + ext;
        const key = dir + '/' + filename;
        const r = await client.put(key, buf, { mime });
        const url = 'https://' + BUCKET + '.' + REGION + '.aliyuncs.com/' + key;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, key, url, size: buf.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => console.log('OSS uploader listening on ' + PORT));
