import fs from 'node:fs';
import path from 'node:path';

const DOCS_DIR = path.resolve(process.cwd(), 'docs');

function scanDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

const mdFiles = scanDir(DOCS_DIR);
let errors = 0;

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);

  // 1. Check for legacy CLIOP token
  if (content.includes('CLIOP')) {
    console.error(`ERROR: ${relPath} contains prohibited legacy token "CLIOP"`);
    errors++;
  }

  // 2. Check for balanced Mermaid fences
  const mermaidFences = (content.match(/```mermaid/g) || []).length;
  // Each mermaid fence should have a corresponding closing fence
  // Simple check: count code fence starts and ends
  const totalFences = (content.match(/```/g) || []).length;
  if (totalFences % 2 !== 0) {
    console.error(`ERROR: ${relPath} has unbalanced markdown code fences (count: ${totalFences})`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nDocumentation check failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`Documentation check passed cleanly across ${mdFiles.length} markdown files.`);
}
