#!/usr/bin/env node
/**
 * Resuelve banners de juegos: overrides (Steam appid / URL Google-curada) →
 * descarga a tierly/game-banners/ → actualiza games.banner_url (+ icon_url capsule).
 *
 * Uso:
 *   node --env-file=discord-bot/.env scripts/fetch-game-banners.mjs
 *   node --env-file=discord-bot/.env scripts/fetch-game-banners.mjs --dry-run
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "tierly", "game-banners");
const overridesPath = path.join(__dirname, "game-banner-overrides.json");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function rest(pathname, init = {}) {
  const res = await fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

function slug(canonical) {
  return String(canonical || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "game";
}

async function steamSearch(term) {
  const q = new URL("https://store.steampowered.com/api/storesearch/");
  q.searchParams.set("term", term);
  q.searchParams.set("l", "english");
  q.searchParams.set("cc", "US");
  const res = await fetch(q);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.items?.[0];
  return hit?.id ? Number(hit.id) : null;
}

function steamHeader(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function steamCapsule(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;
}

async function download(imageUrl, dest) {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "TierlyBannerFetch/1.0" },
  });
  if (!res.ok) throw new Error(`download ${res.status} ${imageUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) throw new Error(`too small (${buf.length}) ${imageUrl}`);
  if (!dryRun) await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
  const games = await rest("games?select=id,canonical_name,display_name,banner_url,icon_url&order=canonical_name");
  console.log(`games=${games.length} dryRun=${dryRun}`);

  for (const game of games) {
    const keyName = String(game.canonical_name || "").toLowerCase();
    const ovr = overrides[keyName] || overrides[game.display_name?.toLowerCase()] || {};
    let appid = ovr.steam_appid ?? null;
    let remoteBanner = ovr.banner_url || null;
    let remoteIcon = ovr.icon_url || null;

    if (!remoteBanner && !appid) {
      appid = await steamSearch(game.display_name || game.canonical_name);
      await new Promise((r) => setTimeout(r, 250));
    }
    if (appid) {
      remoteBanner = remoteBanner || steamHeader(appid);
      remoteIcon = remoteIcon || steamCapsule(appid);
    }
    if (!remoteBanner) {
      console.warn(`SKIP no source: ${game.display_name}`);
      continue;
    }

    const file = `${slug(game.canonical_name)}.jpg`;
    const dest = path.join(outDir, file);
    const publicPath = `/tierly/game-banners/${file}`;
    try {
      const bytes = await download(remoteBanner, dest);
      console.log(`OK ${game.display_name} ← ${remoteBanner} (${bytes}b) → ${publicPath}`);
    } catch (err) {
      console.warn(`FAIL download ${game.display_name}: ${err.message}`);
      // Si falla la descarga local, igual podemos apuntar al remoto (Steam CDN).
      if (!dryRun) {
        await rest(`games?id=eq.${game.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            banner_url: remoteBanner,
            icon_url: remoteIcon || game.icon_url,
          }),
        });
      }
      continue;
    }

    if (!dryRun) {
      await rest(`games?id=eq.${game.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          banner_url: publicPath,
          icon_url: remoteIcon || game.icon_url || publicPath,
        }),
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
