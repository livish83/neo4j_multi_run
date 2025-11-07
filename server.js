import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import neo4j from "neo4j-driver";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 5040;

// SSE route for live streaming
app.post("/run-live", async (req, res) => {
  const { queries, uri, username, password } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const driver = neo4j.driver(
    uri || process.env.NEO4J_URI,
    neo4j.auth.basic(username || process.env.NEO4J_USER, password || process.env.NEO4J_PASS)
  );
  const session = driver.session();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const result = await session.run(query);
      const data = result.records.map((r) => r.toObject());
      res.write(`data: ${JSON.stringify({ index: i + 1, query, status: "success", data })}\n\n`);
      console.log(`✅ Query ${i + 1} executed successfully`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ index: i + 1, query, status: "error", message: err.message })}\n\n`);
      console.log(`❌ Query ${i + 1} failed: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3s
  }

  await session.close();
  await driver.close();
  res.write("data: [DONE]\n\n");
  res.end();
});

app.listen(PORT, () => console.log(`🚀 Live server running on http://localhost:${PORT}`));
