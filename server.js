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

// Run bulk Neo4j queries sequentially with 3s delay
app.post("/run-bulk", async (req, res) => {
  const { queries, uri, username, password } = req.body;
  const driver = neo4j.driver(
    uri || process.env.NEO4J_URI,
    neo4j.auth.basic(username || process.env.NEO4J_USER, password || process.env.NEO4J_PASS)
  );
  const session = driver.session();

  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const result = await session.run(query);
      const data = result.records.map((record) => record.toObject());
      results.push({ query, status: "success", data });
      console.log(`✅ Query ${i + 1} executed successfully`);
    } catch (err) {
      results.push({ query, status: "error", message: err.message });
      console.log(`❌ Query ${i + 1} failed: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 sec delay
  }

  await session.close();
  await driver.close();
  res.json(results);
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
