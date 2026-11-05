// Photo → JSON via the user's own API key. Replaces the artifact-only `claude.use("sample")`
// that Talerz used inside claude.ai; keeps the same shape: sample.json(prompt, {images, signal}).
import { getSettings } from "./store.js";

const DEFAULTS = { gemini: "gemini-2.5-flash", anthropic: "claude-haiku-5-5" };

class AIError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

async function shrink(file, max = 1280) {
  // Phone photos are 3-5 MB; a 1280 px JPEG is plenty for recognising food and much faster.
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new AIError("image_rejected");
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function parseJSON(text) {
  if (!text) throw new AIError("empty_completion");
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); } catch { throw new AIError("invalid_json"); }
}

function httpError(status) {
  if (status === 401 || status === 403) return new AIError("bad_key");
  if (status === 429) return new AIError("rate_limited");
  if (status === 400) return new AIError("bad_request");
  return new AIError("upstream_error");
}

export function aiReady() { return !!getSettings().ai.key; }

export const sample = {
  async json(prompt, { images = [], signal } = {}) {
    const { provider, key, model } = getSettings().ai;
    if (!key) throw new AIError("no_key");
    const data = images.length ? await shrink(images[0]) : null;
    try {
      if (provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: model || DEFAULTS.anthropic, max_tokens: 1500,
            messages: [{ role: "user", content: [
              ...(data ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }] : []),
              { type: "text", text: prompt },
            ] }],
          }),
        });
        if (!res.ok) throw httpError(res.status);
        const j = await res.json();
        return parseJSON((j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""));
      }
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model || DEFAULTS.gemini) + ":generateContent";
      const res = await fetch(url, {
        method: "POST", signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...(data ? [{ inline_data: { mime_type: "image/jpeg", data } }] : [])] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (!res.ok) throw httpError(res.status);
      const j = await res.json();
      const c = j.candidates && j.candidates[0];
      if (!c) throw new AIError(j.promptFeedback && j.promptFeedback.blockReason ? "refused" : "empty_completion");
      return parseJSON(((c.content && c.content.parts) || []).map((p) => p.text || "").join(""));
    } catch (e) {
      if (e && e.name === "AbortError") throw new AIError("cancelled");
      if (e instanceof AIError) throw e;
      throw new AIError("network");
    }
  },
};
