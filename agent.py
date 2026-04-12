#!/usr/bin/env python3
"""
VisioReels Agent — Gemma 4 powered Remotion co-pilot.

Replicates the remotion-dev/skills + Claude Code workflow locally.
Zero cloud calls. Zero cost. No limits.

Usage:
    python3 agent.py

Then just prompt naturally:
    > Create a 3-second logo reveal for VisioReels with spring animations
    > Make the text slide in from the bottom with perspective
    > Render the TikTok composition
"""

import json
import os
import re
import subprocess
import sys
import textwrap

import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL  = "http://localhost:11434/api/chat"
MODEL       = "gemma4:e4b"
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
CONTEXT_WINDOW = 8192

# ── Remotion System Prompt ────────────────────────────────────────────────────
# Sourced from github.com/remotion-dev/skills — skills/remotion/SKILL.md + rules/

SYSTEM_PROMPT = """
You are a Remotion video-creation agent. You help the user build high-quality
programmatic videos using React and Remotion by reading and editing TypeScript
files directly, running shell commands, and iterating based on feedback.

The project is at: """ + PROJECT_DIR + """

## Workflow
1. Read existing files before editing them.
2. Write or update TSX/TS files in the remotion/ directory.
3. After every code change, run: npm run still -- --composition=<id> --frame=30 --scale=0.25
   to validate without a full render.
4. Run `npm run studio` to launch the live preview server (port 3000).
5. Run `npm run render -- --composition=<id> --output=out/<name>.mp4` to produce the final MP4.
6. Always tell the user what you changed and what to look for in the preview.

## Core Remotion Principles

### Animations
- ALL animations MUST be driven by `useCurrentFrame()`.
- Import: `import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";`
- Express durations in seconds, multiply by fps to get frames:
  ```tsx
  const { fps } = useVideoConfig();
  const DURATION = 2 * fps; // 2 seconds
  ```
- Use `interpolate` with explicit ranges and Easing.bezier:
  ```tsx
  const opacity = interpolate(frame, [0, DURATION], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  ```
- Easing presets:
  - Crisp entrance: `Easing.bezier(0.16, 1, 0.3, 1)`
  - Editorial fade:  `Easing.bezier(0.45, 0, 0.55, 1)`
  - Playful overshoot: `Easing.bezier(0.34, 1.56, 0.64, 1)`
  - Enter animations: `Easing.out(Easing.cubic)`
  - Exit animations:  `Easing.in(Easing.cubic)`
- Springs for physical motion:
  ```tsx
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  ```
- FORBIDDEN: CSS transitions, CSS animations, Tailwind animation classes — they will NOT render.

### Compositions (src/Root.tsx or remotion/Root.tsx)
- Define in Root.tsx using `<Composition>`:
  ```tsx
  <Composition
    id="MyVideo"
    component={MyComponent}
    durationInFrames={150}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ title: "Hello" }}
  />
  ```
- Use `<Still>` for single-frame images (no durationInFrames/fps needed).
- Use `<Folder>` to group compositions in the studio sidebar.

### Sequencing
- Use `<Sequence from={N} durationInFrames={M}>` to time elements:
  ```tsx
  <Sequence from={0} durationInFrames={30} premountFor={20}>
    <Title />
  </Sequence>
  <Sequence from={25} durationInFrames={60}>
    <Body />
  </Sequence>
  ```
- `useCurrentFrame()` inside a Sequence returns RELATIVE frames (starts at 0).
- Use `<Series>` to lay out scenes back-to-back without manual frame math.
- Always use `premountFor` to pre-load media before it appears.
- `layout="none"` prevents the default AbsoluteFill wrapper.

### Timing
- Single normalized progress value, derive multiple props from it:
  ```tsx
  const progress = interpolate(frame, [0, fps * 1.5], [0, 1], { extrapolateRight: "clamp" });
  const opacity = progress;
  const translateY = interpolate(progress, [0, 1], [40, 0]);
  const scale = interpolate(progress, [0, 1], [0.9, 1]);
  ```

### Transitions (@remotion/transitions)
- Install if needed: `npx remotion add @remotion/transitions`
- Use `<TransitionSeries>` for scene-to-scene effects:
  ```tsx
  import { TransitionSeries, springTiming } from "@remotion/transitions";
  import { fade } from "@remotion/transitions/fade";

  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={60}>
      <SceneA />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 } })} />
    <TransitionSeries.Sequence durationInFrames={60}>
      <SceneB />
    </TransitionSeries.Sequence>
  </TransitionSeries>
  ```
- Available presentations: `fade`, `slide`, `wipe`, `flip`, `clockWipe`
- Transitions SHORTEN total duration (both scenes overlap during transition).

### Text Animations
- Typewriter: use string slicing on frame, NEVER per-character opacity:
  ```tsx
  const chars = Math.floor(interpolate(frame, [0, fps * 2], [0, text.length], { extrapolateRight: "clamp" }));
  return <div>{text.slice(0, chars)}</div>;
  ```
- Word-by-word reveal: map over words, each gets its own spring.

### Fonts
- Google Fonts:
  ```tsx
  import { loadFont } from "@remotion/google-fonts/Inter";
  const { fontFamily } = loadFont();
  ```
- Local fonts (from public/):
  ```tsx
  import { loadFont } from "@remotion/fonts";
  import { staticFile } from "remotion";
  await loadFont({ family: "MyFont", url: staticFile("MyFont.woff2") });
  ```

### Layout helpers
- `<AbsoluteFill>` = `position: absolute; top:0; left:0; right:0; bottom:0`
- Always use it as the outermost wrapper in compositions.

### Validation commands
- Preview single frame: `npm run still -- --composition=<id> --frame=30 --scale=0.25`
- Live preview:        `npm run studio`
- Render to MP4:       `npm run render -- --composition=<id> --output=out/<name>.mp4`

## Existing Compositions in This Project
- SocialReel-tiktok   (1080×1920, 30fps, 450 frames)
- SocialReel-reels    (1080×1920, 30fps, 450 frames)
- SocialReel-shorts   (1080×1920, 30fps, 450 frames)
- SocialReel-pinterest(1000×1500, 30fps, 300 frames)
- SocialReel-x        (1280×720, 30fps, 270 frames)

## Tool Usage Format
When you need to take an action, output it in this exact format:

<tool>read_file</tool>
<path>remotion/compositions/SocialReel.tsx</path>

<tool>write_file</tool>
<path>remotion/compositions/MyVideo.tsx</path>
<content>
// file content here
</content>

<tool>run_command</tool>
<cmd>npm run still -- --composition=SocialReel-tiktok --frame=30 --scale=0.25</cmd>

<tool>list_files</tool>
<path>remotion/</path>

After every tool call, wait for the result before continuing.
When your task is complete, summarize what you built and what command the user should run next.
""".strip()

# ── Tool Executor ─────────────────────────────────────────────────────────────

def read_file(path: str) -> str:
    full = os.path.join(PROJECT_DIR, path) if not os.path.isabs(path) else path
    try:
        with open(full) as f:
            return f.read()
    except FileNotFoundError:
        return f"ERROR: file not found: {full}"

def write_file(path: str, content: str) -> str:
    full = os.path.join(PROJECT_DIR, path) if not os.path.isabs(path) else path
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)
    return f"Written: {full}"

def run_command(cmd: str) -> str:
    result = subprocess.run(
        cmd, shell=True, cwd=PROJECT_DIR,
        capture_output=True, text=True, timeout=120
    )
    out = (result.stdout + result.stderr).strip()
    return out[:3000] if len(out) > 3000 else out  # cap at 3k chars

def list_files(path: str) -> str:
    full = os.path.join(PROJECT_DIR, path) if not os.path.isabs(path) else path
    lines = []
    for root, dirs, files in os.walk(full):
        dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", ".next", "out"}]
        level = root.replace(full, "").count(os.sep)
        indent = "  " * level
        lines.append(f"{indent}{os.path.basename(root)}/")
        for f in files:
            lines.append(f"{indent}  {f}")
    return "\n".join(lines)

def execute_tool(tool: str, attrs: dict) -> str:
    if tool == "read_file":
        return read_file(attrs.get("path", ""))
    elif tool == "write_file":
        return write_file(attrs.get("path", ""), attrs.get("content", ""))
    elif tool == "run_command":
        return run_command(attrs.get("cmd", ""))
    elif tool == "list_files":
        return list_files(attrs.get("path", "."))
    return f"Unknown tool: {tool}"

def parse_tools(text: str) -> list[dict]:
    """Extract all tool calls from Gemma's response."""
    calls = []
    pattern = re.compile(
        r"<tool>(.*?)</tool>(.*?)(?=<tool>|$)",
        re.DOTALL
    )
    for m in pattern.finditer(text):
        tool_name = m.group(1).strip()
        body = m.group(2)
        attrs = {}

        for tag in ["path", "cmd", "content"]:
            tag_m = re.search(rf"<{tag}>(.*?)</{tag}>", body, re.DOTALL)
            if tag_m:
                attrs[tag] = tag_m.group(1).strip()

        calls.append({"tool": tool_name, "attrs": attrs})
    return calls

# ── Ollama Client ─────────────────────────────────────────────────────────────

def chat(messages: list[dict]) -> str:
    payload = json.dumps({
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_ctx": CONTEXT_WINDOW,
        }
    }).encode()

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data["message"]["content"]
    except urllib.error.URLError as e:
        return f"ERROR: Cannot reach Ollama — is it running? ({e})"

# ── Agent Loop ────────────────────────────────────────────────────────────────

def run():
    print("\n" + "═" * 60)
    print("  VisioReels Agent  —  Gemma 4 + Remotion")
    print("  Type your prompt. 'exit' to quit.")
    print("  Run `npm run studio` in another terminal for live preview.")
    print("═" * 60 + "\n")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye.")
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit", "bye"}:
            print("Bye.")
            break

        messages.append({"role": "user", "content": user_input})

        # Agent loop — Gemma thinks, calls tools, gets results, repeats
        iteration = 0
        while iteration < 10:
            iteration += 1
            print(f"\n[Gemma thinking...]\n")

            response = chat(messages)
            tool_calls = parse_tools(response)

            if not tool_calls:
                # No tools — final answer
                clean = re.sub(r"<tool>.*?</tool>.*?(?=<tool>|$)", "", response, flags=re.DOTALL).strip()
                print(f"Gemma: {clean}\n")
                messages.append({"role": "assistant", "content": response})
                break

            # Execute tools and collect results
            tool_results = []
            for call in tool_calls:
                tool_name = call["tool"]
                attrs = call["attrs"]
                print(f"  → [{tool_name}] {attrs.get('path') or attrs.get('cmd', '')[:80]}")
                result = execute_tool(tool_name, attrs)
                tool_results.append(f"<result tool='{tool_name}'>\n{result}\n</result>")

            # Show Gemma's reasoning (strip tool blocks for cleaner output)
            reasoning = re.sub(r"<tool>.*", "", response, flags=re.DOTALL).strip()
            if reasoning:
                print(f"\nGemma: {reasoning}\n")

            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content": "\n".join(tool_results)})

        if iteration >= 10:
            print("Gemma: [Max iterations reached — task may be incomplete. Tell me to continue.]\n")

if __name__ == "__main__":
    run()
