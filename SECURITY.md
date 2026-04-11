# VisioReels — Security Notes

## Privacy First: 100% Local AI

### Data Handling
- All AI processing is **LOCAL** — no data sent to any cloud service
- Images never leave the Mac — base64 stays in memory, never persisted
- Ollama runs on `localhost:11434` — **not** exposed to external networks
- No API keys stored anywhere in this project
- `.env.local` excluded from git via `.gitignore`
- `/tmp` output files excluded from git

### Ollama Security
- Ollama binds to `127.0.0.1` by default — only local access
- Do NOT set `OLLAMA_HOST=0.0.0.0` unless behind a firewall
- Model weights stored in `~/.ollama/models` — local filesystem only

### Network Boundaries
```
User Browser → localhost:3000 (Next.js)
Next.js API  → localhost:11434 (Ollama)
Ollama       → ~/.ollama/models (local disk)

Nothing → Internet (zero external calls)
```

### Future Cloud Deployment
If deploying to cloud (Vercel + Groq API):
- Store `GROQ_API_KEY` in Vercel environment variables only
- Never commit keys to git
- Enable Vercel's "Encrypted at rest" for env vars
- Use Vercel Edge Network for API routes (no persistent server)
- Rate-limit `/api/generate` and `/api/render` per IP

### File Permissions
```bash
chmod 600 .env.local        # owner read/write only
chmod 700 scripts/setup.sh  # owner execute only
```
