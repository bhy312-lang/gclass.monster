#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = process.env.MA_BASE_URL || 'https://api.openai.com/v1';
const DEFAULT_PLANNER_MODEL = process.env.MA_PLANNER_MODEL || 'gpt-5-mini';
const DEFAULT_CODER_MODEL = process.env.MA_CODER_MODEL || 'gpt-5-mini';
const MAX_CONTEXT_CHARS = Number(process.env.MA_MAX_CONTEXT_CHARS || 16000);

function printHelp() {
  console.log(
    [
      'Usage:',
      '  node tools/multi-agent/orchestrator.cjs [options] "request"',
      '',
      'Options:',
      '  --write                 Apply generated files',
      '  --context a,b,c         Comma-separated context files',
      '  --out-dir path          Output directory for generated files (default: current directory)',
      '  -h, --help              Show this help',
      '',
      'Environment:',
      '  MA_API_KEY or OPENAI_API_KEY',
      '  MA_BASE_URL (default: https://api.openai.com/v1)',
      '  MA_PLANNER_MODEL (default: gpt-5-mini)',
      '  MA_CODER_MODEL (default: gpt-5-mini)',
      '  MA_MAX_CONTEXT_CHARS (default: 16000)',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = {
    write: false,
    context: [],
    outDir: process.cwd(),
    request: '',
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }
    if (arg === '--write') {
      args.write = true;
      continue;
    }
    if (arg === '--context') {
      const value = argv[i + 1] || '';
      args.context = value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--out-dir') {
      args.outDir = path.resolve(argv[i + 1] || '.');
      i += 1;
      continue;
    }
    args.request += `${args.request ? ' ' : ''}${arg}`;
  }

  args.request = args.request.trim();
  return args;
}

function assertApiKey() {
  const key = process.env.MA_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Missing API key. Set MA_API_KEY or OPENAI_API_KEY.');
  }
  return key;
}

async function callChatCompletions({ model, system, user, apiKey }) {
  const url = `${DEFAULT_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API request failed (${response.status}): ${detail}`);
  }

  const json = await response.json();
  const message = json?.choices?.[0]?.message?.content;
  if (!message || typeof message !== 'string') {
    throw new Error('Invalid API response: missing message content.');
  }
  return message;
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function loadContext(contextPaths) {
  const snippets = [];
  let usedChars = 0;

  for (const relPath of contextPaths) {
    const absPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      continue;
    }
    const content = safeReadFile(absPath);
    if (!content) {
      continue;
    }
    const remaining = MAX_CONTEXT_CHARS - usedChars;
    if (remaining <= 0) {
      break;
    }
    const clipped = content.slice(0, remaining);
    snippets.push({ path: relPath, content: clipped });
    usedChars += clipped.length;
  }

  return snippets;
}

function parseJsonStrict(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        throw new Error(`${label} did not return valid JSON.`);
      }
    }
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function plannerPrompt(userRequest, contextSnippets) {
  const context = contextSnippets
    .map((item) => `FILE: ${item.path}\n${item.content}`)
    .join('\n\n---\n\n');

  return [
    'User Request:',
    userRequest,
    '',
    'Repository Context (optional):',
    context || '(none)',
    '',
    'Return ONLY JSON with this shape:',
    '{',
    '  "goal": "...",',
    '  "assumptions": ["..."],',
    '  "steps": ["..."],',
    '  "risks": ["..."],',
    '  "acceptance_tests": ["..."]',
    '}',
  ].join('\n');
}

function coderPrompt(userRequest, plannerOutput, contextSnippets) {
  const context = contextSnippets
    .map((item) => `FILE: ${item.path}\n${item.content}`)
    .join('\n\n---\n\n');

  return [
    'User Request:',
    userRequest,
    '',
    'Planner Output:',
    JSON.stringify(plannerOutput, null, 2),
    '',
    'Repository Context (optional):',
    context || '(none)',
    '',
    'Generate implementable file outputs.',
    'Return ONLY JSON with this shape:',
    '{',
    '  "summary": "...",',
    '  "files": [',
    '    {',
    '      "path": "relative/path.ext",',
    '      "description": "why this file is changed",',
    '      "content": "full file content"',
    '    }',
    '  ],',
    '  "post_apply_checks": ["..."]',
    '}',
  ].join('\n');
}

function normalizeFiles(result) {
  if (!result || !Array.isArray(result.files)) {
    return [];
  }
  return result.files
    .map((file) => ({
      path: typeof file.path === 'string' ? file.path.trim() : '',
      description: typeof file.description === 'string' ? file.description : '',
      content: typeof file.content === 'string' ? file.content : '',
    }))
    .filter((file) => file.path.length > 0);
}

function ensureInside(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function writeFiles(files, outDir) {
  const written = [];
  for (const file of files) {
    const target = path.resolve(outDir, file.path);
    if (!ensureInside(outDir, target)) {
      throw new Error(`Refusing to write outside out-dir: ${file.path}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
    written.push(file.path);
  }
  return written;
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.request) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const apiKey = assertApiKey();
  const contextSnippets = loadContext(args.context);

  const plannerSystem = [
    'You are a senior engineering planner.',
    'You create concise implementation plans with risks and acceptance checks.',
    'Return strict JSON only.',
  ].join(' ');

  console.log('=== Planner Agent ===');
  const plannerRaw = await callChatCompletions({
    model: DEFAULT_PLANNER_MODEL,
    system: plannerSystem,
    user: plannerPrompt(args.request, contextSnippets),
    apiKey,
  });
  const plannerOutput = parseJsonStrict(plannerRaw, 'Planner agent');
  console.log(JSON.stringify(plannerOutput, null, 2));

  const coderSystem = [
    'You are a senior software engineer.',
    'Follow the planner output and generate complete file contents.',
    'Return strict JSON only.',
  ].join(' ');

  console.log('\n=== Coder Agent ===');
  const coderRaw = await callChatCompletions({
    model: DEFAULT_CODER_MODEL,
    system: coderSystem,
    user: coderPrompt(args.request, plannerOutput, contextSnippets),
    apiKey,
  });
  const coderOutput = parseJsonStrict(coderRaw, 'Coder agent');
  const files = normalizeFiles(coderOutput);

  console.log(
    JSON.stringify(
      {
        summary: coderOutput.summary || '',
        file_count: files.length,
        post_apply_checks: Array.isArray(coderOutput.post_apply_checks)
          ? coderOutput.post_apply_checks
          : [],
      },
      null,
      2
    )
  );

  if (files.length === 0) {
    console.log('\nNo file outputs were generated.');
    return;
  }

  console.log('\nPlanned files:');
  for (const file of files) {
    const suffix = file.description ? ` :: ${file.description}` : '';
    console.log(`- ${file.path}${suffix}`);
  }

  if (!args.write) {
    console.log('\nDry run only. Add --write to apply files.');
    return;
  }

  const written = writeFiles(files, args.outDir);
  console.log(`\nApplied ${written.length} file(s) to ${args.outDir}`);
}

run().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

