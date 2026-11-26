#!/usr/bin/env node
// Publishes the name, summary and description in docs/store/listings.md to the addons.mozilla.org listing.
// Usage: AMO_API_KEY=... AMO_API_SECRET=... node scripts/amo-listing.js   (or --dry-run to print the request body)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ADDON_ID = "ring-light@acasaism.github.io";
// Section title in listings.md → AMO locale. Catalan, Galician and Basque are not offered on addons.mozilla.org.
const AMO_LOCALES = {
  English: "en-US", Spanish: "es-ES", French: "fr", German: "de", Italian: "it",
  "Portuguese (Brazil)": "pt-BR", "Portuguese (Portugal)": "pt-PT", Japanese: "ja", "Traditional Chinese": "zh-TW",
};

// { "English": { name, summary, description }, ... } from the "## <Language>" sections.
function parseListings(md) {
  md = md.replace(/\r\n/g, "\n"); // a Windows checkout may have CRLF line endings
  const out = {};
  for (const section of md.split(/^## /m).slice(1)) {
    const title = section.slice(0, section.indexOf("\n")).trim();
    const name = section.match(/^\*\*Name:\*\* (.+)$/m);
    const block = (label) => section.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\`\`\`\\n([\\s\\S]*?)\\n\`\`\``));
    const summary = block("Summary"), description = block("Description");
    if (!name || !summary || !description) throw new Error(`listings.md: "${title}" lacks a name, summary or description`);
    out[title] = { name: name[1].trim(), summary: summary[1].trim(), description: description[1].trim() };
  }
  return out;
}

function amoPayload(listings) {
  const body = { name: {}, summary: {}, description: {} };
  for (const [title, locale] of Object.entries(AMO_LOCALES)) {
    const l = listings[title];
    if (!l) throw new Error(`listings.md: missing the "${title}" section`);
    for (const field of Object.keys(body)) body[field][locale] = l[field];
  }
  return body;
}

// JWT for the AMO API: HMAC-SHA256, a fresh jti, valid for one minute (AMO allows at most five).
function jwt(key, secret, now = Math.floor(Date.now() / 1000)) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: key, jti: crypto.randomUUID(), iat: now, exp: now + 60 })}`;
  return `${unsigned}.${crypto.createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

async function main() {
  const body = amoPayload(parseListings(fs.readFileSync(path.join(__dirname, "../docs/store/listings.md"), "utf8")));
  const args = process.argv.slice(2);
  if (args.some((a) => a !== "--dry-run")) {
    console.error(`Unknown argument: ${args.find((a) => a !== "--dry-run")} (the only option is --dry-run)`);
    process.exit(1);
  }
  if (args.length) return console.log(JSON.stringify(body, null, 2));
  const { AMO_API_KEY: key, AMO_API_SECRET: secret } = process.env;
  if (!key || !secret) {
    console.error("Missing AMO_API_KEY or AMO_API_SECRET (see CONTRIBUTING.md#releasing)");
    process.exit(1);
  }
  const res = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`, {
    method: "PATCH",
    headers: { Authorization: `JWT ${jwt(key, secret)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`addons.mozilla.org answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Listing updated on addons.mozilla.org: ${Object.keys(body.name).join(", ")}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message, e.cause ?? ""); process.exit(1); });
module.exports = { parseListings, amoPayload, jwt };
