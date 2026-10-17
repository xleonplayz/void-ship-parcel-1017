import http from 'node:http';

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Harbor Parcel</title><link rel="stylesheet" href="/style.css"></head><body><main><p class="brand">HARBOR / PARCEL</p><h1>Versand planen.</h1><p>Gewicht und Anzahl eingeben. Der Tarifdienst berechnet Versand und Steuer.</p><section><form id="quote"><label>Ziel<select id="zone"><option value="de">Deutschland</option><option value="eu">EU</option></select></label><label>Gewicht je Paket (g)<input id="grams" type="number" min="1" max="30000" value="1200" required></label><label>Pakete<input id="quantity" type="number" min="1" max="100" value="2" required></label><button>Versand berechnen</button></form><output id="result" aria-live="polite">Bereit für ein Angebot.</output><p id="version"></p></section><section><h2>Mehrere Sendungen</h2><p>CSV: Ziel, Gramm, Anzahl — eine Sendung pro Zeile.</p><textarea id="csv" rows="3">de,1200,2\neu,500,1</textarea><button id="batch">Liste berechnen</button><output id="batch-result" aria-live="polite"></output></section><footer>Demotarife · keine Bestellung oder Zahlung</footer></main><script src="/app.js"></script></body></html>`;
const css = 'body{margin:0;background:#eef3ec;color:#173c32;font:18px system-ui}main{max-width:850px;margin:6vh auto;padding:24px}.brand{letter-spacing:.15em;font-size:14px}h1{font-size:54px;margin-bottom:12px}section{background:white;padding:28px;border-radius:18px;margin:24px 0}form{display:flex;gap:16px;flex-wrap:wrap;align-items:end}label{display:grid;gap:8px}input,select,textarea,button{font:inherit;padding:12px;border:1px solid #b5cbbd;border-radius:7px}input{max-width:160px}button{background:#21664f;color:white;cursor:pointer}textarea{display:block;box-sizing:border-box;width:100%;margin-bottom:12px}output{display:block;white-space:pre-wrap;margin-top:20px;font-weight:600}footer,#version{font-size:14px;color:#536b62}';
const js = `const money=n=>(n/100).toFixed(2).replace('.',',')+' €';async function request(path,options){const r=await fetch(path,options);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'HTTP '+r.status);return d;}document.querySelector('#quote').addEventListener('submit',async e=>{e.preventDefault();const out=document.querySelector('#result');out.textContent='Berechne …';try{const zone=document.querySelector('#zone').value;const grams=document.querySelector('#grams').value;const quantity=document.querySelector('#quantity').value;const d=await request('/api/quote/'+zone+'/'+grams+'/'+quantity);out.textContent=money(d.totalCents)+' gesamt · '+money(d.taxCents)+' Steuer';document.querySelector('#version').textContent='Tarifversion '+d.release;}catch(e){out.textContent='Fehler: '+e.message;}});document.querySelector('#batch').addEventListener('click',async()=>{const out=document.querySelector('#batch-result');try{const d=await request('/api/batch',{method:'POST',headers:{'content-type':'text/plain'},body:document.querySelector('#csv').value});out.textContent=d.count+' Sendungen · '+money(d.totalCents)+' gesamt';}catch(e){out.textContent='Fehler: '+e.message;}});`;

http.createServer(async (req, res) => {
  console.info('parcel-desk', req.method, req.url);
  const staticRoutes = {'/': ['text/html;charset=utf-8', html], '/style.css': ['text/css', css], '/app.js': ['application/javascript', js]};
  if (req.method === 'GET' && staticRoutes[req.url]) {
    const [type, body] = staticRoutes[req.url]; res.writeHead(200, {'content-type': type}); res.end(body); return;
  }
  if (req.url === '/health') { res.writeHead(200, {'content-type': 'application/json'}); res.end('{"ok":true,"service":"parcel-desk","release":1}'); return; }
  if (req.url.startsWith('/api/')) {
    try {
      if (!process.env.TARIFF_URL) { res.writeHead(503, {'content-type':'application/json'}); res.end('{"ok":false,"error":"tariff URL not configured"}'); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      const upstream = await fetch(process.env.TARIFF_URL + req.url.slice(4), {method: req.method, headers: {'content-type': 'text/plain'}, body: req.method === 'POST' ? body : undefined});
      const data = await upstream.json();
      res.writeHead(upstream.ok ? (data.ok ? 200 : 422) : 502, {'content-type': 'application/json', 'x-parcel-hop': 'desk-to-rust'});
      res.end(JSON.stringify(data)); return;
    } catch (error) { res.writeHead(502, {'content-type': 'application/json'}); res.end(JSON.stringify({ok: false, error: 'tariff unavailable', detail: String(error)})); return; }
  }
  res.writeHead(404, {'content-type': 'application/json'}); res.end('{"ok":false,"error":"not found"}');
}).listen(Number(process.env.PORT || 3230), '0.0.0.0');
