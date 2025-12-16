import * as fs from "fs";
import * as path from "path";

type ReelFile = Record<string, string[]>;

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: ts-node count-symbols-opposite.ts <file.json>");
  process.exit(1);
}

const resolvedPath = path.resolve(filePath);
const raw = fs.readFileSync(resolvedPath, "utf-8");
const data: ReelFile = JSON.parse(raw);

const reelNames = Object.keys(data);

/* 1. Collect all unique symbols */
const symbolSet = new Set<string>();
Object.values(data).forEach(reel =>
  reel.forEach(symbol => symbolSet.add(symbol))
);
const symbols = Array.from(symbolSet).sort();

/* 2. Pre-count per reel */
const reelCounts: Record<string, Record<string, number>> = {};

for (const reel of reelNames) {
  reelCounts[reel] = {};
  for (const s of symbols) reelCounts[reel][s] = 0;
  for (const s of data[reel]) reelCounts[reel][s]++;
}

/* 3. Build table: ONE ROW PER SYMBOL */
const table = symbols.map(symbol => {
  const row: Record<string, number | string> = { Symbol: symbol };

  for (const reel of reelNames) {
    row[reel] = reelCounts[reel][symbol];
  }

  return row;
});

/* 4. Print */
console.log("\n=== SYMBOL COUNTS (SYMBOLS AS ROWS) ===");
console.table(table);