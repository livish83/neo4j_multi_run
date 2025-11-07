document.getElementById("runBtn").addEventListener("click", async () => {
  const uri = document.getElementById("uri").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const queryText = document.getElementById("queries").value.trim();
  const queries = queryText
    .split(/;\s*\n?|\n{2,}/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  document.getElementById("status").innerHTML = "<p>Running queries live...</p>";

  const response = await fetch("/run-live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uri, username, password, queries })
  });

  if (!response.body) {
    document.getElementById("status").innerHTML = "Streaming not supported.";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function readStream() {
    const { done, value } = await reader.read();
    if (done) return;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();

    parts.forEach((part) => {
      if (part.startsWith("data:")) {
        const jsonStr = part.replace(/^data:\s*/, "");
        if (jsonStr === "[DONE]") return;
        const data = JSON.parse(jsonStr);
        const container = document.getElementById("status");

        const html = `<div class="p-3 border rounded mb-3 ${data.status === "success" ? "bg-success-subtle" : "bg-danger-subtle"}">
          <strong>Query ${data.index}:</strong> ${data.status === "success" ? "✅ Success" : "❌ Error"}<br>
          <pre>${data.query}</pre>
          ${data.data ? `<pre class='bg-dark text-light p-2 rounded'><code>${JSON.stringify(data.data, null, 2)}</code></pre>` : ""}
          ${data.message ? `<small>${data.message}</small>` : ""}
        </div>`;
        container.insertAdjacentHTML("beforeend", html);
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    await readStream();
  }

  readStream();
});
