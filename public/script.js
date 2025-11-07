document.getElementById("uploadBtn").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/upload-queries", { method: "POST", body: fd });
  const json = await res.json();
  if (json.queries) {
    document.getElementById("queries").value = json.queries.join("\n");
    alert(`Uploaded ${json.count} queries`);
  }
});

document.getElementById("runBtn").addEventListener("click", async () => {
  const uri = document.getElementById("uri").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const text = document.getElementById("queries").value.trim();
  if (!text) return alert("Please paste or upload queries first.");

  const queries = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const payload = { queries, batchSize: 50000, microSize: 100, delayMs: 500 };

  document.getElementById("logArea").innerHTML = "<p>Starting...</p>";
  document.getElementById("latest").innerHTML = "";
  document.getElementById("fullLogLink").innerHTML = "";
  const prog = document.getElementById("prog");

  const response = await fetch("/run-live-fast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.body) { document.getElementById("logArea").innerText = "Streaming not supported."; return; }

  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let total = queries.length;
  let processed = 0;

  async function read() {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += dec.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (!part.startsWith("data:")) continue;
      const jsonStr = part.replace(/^data:\s*/, "");
      if (!jsonStr) continue;
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.type === "micro-batch") {
          processed = obj.processed;
          const pct = Math.round((processed/total)*100);
          prog.style.width = pct+"%";
          prog.innerText = pct+"%";
          const la = document.getElementById("logArea");
          la.insertAdjacentHTML("beforeend", `<div class="small">Micro ${obj.logicalBatch}.${obj.microBatch}/${obj.logicalBatches}.${obj.microBatches} — processed ${obj.processed}/${obj.total}</div>`);
        } else if (obj.type === "latest") {
          const latest = document.getElementById("latest");
          latest.innerHTML = "";
          for (const item of obj.lastResults) {
            const el = document.createElement("div");
            el.className = "border rounded p-2 mb-2";
            el.innerHTML = `<strong>#${item.index} ${item.status==='success'?'✅':'❌'}</strong><pre>${item.query}</pre>${item.data?'<pre style="background:#222;color:#fff;padding:8px;border-radius:4px">'+JSON.stringify(item.data,null,2)+'</pre>':''}${item.message?'<div class="text-danger small">'+item.message+'</div>':''}`;
            latest.appendChild(el);
          }
        } else if (obj.type === "logical-complete") {
          const la = document.getElementById("logArea");
          la.insertAdjacentHTML("beforeend", `<div class="text-success">Logical batch ${obj.logicalBatch}/${obj.logicalBatches} complete — processed ${obj.processed}/${obj.total}</div>`);
        } else if (obj.type === "done") {
          prog.style.width = "100%"; prog.innerText = "100%";
          document.getElementById("logArea").insertAdjacentHTML("beforeend", `<div class="fw-bold">Done: ${obj.total} queries. <a href="${obj.logUrl}" target="_blank">Download full log</a></div>`);
          document.getElementById("fullLogLink").innerHTML = `<a href="${obj.logUrl}" class="btn btn-sm btn-outline-primary" target="_blank">Download Full Log</a>`;
        } else if (obj.type === "error") {
          document.getElementById("logArea").insertAdjacentHTML("beforeend", `<div class="text-danger">Error: ${obj.message}</div>`);
        }
      } catch (e) {
        console.error("Parse error", e);
      }
    }
    await read();
  }

  read();
});
