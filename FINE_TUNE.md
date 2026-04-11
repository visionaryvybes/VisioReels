# VisioReels — Fine-Tuning & Prompt Engineering Notes

## Current Model
- **Name**: `visio-gemma`
- **Base**: `gemma4:e4b` (Gemma 4 4B via Ollama)
- **System prompt location**: `./Modelfile`
- **Temperature**: 0.85 (creative but not chaotic)
- **top_p**: 0.9
- **Context window**: 8192 tokens

## How to Update the Model

```bash
# 1. Edit Modelfile with your changes
nano ./Modelfile

# 2. Recreate the model
ollama create visio-gemma -f Modelfile

# 3. Test it
ollama run visio-gemma "Generate a TikTok script for a sunset photo. Return JSON only."
```

## Iteration Log

### v1 (2026-04-11) — Baseline social media tuning
- Added platform-specific knowledge (dimensions, duration, tone)
- Added 2026 trend rules (velocity edits, word-by-word captions, ≤5 hashtags)
- Set temperature 0.85 for creativity balance
- **Known gaps**:
  - Needs more Pinterest-specific keyword strategies
  - No trending audio suggestions (needs real-time data)
  - X (Twitter) hooks could be more punchy/controversial

## Prompt Engineering Tips

### Getting Better Hooks
The hook is the most important part. Add to SYSTEM prompt:
```
HOOK FORMULAS (use one per script):
- "POV: [relatable situation]"
- "Nobody talks about [secret/truth]..."
- "This [thing] changed my [life/business/perspective]"
- "Wait for it..." (with something surprising at end)
- "[Number] things I wish I knew before [topic]"
```

### Improving JSON Consistency
If the model returns malformed JSON, add to SYSTEM:
```
CRITICAL: Your entire response must be a single JSON object.
Do not include ```json``` markers. Do not add any text before or after.
Start your response with { and end with }
```

### Platform-Specific Tuning

**TikTok** — needs more colloquial language:
```
TikTok tone: Use "fr fr", "no cap", "lowkey", "it's giving [aesthetic]"
```

**Pinterest** — needs SEO keywords:
```
Pinterest captions must include: long-tail keywords, seasonal terms, 
emotion words (dreamy, cozy, aesthetic), and save-worthy phrases
```

## Next Steps
- [ ] Add real-time trend injection (scrape TikTok trending sounds weekly)
- [ ] A/B testing: generate 3 hook variants, let user pick
- [ ] Platform-specific fine-tunes once Gemma fine-tuning via Ollama is stable
- [ ] Upgrade to 26B A4B model when user gets ≥32GB RAM
- [ ] RAG layer: feed in user's past top-performing posts for style matching
