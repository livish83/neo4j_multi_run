import os
import asyncio
import json
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader, select_autoescape
from neo4j import AsyncGraphDatabase, exceptions as neo4j_exceptions

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), 'templates')
env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(['html','xml']))

app = FastAPI()
app.mount('/static', StaticFiles(directory='static'), name='static')

# Simple index page
@app.get('/', response_class=HTMLResponse)
async def index():
    tpl = env.get_template('index.html')
    return tpl.render()

# Upload txt file with queries (one per line)
@app.post('/upload')
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode('utf-8', errors='replace')
    queries = [q.strip() for q in text.splitlines() if q.strip()]
    return {'count': len(queries), 'queries': queries}

def create_driver(uri, user, pwd):
    # auto-detect secure URI: if startswith neo4j+s or bolt+s -> do not override encryption
    if uri.startswith('neo4j+s://') or uri.startswith('bolt+s://'):
        return AsyncGraphDatabase.driver(uri, auth=(user, pwd))
    # otherwise, disable encryption for local/unsecured instances
    return AsyncGraphDatabase.driver(uri, auth=(user, pwd), encrypted=False)

async def run_queries_stream(queries, uri, user, pwd, per_query_delay=3.0):
    # create driver
    driver = create_driver(uri, user, pwd)
    try:
        async with driver:
            async with driver.session() as session:
                total = len(queries)
                for i, q in enumerate(queries, start=1):
                    payload = {'index': i, 'query': q}
                    try:
                        # Run the query (async)
                        result = await session.run(q)
                        # collect results (to_list)
                        records = await result.to_list()
                        data = [r.data() for r in records]
                        payload.update({'status': 'success', 'data': data})
                    except Exception as e:
                        # If connection error for first query, include message and yield then continue
                        payload.update({'status': 'error', 'message': str(e)})
                        # If it's a Neo4j connection problem, we still wait and then continue attempts for next queries
                    # Stream the payload as SSE data event
                    yield f"data: {json.dumps(payload)}\n\n"
                    # wait per-query delay
                    await asyncio.sleep(per_query_delay)
    finally:
        try:
            await driver.close()
        except:
            pass

@app.post('/run', response_class=StreamingResponse)
async def run(request: Request):
    body = await request.json()
    queries = body.get('queries', [])
    uri = body.get('uri') or os.getenv('NEO4J_URI', 'bolt://localhost:7687')
    user = body.get('username') or os.getenv('NEO4J_USER', 'neo4j')
    pwd = body.get('password') or os.getenv('NEO4J_PASS', 'password')
    delay = float(body.get('delay', 3.0))
    generator = run_queries_stream(queries, uri, user, pwd, per_query_delay=delay)
    return StreamingResponse(generator, media_type='text/event-stream')

# Download example file or template
@app.get('/example.txt')
async def example_file():
    path = os.path.join(os.path.dirname(__file__), 'templates', 'example.txt')
    return FileResponse(path, media_type='text/plain', filename='example.txt')
