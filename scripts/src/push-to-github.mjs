import fs from 'fs';
import path from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'Colex-Ai';
const REPO = 'colex-ai-project';
const BRANCH = 'main';
const ROOT = '/home/runner/workspace';

const EXCLUDE = [
  'node_modules', '.git', '.local', '.cache', 'pnpm-lock.yaml',
  '/dist/', 'tsconfig.tsbuildinfo', '.agents', '.replit-artifact',
  'attached_assets/ColexAi_logo'
];

function shouldExclude(filePath) {
  const rel = filePath.replace(ROOT + '/', '');
  return EXCLUDE.some(ex => rel.includes(ex));
}

function getAllFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldExclude(fullPath)) continue;
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function apiRequest(method, endpoint, body) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Colex-Ai-Push-Script'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function getExistingFiles() {
  async function getTree(treeSha) {
    const result = await apiRequest('GET', `/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`);
    const map = {};
    for (const item of (result.tree || [])) {
      if (item.type === 'blob') map[item.path] = item.sha;
    }
    return map;
  }
  try {
    const ref = await apiRequest('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    const commitSha = ref.object?.sha;
    if (!commitSha) return {};
    const commit = await apiRequest('GET', `/repos/${OWNER}/${REPO}/git/commits/${commitSha}`);
    return await getTree(commit.tree.sha);
  } catch { return {}; }
}

async function uploadFile(filePath, existingSha) {
  const rel = filePath.replace(ROOT + '/', '');
  const content = fs.readFileSync(filePath);
  const encoded = content.toString('base64');

  const body = {
    message: `chore: upload ${rel}`,
    content: encoded,
    branch: BRANCH
  };
  if (existingSha) body.sha = existingSha;

  const result = await apiRequest('PUT', `/repos/${OWNER}/${REPO}/contents/${rel}`, body);
  if (result.content) {
    console.log(`✓ ${rel}`);
    return true;
  } else {
    console.error(`✗ ${rel}: ${result.message}`);
    return false;
  }
}

async function main() {
  console.log(`Pushing project to https://github.com/${OWNER}/${REPO}...\n`);

  console.log('Fetching existing files from GitHub...');
  const existing = await getExistingFiles();
  console.log(`Found ${Object.keys(existing).length} existing files in repo.\n`);

  const files = getAllFiles(ROOT);
  console.log(`Found ${files.length} local files to upload.\n`);

  let uploaded = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const rel = file.replace(ROOT + '/', '');
    const existingSha = existing[rel] || null;
    const ok = await uploadFile(file, existingSha);
    if (ok) uploaded++;
    else failed++;
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nDone! Uploaded: ${uploaded}, Failed: ${failed}`);
  console.log(`View repo: https://github.com/${OWNER}/${REPO}`);
}

main().catch(console.error);
