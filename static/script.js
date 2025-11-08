document.getElementById('upload').addEventListener('click', ()=>document.getElementById('file').click());
document.getElementById('file').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const fd = new FormData(); fd.append('file', f);
  const res = await fetch('/upload', {method:'POST', body: fd});
  const json = await res.json();
  document.getElementById('queries').value = json.queries.join('\n');
  alert('Uploaded ' + json.count + ' queries');
});
document.getElementById('run').addEventListener('click', async ()=>{
  const uri = document.getElementById('uri').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const delay = parseFloat(document.getElementById('delay').value) || 3;
  const text = document.getElementById('queries').value.trim();
  if(!text) return alert('Paste queries first');
  const queries = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  document.getElementById('logs').innerHTML = '<div class="log-item">Starting...</div>';
  document.getElementById('bar').style.width = '0%';
  const res = await fetch('/run', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({queries, uri, username, password, delay})});
  if(!res.body){ alert('Streaming not supported'); return; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=''; let processed=0;
  async function read(){
    const {done,value} = await reader.read();
    if(done) return;
    buf += dec.decode(value, {stream:true});
    const parts = buf.split('\n\n'); buf = parts.pop();
    for(const part of parts){
      if(!part.startsWith('data:')) continue;
      const payload = part.replace(/^data:\s*/, '');
      try{
        const obj = JSON.parse(payload);
        processed = obj.index || processed;
        const pct = Math.round((processed/queries.length)*100);
        document.getElementById('bar').style.width = pct + '%';
        const div = document.createElement('div'); div.className='log-item';
        div.innerHTML = '<strong>#'+obj.index+'</strong> ' + (obj.status==='success' ? '<span style="color:green">✅</span>' : '<span style="color:red">❌</span>') + '<pre>'+obj.query+'</pre>' + (obj.message?'<div style="color:red">'+obj.message+'</div>':'') + (obj.data?'<pre>'+JSON.stringify(obj.data,null,2)+'</pre>':'');
        document.getElementById('logs').appendChild(div);
        window.scrollTo(0,document.body.scrollHeight);
      }catch(e){ console.error('parse', e); }
    }
    await read();
  }
  read();
});
