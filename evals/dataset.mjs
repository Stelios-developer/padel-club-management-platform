import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function loadDatasets(root) {
  const sets = {};
  const seen = new Set();
  const questions = new Set();
  for (const [split, count] of [
    ["development", 40],
    ["evaluation", 60],
  ]) {
    const bytes = await fs.readFile(
      path.join(root, "evals/datasets", split + ".json"),
    );
    const data = JSON.parse(bytes);
    if (data.split !== split || data.cases.length !== count)
      throw Error("Unexpected dataset split/count");
    for (const item of data.cases) {
      if (seen.has(item.id)) throw Error("Duplicate case ID");
      seen.add(item.id);
      const key =
        item.special ||
        item.mode +
          ":" +
          item.question
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
      if (questions.has(key))
        throw Error("Duplicate case across splits: " + item.id);
      questions.add(key);
      if (!item.expected || !["POLICY", "AVAILABILITY"].includes(item.mode))
        throw Error("Invalid dataset case");
    }
    sets[split] = { ...data, sha256: hash(bytes) };
  }
  return sets;
}
export function renderCase(item, variables) {
  const render = (text) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in variables)) throw Error("Unknown case variable " + key);
      return variables[key];
    });
  return { ...item, question: render(item.question) };
}
