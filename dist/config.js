// src/config.ts
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// src/types.ts
import { z } from "zod";
var modelAssignmentSchema = z.object({
  model: z.string().optional(),
  fallback_models: z.unknown().optional()
}).passthrough();
var assignmentMapSchema = z.record(z.string(), modelAssignmentSchema);
var ohMyConfigLayerSchema = z.object({
  agents: assignmentMapSchema.optional(),
  categories: assignmentMapSchema.optional()
}).passthrough();
var ohMyOpenAgentConfigSchema = z.object({
  agents: assignmentMapSchema.optional(),
  categories: assignmentMapSchema.optional(),
  "[opencode]": ohMyConfigLayerSchema.optional()
}).passthrough();

// src/config.ts
var LEGACY_CONFIG_FILENAMES = ["oh-my-openagent.json", "oh-my-openagent.jsonc"];
var OMO_CONFIG_FILENAMES = ["omo.jsonc", "omo.json"];
var OPEN_CODE_CONFIG_FILENAMES = ["opencode.jsonc", "opencode.json", "config.json"];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function resolveOpenCodeConfigPath(pathOrDirectory) {
  if (!isDirectory(pathOrDirectory)) return pathOrDirectory;
  for (const filename of OPEN_CODE_CONFIG_FILENAMES) {
    const candidate = join(pathOrDirectory, filename);
    if (existsSync(candidate)) return candidate;
  }
  return join(pathOrDirectory, "opencode.jsonc");
}
function parseJsoncText(text, path) {
  const errors = [];
  const parsed = parseJsonc(text, errors, {
    allowTrailingComma: true
  });
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error(`Invalid JSON object in ${path}`);
  }
  return parsed;
}
function parseJsoncObject(path) {
  return parseJsoncText(readFileSync(path, "utf-8"), path);
}
function readConfigFile(path) {
  return ohMyOpenAgentConfigSchema.parse(parseJsoncObject(path));
}
function getOhMyConfigLayer(config, section) {
  if (section === "root") return config;
  return config["[opencode]"] ?? {};
}
function ensureOhMyConfigLayer(config, section) {
  if (section === "root") return config;
  const existing = config["[opencode]"];
  if (existing) return existing;
  const created = {};
  config["[opencode]"] = created;
  return created;
}
function findExistingInDirectory(directory, filenames) {
  for (const filename of filenames) {
    const candidate = join(directory, filename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
function findProjectConfigPath(startDir, configDirectory, filenames) {
  let current = resolve(startDir);
  const home = resolve(homedir());
  while (true) {
    const directory = configDirectory ? join(current, configDirectory) : current;
    const candidate = findExistingInDirectory(directory, filenames);
    if (candidate) return candidate;
    if (current === home) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function readLocation(path) {
  const config = readConfigFile(path);
  const section = isRecord(config["[opencode]"]) ? "opencode" : "root";
  return { path, config, section };
}
function findExistingConfig(startDir) {
  const projectModern = findProjectConfigPath(startDir, ".omo", OMO_CONFIG_FILENAMES);
  if (projectModern) return readLocation(projectModern);
  const home = resolve(homedir());
  const userModern = findExistingInDirectory(join(home, ".omo"), OMO_CONFIG_FILENAMES);
  if (userModern) return readLocation(userModern);
  const projectLegacy = findProjectConfigPath(startDir, null, LEGACY_CONFIG_FILENAMES);
  if (projectLegacy) return readLocation(projectLegacy);
  const userLegacy = findExistingInDirectory(
    join(home, ".config", "opencode"),
    LEGACY_CONFIG_FILENAMES
  );
  return userLegacy ? readLocation(userLegacy) : null;
}
function findConfig(startDir) {
  return findExistingConfig(startDir);
}
function readConfig(absolutePath) {
  return readConfigFile(absolutePath);
}
function getModelValue(value) {
  return isRecord(value) && typeof value.model === "string" ? value.model : void 0;
}
function getModelMap(value) {
  return isRecord(value) ? value : {};
}
function getLayerRecord(config, section) {
  if (section === "root") return config;
  return isRecord(config["[opencode]"]) ? config["[opencode]"] : {};
}
function getModelPath(section, kind, name) {
  return [...section === "opencode" ? ["[opencode]"] : [], kind, name, "model"];
}
function writeConfig(absolutePath, config, section = "root") {
  const raw = readFileSync(absolutePath, "utf-8");
  const original = parseJsoncText(raw, absolutePath);
  const originalLayer = getLayerRecord(original, section);
  const nextLayer = getOhMyConfigLayer(config, section);
  let updated = raw;
  for (const kind of ["agents", "categories"]) {
    const originalMap = getModelMap(originalLayer[kind]);
    const nextMap = getModelMap(nextLayer[kind]);
    const names = /* @__PURE__ */ new Set([...Object.keys(originalMap), ...Object.keys(nextMap)]);
    for (const name of names) {
      const originalModel = getModelValue(originalMap[name]);
      const nextModel = getModelValue(nextMap[name]);
      if (originalModel === nextModel) continue;
      const edits = modify(updated, getModelPath(section, kind, name), nextModel, {
        formattingOptions: { insertSpaces: true, tabSize: 2 }
      });
      updated = applyEdits(updated, edits);
    }
  }
  writeFileSync(absolutePath, updated.endsWith("\n") ? updated : `${updated}
`, "utf-8");
}
function getConfigurableKeys(config, section = "root") {
  const layer = getOhMyConfigLayer(config, section);
  return [...Object.keys(layer.agents ?? {}), ...Object.keys(layer.categories ?? {})];
}
function readOpenCodeAgentModels(pathOrDirectory) {
  const configPath = resolveOpenCodeConfigPath(pathOrDirectory);
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "{}\n";
  const config = parseJsoncText(raw, configPath);
  const agents = isRecord(config.agent) ? config.agent : {};
  const models = {};
  for (const [name, value] of Object.entries(agents)) {
    models[name] = isRecord(value) && typeof value.model === "string" ? value.model : void 0;
  }
  return models;
}
function setOpenCodeAgentModels(pathOrDirectory, agentNames, model) {
  const names = [...new Set(agentNames)];
  if (names.length === 0) return 0;
  const configPath = resolveOpenCodeConfigPath(pathOrDirectory);
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "{}\n";
  const config = parseJsoncText(raw, configPath);
  const existingAgents = isRecord(config.agent) ? config.agent : {};
  const missingNames = names.filter((name) => !isRecord(existingAgents[name]));
  if (missingNames.length === 0) {
    let updated2 = raw;
    for (const name of names) {
      const edits2 = modify(updated2, ["agent", name, "model"], model, {
        formattingOptions: { insertSpaces: true, tabSize: 2 }
      });
      updated2 = applyEdits(updated2, edits2);
    }
    writeFileSync(configPath, updated2.endsWith("\n") ? updated2 : `${updated2}
`, "utf-8");
    return names.length;
  }
  const nextAgents = { ...existingAgents };
  for (const name of names) {
    const current = nextAgents[name];
    nextAgents[name] = {
      ...isRecord(current) ? current : {},
      model
    };
  }
  const edits = modify(raw, ["agent"], nextAgents, {
    formattingOptions: { insertSpaces: true, tabSize: 2 }
  });
  const updated = applyEdits(raw, edits);
  writeFileSync(configPath, updated.endsWith("\n") ? updated : `${updated}
`, "utf-8");
  return names.length;
}
export {
  ensureOhMyConfigLayer,
  findConfig,
  getConfigurableKeys,
  getOhMyConfigLayer,
  readConfig,
  readOpenCodeAgentModels,
  resolveOpenCodeConfigPath,
  setOpenCodeAgentModels,
  writeConfig
};
//# sourceMappingURL=config.js.map
