document.getElementById("runBtn").addEventListener("click", async () => {
  const uri = document.getElementById("uri").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const queryText = document.getElementById("queries").value.trim();
  const queries = queryText
    .split(/;\s*\n?|\n{2,}/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  document.getElementById("status").innerHTML = "<p>Running queries...</p>";

  const response = await fetch("/run-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uri, username, password, queries }),
  });

  const result = await response.json();
  const html = result
    .map((r, i) => {
      const dataHtml = r.data
        ? `<pre class='bg-dark text-light p-2 rounded'><code>${JSON.stringify(r.data, null, 2)}</code></pre>`
        : "";
      const msg = r.message ? `<div><small>${r.message}</small></div>` : "";
      return `<div class="p-3 border rounded mb-3 ${r.status === "success" ? "bg-success-subtle" : "bg-danger-subtle"}">
                <strong>Query ${i + 1}:</strong> ${r.status === "success" ? "✅ Success" : "❌ Error"}
                <pre>${r.query}</pre>
                ${dataHtml}
                ${msg}
              </div>`;
    })
    .join("");
  document.getElementById("status").innerHTML = html;
});
