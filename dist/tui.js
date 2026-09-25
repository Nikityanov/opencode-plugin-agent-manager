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

// src/tui/bulk.tsx
import { createComponent as _$createComponent2 } from "@opentui/solid";

// src/tui/notifications.ts
function showError(api, error) {
  api.ui.toast({
    variant: "error",
    title: "Agent Model Manager",
    message: error instanceof Error ? error.message : String(error),
    duration: 5e3
  });
}

// src/tui/ohmy-commands.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
var DEFAULT_AGENT_NAMES = ["sisyphus", "hephaestus", "oracle", "librarian", "explore", "multimodal-looker", "prometheus", "metis", "momus", "atlas", "sisyphus-junior"];
var DEFAULT_CATEGORY_NAMES = ["visual-engineering", "ultrabrain", "deep", "artistry", "quick", "unspecified-low", "unspecified-high", "writing"];
function getOhMyTargets(config, section, includeBuiltIns = section === "opencode") {
  const layer = getOhMyConfigLayer(config, section);
  const agentNames = /* @__PURE__ */ new Set([...Object.keys(layer.agents ?? {}), ...includeBuiltIns ? DEFAULT_AGENT_NAMES : []]);
  const categoryNames = /* @__PURE__ */ new Set([...Object.keys(layer.categories ?? {}), ...includeBuiltIns ? DEFAULT_CATEGORY_NAMES : []]);
  return [...[...agentNames].map((key) => ({
    kind: "agent",
    key
  })), ...[...categoryNames].map((key) => ({
    kind: "category",
    key
  }))];
}
function targetTitle(target) {
  return `${target.kind}: ${target.key}`;
}
function getSection(config, section, kind) {
  const layer = ensureOhMyConfigLayer(config, section);
  if (kind === "agent") {
    layer.agents ??= {};
    return layer.agents;
  }
  layer.categories ??= {};
  return layer.categories;
}
function getAssignment(config, section, target) {
  return getSection(config, section, target.kind)[target.key] ?? {};
}
function openModelSelector(api, configLocation, config, models, target) {
  const section = configLocation.section ?? "root";
  const current = getAssignment(config, section, target).model;
  const modelOptions = [...models.map((model) => ({
    ...model,
    title: `${model.title}${model.value === current ? " (current)" : ""}`
  })), {
    value: "__clear__",
    title: "Clear model override"
  }];
  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect;
    return _$createComponent(DialogSelect, {
      get title() {
        return `Select model for ${target.key}`;
      },
      options: modelOptions,
      onSelect: (option) => {
        api.ui.dialog.clear();
        try {
          applyChange(api, configLocation, config, models, target, option.value);
        } catch (error) {
          showError(api, error);
        }
      }
    });
  });
}
function applyChange(api, configLocation, config, models, target, selected) {
  const section = configLocation.section ?? "root";
  const assignment = getAssignment(config, section, target);
  if (selected === "__clear__") {
    delete assignment.model;
  } else {
    assignment.model = selected;
  }
  getSection(config, section, target.kind)[target.key] = assignment;
  writeConfig(configLocation.path, config, section);
  const selectedTitle = models.find((model) => model.value === selected)?.title ?? selected;
  api.ui.toast({
    variant: "success",
    title: "Saved",
    message: `${targetTitle(target)} \u2192 ${selected === "__clear__" ? "cleared" : selectedTitle}`,
    duration: 2e3
  });
}
function handleConfigCommand(api, configLocation, models) {
  const config = readConfig(configLocation.path);
  const targets = getOhMyTargets(config, configLocation.section ?? "root");
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3e3
    });
    return;
  }
  if (targets.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No agents or categories found in the active oh-my configuration",
      duration: 3e3
    });
    return;
  }
  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect;
    return _$createComponent(DialogSelect, {
      title: "Configure model for...",
      get options() {
        return targets.map((target) => ({
          title: targetTitle(target),
          value: target
        }));
      },
      onSelect: (option) => {
        api.ui.dialog.clear();
        openModelSelector(api, configLocation, config, models, option.value);
      }
    });
  });
}

// src/tui/operations.ts
function applyModelToOhMyEntries(config, model) {
  let count = 0;
  for (const section of [config.agents, config.categories]) {
    if (!section) continue;
    for (const key of Object.keys(section)) {
      section[key] = { ...section[key], model };
      count += 1;
    }
  }
  return count;
}

// src/tui/bulk.tsx
function selectModel(api, title, models, onSelect) {
  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect;
    return _$createComponent2(DialogSelect, {
      title,
      get options() {
        return models.map((model) => ({
          title: model.title,
          value: model.value
        }));
      },
      onSelect: (option) => {
        api.ui.dialog.clear();
        onSelect(option.value);
      }
    });
  });
}
function confirmBulk(api, title, message, onConfirm) {
  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => {
    const DialogConfirm = api.ui.DialogConfirm;
    return _$createComponent2(DialogConfirm, {
      title,
      message,
      onConfirm: () => {
        api.ui.dialog.clear();
        onConfirm();
      },
      onCancel: () => api.ui.dialog.clear()
    });
  });
}
function handleOhMyBulkCommand(api, configLocation, models) {
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3e3
    });
    return;
  }
  const config = readConfig(configLocation.path);
  const section = configLocation.section ?? "root";
  const layer = getOhMyConfigLayer(config, section);
  const targets = getOhMyTargets(config, section);
  const count = targets.length;
  if (count === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No oh-my agents or categories found",
      duration: 3e3
    });
    return;
  }
  selectModel(api, "Apply one model to all oh-my entries", models, (model) => {
    confirmBulk(api, "Apply model everywhere?", `Set ${model} for ${count} oh-my agents/categories?`, () => {
      try {
        for (const target of targets) {
          const entries = target.kind === "agent" ? layer.agents ??= {} : layer.categories ??= {};
          entries[target.key] ??= {};
        }
        applyModelToOhMyEntries(layer, model);
        writeConfig(configLocation.path, config, section);
        api.ui.toast({
          variant: "success",
          title: "Oh-my agents updated",
          message: `${model} applied to ${count} entries`,
          duration: 2500
        });
      } catch (error) {
        showError(api, error);
      }
    });
  });
}
function handleOpenCodeBulkCommand(api, configPath, models) {
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3e3
    });
    return;
  }
  const agentNames = Object.keys(api.state.config.agent ?? {});
  if (agentNames.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No OpenCode agents found in the active configuration",
      duration: 3e3
    });
    return;
  }
  selectModel(api, "Apply one model to all OpenCode agents", models, (model) => {
    confirmBulk(api, "Apply model to OpenCode agents?", `Set ${model} for ${agentNames.length} OpenCode agents, including built-ins?`, () => {
      try {
        const count = setOpenCodeAgentModels(configPath, agentNames, model);
        api.ui.toast({
          variant: "success",
          title: "OpenCode agents updated",
          message: `${model} applied to ${count} agents`,
          duration: 2500
        });
      } catch (error) {
        showError(api, error);
      }
    });
  });
}

// src/tui/opencode.tsx
import { createComponent as _$createComponent3 } from "@opentui/solid";

// src/tui/status-dialog.tsx
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
function showScrollableStatus(api, title, lines) {
  api.ui.dialog.replace(() => {
    return (() => {
      var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text"), _el$6 = _$createElement("scrollbox"), _el$7 = _$createElement("box"), _el$8 = _$createElement("box"), _el$9 = _$createElement("text"), _el$1 = _$createElement("box"), _el$10 = _$createElement("text");
      _$insertNode(_el$, _el$2);
      _$insertNode(_el$, _el$6);
      _$insertNode(_el$, _el$8);
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "gap", 1);
      _$setProp(_el$, "paddingLeft", 2);
      _$setProp(_el$, "paddingRight", 2);
      _$setProp(_el$, "paddingBottom", 1);
      _$insertNode(_el$2, _el$3);
      _$insertNode(_el$2, _el$4);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "justifyContent", "space-between");
      _$insert(_el$3, title);
      _$insertNode(_el$4, _$createTextNode(`esc`));
      _$insertNode(_el$6, _el$7);
      _$setProp(_el$6, "focused", true);
      _$setProp(_el$6, "maxHeight", 24);
      _$setProp(_el$6, "flexShrink", 1);
      _$setProp(_el$6, "scrollY", true);
      _$setProp(_el$6, "onKeyDown", (event) => {
        if (event.name === "return") api.ui.dialog.clear();
      });
      _$setProp(_el$7, "flexDirection", "column");
      _$insert(_el$7, () => lines.map((line) => (() => {
        var _el$12 = _$createElement("text");
        _$insert(_el$12, line);
        return _el$12;
      })()));
      _$insertNode(_el$8, _el$9);
      _$insertNode(_el$8, _el$1);
      _$setProp(_el$8, "flexDirection", "row");
      _$setProp(_el$8, "justifyContent", "space-between");
      _$setProp(_el$8, "flexShrink", 0);
      _$insertNode(_el$9, _$createTextNode(`up/down, PgUp/PgDn to scroll`));
      _$insertNode(_el$1, _el$10);
      _$setProp(_el$1, "paddingLeft", 2);
      _$setProp(_el$1, "paddingRight", 2);
      _$setProp(_el$1, "onMouseUp", () => api.ui.dialog.clear());
      _$insertNode(_el$10, _$createTextNode(`ok`));
      _$effect((_$p) => _$setProp(_el$3, "attributes", TextAttributes.BOLD, _$p));
      return _el$;
    })();
  });
  api.ui.dialog.setSize("large");
}

// src/tui/opencode.tsx
function getAgentNames(api) {
  return Object.keys(api.state.config.agent ?? {});
}
function showWarning(api, message) {
  api.ui.toast({
    variant: "warning",
    title: "Agent Model Manager",
    message,
    duration: 3e3
  });
}
function openAgentModelPicker(api, configPath, models, agentName) {
  const current = api.state.config.agent?.[agentName]?.model;
  const options = models.map((model) => ({
    ...model,
    title: `${model.title}${model.value === current ? " (current)" : ""}`
  }));
  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect;
    return _$createComponent3(DialogSelect, {
      title: `Select model for OpenCode agent ${agentName}`,
      options,
      onSelect: (option) => {
        api.ui.dialog.clear();
        try {
          setOpenCodeAgentModels(configPath, [agentName], option.value);
          api.ui.toast({
            variant: "success",
            title: "OpenCode agent updated",
            message: `${agentName} \u2192 ${option.value}`,
            duration: 2e3
          });
        } catch (error) {
          showError(api, error);
        }
      }
    });
  });
}
function handleOpenCodeConfigCommand(api, configPath, models) {
  if (models.length === 0) {
    showWarning(api, "No models found in the OpenCode configuration");
    return;
  }
  const agentNames = getAgentNames(api);
  if (agentNames.length === 0) {
    showWarning(api, "No OpenCode agents found in the active configuration");
    return;
  }
  api.ui.dialog.setSize("medium");
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect;
    return _$createComponent3(DialogSelect, {
      title: "Configure OpenCode agent model...",
      get options() {
        return agentNames.map((name) => ({
          title: name,
          value: name
        }));
      },
      onSelect: (option) => {
        api.ui.dialog.clear();
        openAgentModelPicker(api, configPath, models, option.value);
      }
    });
  });
}
function handleOpenCodeStatusCommand(api, configPath) {
  const stateAgents = api.state.config.agent ?? {};
  const persistedModels = readOpenCodeAgentModels(configPath);
  const names = [.../* @__PURE__ */ new Set([...Object.keys(stateAgents), ...Object.keys(persistedModels)])];
  if (names.length === 0) {
    showWarning(api, "No OpenCode agents found in the active configuration");
    return;
  }
  const lines = ["OpenCode agent models:", ""];
  for (const name of names) {
    const model = persistedModels[name] ?? stateAgents[name]?.model;
    lines.push(`  ${name}: ${model ?? "(inherited/default)"}`);
  }
  showScrollableStatus(api, "OpenCode Model Assignments", lines);
}

// src/tui/model-options.ts
function getModelOptions(api) {
  const options = /* @__PURE__ */ new Map();
  for (const [providerId, provider] of Object.entries(api.state.config.provider ?? {})) {
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      const modelId = model.id ?? modelKey;
      const value = `${providerId}/${modelId}`;
      const providerName = provider.name ?? provider.id ?? providerId;
      options.set(value, {
        value,
        title: `${providerName} / ${model.name ?? modelId}`
      });
    }
  }
  if (options.size > 0) return [...options.values()];
  for (const provider of api.state.provider ?? []) {
    for (const [modelKey, model] of Object.entries(provider.models)) {
      const modelId = model.id ?? modelKey;
      const value = `${provider.id}/${modelId}`;
      options.set(value, {
        value,
        title: `${provider.name} / ${model.name}`
      });
    }
  }
  return [...options.values()];
}

// src/tui/status.tsx
function formatAssignment(assignment) {
  return assignment.model ?? "(inherited)";
}
function handleStatusCommand(api, configLocation) {
  const config = readConfig(configLocation.path);
  const section = configLocation.section ?? "root";
  const layer = getOhMyConfigLayer(config, section);
  const targets = getOhMyTargets(config, section);
  const lines = ["Current oh-my model assignments:", "", "Agents:"];
  const agents = targets.filter((target) => target.kind === "agent");
  if (agents.length === 0) {
    lines.push("  (none)");
  } else {
    for (const target of agents) {
      lines.push(`  ${target.key}: ${formatAssignment(layer.agents?.[target.key] ?? {})}`);
    }
  }
  lines.push("", "Categories:");
  const categories = targets.filter((target) => target.kind === "category");
  if (categories.length === 0) {
    lines.push("  (none)");
  } else {
    for (const target of categories) {
      lines.push(`  ${target.key}: ${formatAssignment(layer.categories?.[target.key] ?? {})}`);
    }
  }
  showScrollableStatus(api, "Oh-my Model Assignments", lines);
}

// src/tui/commands.tsx
function registerModelManagerCommands(api, configLocation, openCodeConfigPath) {
  const models = getModelOptions(api);
  const ohMyCommands = configLocation ? [{
    name: "amm",
    title: "Configure oh-my agent/category models",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm",
    suggested: true,
    run: () => {
      try {
        handleConfigCommand(api, configLocation, models);
      } catch (error) {
        showError(api, error);
      }
    }
  }, {
    name: "amm-all-ohmy",
    title: "Set one model for all oh-my agents/categories",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm-all-ohmy",
    suggested: true,
    run: () => {
      try {
        handleOhMyBulkCommand(api, configLocation, models);
      } catch (error) {
        showError(api, error);
      }
    }
  }, {
    name: "amm-status",
    title: "Show oh-my model assignments",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm-status",
    run: () => {
      try {
        handleStatusCommand(api, configLocation);
      } catch (error) {
        showError(api, error);
      }
    }
  }] : [];
  const commands = [...ohMyCommands, {
    name: "amm-opencode",
    title: "Configure an OpenCode agent model",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm-opencode",
    suggested: true,
    run: () => {
      try {
        handleOpenCodeConfigCommand(api, openCodeConfigPath, models);
      } catch (error) {
        showError(api, error);
      }
    }
  }, {
    name: "amm-opencode-all",
    title: "Set one model for all OpenCode agents",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm-opencode-all",
    suggested: true,
    run: () => {
      try {
        handleOpenCodeBulkCommand(api, openCodeConfigPath, models);
      } catch (error) {
        showError(api, error);
      }
    }
  }, {
    name: "amm-opencode-status",
    title: "Show OpenCode agent models",
    category: "Agent Model Manager",
    namespace: "palette",
    slashName: "amm-opencode-status",
    run: () => {
      try {
        handleOpenCodeStatusCommand(api, openCodeConfigPath);
      } catch (error) {
        showError(api, error);
      }
    }
  }];
  const primaryCommand = configLocation ? "amm" : "amm-opencode";
  const dispose = api.keymap.registerLayer({
    commands,
    bindings: [{
      key: "ctrl+shift+m",
      cmd: primaryCommand,
      desc: "Configure models"
    }]
  });
  if (typeof dispose === "function") api.lifecycle.onDispose(dispose);
}

// src/tui.tsx
var PLUGIN_ID = "agent-model-manager";
function isOhMyOpenAgentInstalled(api) {
  return (api.state.config.plugin ?? []).some((entry) => {
    const spec = Array.isArray(entry) ? entry[0] : entry;
    return typeof spec === "string" && (spec === "oh-my-openagent" || spec.startsWith("oh-my-openagent@") || spec === "oh-my-opencode" || spec.startsWith("oh-my-opencode@"));
  });
}
var tui = async (api) => {
  const projectDir = api.state.path.directory || process.cwd();
  const configLocation = findConfig(projectDir);
  const ohMyAvailable = configLocation !== null && isOhMyOpenAgentInstalled(api);
  registerModelManagerCommands(api, ohMyAvailable ? configLocation : null, api.state.path.config);
  api.ui.toast({
    variant: ohMyAvailable ? "success" : "info",
    title: "Agent Model Manager",
    message: ohMyAvailable ? `Loaded (${configLocation.path})` : "OpenCode agent controls loaded; oh-my-openagent is unavailable",
    duration: 2e3
  });
};
var plugin = {
  id: PLUGIN_ID,
  tui
};
var tui_default = plugin;
export {
  tui_default as default
};
//# sourceMappingURL=tui.js.map
