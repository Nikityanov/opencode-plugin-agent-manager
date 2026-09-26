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
  api.ui.dialog.setSize("large");
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
  api.ui.dialog.setSize("medium");
}

// src/tui/operations.ts
function applyModelToOhMyTargets(layer, targets, model) {
  for (const target of targets) {
    const entries = entriesForTarget(layer, target);
    entries[target.key] = { ...entries[target.key], model };
  }
}
function assertNever(value) {
  return value;
}
function entriesForTarget(layer, target) {
  switch (target.kind) {
    case "agent":
      return layer.agents ??= {};
    case "category":
      return layer.categories ??= {};
    default:
      return assertNever(target);
  }
}

// src/tui/bulk.tsx
function selectModel(api, title, models, onSelect) {
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
  api.ui.dialog.setSize("large");
}
function confirmBulk(api, title, message, onConfirm) {
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
  api.ui.dialog.setSize("medium");
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
        applyModelToOhMyTargets(layer, targets, model);
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
  api.ui.dialog.setSize("large");
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
  api.ui.dialog.setSize("medium");
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

// src/tui/setup-screens.tsx
import { memo as _$memo2 } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { createComponent as _$createComponent5 } from "@opentui/solid";

// src/tui/setup-view.tsx
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { effect as _$effect2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { createComponent as _$createComponent4 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { TextAttributes as TextAttributes2 } from "@opentui/core";
import { For } from "solid-js";
function targetRowId(index) {
  return `amm-target-row-${index}`;
}
function assertNever2(value) {
  return value;
}
function SetupFrame(props) {
  return (() => {
    var _el$ = _$createElement2("box"), _el$2 = _$createElement2("text"), _el$3 = _$createElement2("text"), _el$4 = _$createElement2("box"), _el$5 = _$createElement2("box");
    _$insertNode2(_el$, _el$2);
    _$insertNode2(_el$, _el$3);
    _$insertNode2(_el$, _el$4);
    _$insertNode2(_el$, _el$5);
    _$setProp2(_el$, "flexDirection", "column");
    _$setProp2(_el$, "gap", 1);
    _$setProp2(_el$, "paddingLeft", 2);
    _$setProp2(_el$, "paddingRight", 2);
    _$insert2(_el$2, () => props.title);
    _$insert2(_el$3, () => props.breadcrumb.join(" / "));
    _$setProp2(_el$4, "flexDirection", "column");
    _$setProp2(_el$4, "flexShrink", 1);
    _$setProp2(_el$4, "minHeight", 0);
    _$insert2(_el$4, () => props.body);
    _$setProp2(_el$5, "flexDirection", "row");
    _$setProp2(_el$5, "justifyContent", "space-between");
    _$setProp2(_el$5, "flexShrink", 0);
    _$insert2(_el$5, _$createComponent4(For, {
      get each() {
        return props.footer;
      },
      children: (hint) => (() => {
        var _el$6 = _$createElement2("text");
        _$insert2(_el$6, hint);
        _$effect2((_$p) => _$setProp2(_el$6, "attributes", TextAttributes2.DIM, _$p));
        return _el$6;
      })()
    }));
    _$effect2((_p$) => {
      var _v$ = TextAttributes2.BOLD, _v$2 = TextAttributes2.DIM;
      _v$ !== _p$.e && (_p$.e = _$setProp2(_el$2, "attributes", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$3, "attributes", _v$2, _p$.t));
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$;
  })();
}
function rowAttributes(focused) {
  return focused ? TextAttributes2.BOLD : TextAttributes2.NONE;
}
function targetMetadata(row) {
  return `${row.current ? "[current]" : ""} ${row.inherited ? "[inherited]" : ""} ${row.metadata ?? ""}`.trim();
}
function TargetCheckboxList(props) {
  return (() => {
    var _el$7 = _$createElement2("box"), _el$8 = _$createElement2("box"), _el$9 = _$createElement2("text"), _el$0 = _$createElement2("text"), _el$1 = _$createElement2("scrollbox"), _el$10 = _$createElement2("box");
    _$insertNode2(_el$7, _el$8);
    _$insertNode2(_el$7, _el$1);
    _$setProp2(_el$7, "flexDirection", "column");
    _$setProp2(_el$7, "gap", 1);
    _$insertNode2(_el$8, _el$9);
    _$insertNode2(_el$8, _el$0);
    _$setProp2(_el$8, "flexDirection", "row");
    _$setProp2(_el$8, "justifyContent", "space-between");
    _$insert2(_el$9, () => props.sectionLabel);
    _$insert2(_el$0, () => `${props.rows.filter((row) => row.selected).length}/${props.rows.length} selected`);
    _$insertNode2(_el$1, _el$10);
    var _ref$ = props.onScrollBoxRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$1) : props.onScrollBoxRef = _el$1;
    _$setProp2(_el$1, "focused", true);
    _$setProp2(_el$1, "scrollY", true);
    _$setProp2(_el$1, "flexShrink", 1);
    _$setProp2(_el$10, "flexDirection", "column");
    _$insert2(_el$10, (() => {
      var _c$ = _$memo(() => props.rows.length === 0);
      return () => _c$() ? (() => {
        var _el$11 = _$createElement2("text");
        _$insertNode2(_el$11, _$createTextNode2(`no targets available`));
        _$effect2((_$p) => _$setProp2(_el$11, "attributes", TextAttributes2.DIM, _$p));
        return _el$11;
      })() : _$createComponent4(For, {
        get each() {
          return props.rows;
        },
        children: (row, index) => (() => {
          var _el$13 = _$createElement2("box"), _el$14 = _$createElement2("text"), _el$15 = _$createElement2("text"), _el$16 = _$createElement2("text"), _el$17 = _$createElement2("text");
          _$insertNode2(_el$13, _el$14);
          _$insertNode2(_el$13, _el$15);
          _$insertNode2(_el$13, _el$16);
          _$insertNode2(_el$13, _el$17);
          _$setProp2(_el$13, "flexDirection", "row");
          _$setProp2(_el$14, "width", 2);
          _$insert2(_el$14, () => index() === props.cursor ? "> " : "  ");
          _$setProp2(_el$15, "width", 3);
          _$insert2(_el$15, () => row.selected ? "[x]" : "[ ]");
          _$setProp2(_el$16, "flexGrow", 1);
          _$setProp2(_el$16, "flexShrink", 1);
          _$setProp2(_el$16, "minWidth", 8);
          _$setProp2(_el$16, "marginLeft", 1);
          _$insert2(_el$16, () => row.target.key);
          _$setProp2(_el$17, "flexShrink", 1);
          _$setProp2(_el$17, "minWidth", 8);
          _$setProp2(_el$17, "marginLeft", 1);
          _$insert2(_el$17, () => targetMetadata(row));
          _$effect2((_p$) => {
            var _v$7 = targetRowId(index()), _v$8 = rowAttributes(index() === props.cursor), _v$9 = rowAttributes(index() === props.cursor), _v$0 = rowAttributes(index() === props.cursor), _v$1 = TextAttributes2.DIM;
            _v$7 !== _p$.e && (_p$.e = _$setProp2(_el$13, "id", _v$7, _p$.e));
            _v$8 !== _p$.t && (_p$.t = _$setProp2(_el$14, "attributes", _v$8, _p$.t));
            _v$9 !== _p$.a && (_p$.a = _$setProp2(_el$15, "attributes", _v$9, _p$.a));
            _v$0 !== _p$.o && (_p$.o = _$setProp2(_el$16, "attributes", _v$0, _p$.o));
            _v$1 !== _p$.i && (_p$.i = _$setProp2(_el$17, "attributes", _v$1, _p$.i));
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0,
            o: void 0,
            i: void 0
          });
          return _el$13;
        })()
      });
    })());
    _$effect2((_p$) => {
      var _v$3 = TextAttributes2.BOLD, _v$4 = TextAttributes2.DIM, _v$5 = props.listRows, _v$6 = props.onKeyDown;
      _v$3 !== _p$.e && (_p$.e = _$setProp2(_el$9, "attributes", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp2(_el$0, "attributes", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp2(_el$1, "maxHeight", _v$5, _p$.a));
      _v$6 !== _p$.o && (_p$.o = _$setProp2(_el$1, "onKeyDown", _v$6, _p$.o));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    });
    return _el$7;
  })();
}
function reviewStatusText(status, message) {
  switch (status) {
    case "ready":
      return "apply to write the configuration";
    case "applying":
      return "[applying] writing configuration";
    case "success":
      return `[ok] ${message ?? "applied"}`;
    case "error":
      return `[error] ${message ?? "apply failed"}`;
    default:
      return assertNever2(status);
  }
}
function ReviewSummary(props) {
  return _$createComponent4(SetupFrame, {
    title: "Review",
    get breadcrumb() {
      return [props.scope, props.section];
    },
    get footer() {
      return props.actions;
    },
    get body() {
      return (() => {
        var _el$18 = _$createElement2("box"), _el$19 = _$createElement2("box"), _el$20 = _$createElement2("text"), _el$22 = _$createElement2("text"), _el$23 = _$createElement2("text"), _el$24 = _$createElement2("scrollbox"), _el$25 = _$createElement2("box"), _el$26 = _$createElement2("text");
        _$insertNode2(_el$18, _el$19);
        _$insertNode2(_el$18, _el$23);
        _$insertNode2(_el$18, _el$24);
        _$insertNode2(_el$18, _el$26);
        _$setProp2(_el$18, "flexDirection", "column");
        _$setProp2(_el$18, "gap", 1);
        _$insertNode2(_el$19, _el$20);
        _$insertNode2(_el$19, _el$22);
        _$setProp2(_el$19, "flexDirection", "row");
        _$insertNode2(_el$20, _$createTextNode2(`model`));
        _$setProp2(_el$20, "width", 5);
        _$setProp2(_el$20, "flexShrink", 0);
        _$setProp2(_el$22, "flexShrink", 1);
        _$setProp2(_el$22, "marginLeft", 6);
        _$insert2(_el$22, () => props.model);
        _$insert2(_el$23, () => `${props.targetNames.length} target${props.targetNames.length === 1 ? "" : "s"} selected`);
        _$insertNode2(_el$24, _el$25);
        var _ref$2 = props.onScrollBoxRef;
        typeof _ref$2 === "function" ? _$use(_ref$2, _el$24) : props.onScrollBoxRef = _el$24;
        _$setProp2(_el$24, "focused", true);
        _$setProp2(_el$24, "scrollY", true);
        _$setProp2(_el$24, "flexShrink", 1);
        _$setProp2(_el$25, "flexDirection", "column");
        _$insert2(_el$25, (() => {
          var _c$2 = _$memo(() => props.targetNames.length === 0);
          return () => _c$2() ? (() => {
            var _el$27 = _$createElement2("text");
            _$insertNode2(_el$27, _$createTextNode2(`no targets selected`));
            _$effect2((_$p) => _$setProp2(_el$27, "attributes", TextAttributes2.DIM, _$p));
            return _el$27;
          })() : _$createComponent4(For, {
            get each() {
              return props.targetNames;
            },
            children: (name, index) => (() => {
              var _el$29 = _$createElement2("box"), _el$30 = _$createElement2("text"), _el$31 = _$createElement2("text"), _el$33 = _$createElement2("text");
              _$insertNode2(_el$29, _el$30);
              _$insertNode2(_el$29, _el$31);
              _$insertNode2(_el$29, _el$33);
              _$setProp2(_el$29, "flexDirection", "row");
              _$setProp2(_el$30, "width", 2);
              _$insert2(_el$30, () => index() === props.cursor ? "> " : "  ");
              _$insertNode2(_el$31, _$createTextNode2(`[x]`));
              _$setProp2(_el$31, "width", 3);
              _$setProp2(_el$33, "flexShrink", 1);
              _$setProp2(_el$33, "minWidth", 8);
              _$setProp2(_el$33, "marginLeft", 1);
              _$insert2(_el$33, name);
              _$effect2((_p$) => {
                var _v$16 = targetRowId(index()), _v$17 = rowAttributes(index() === props.cursor), _v$18 = rowAttributes(index() === props.cursor), _v$19 = rowAttributes(index() === props.cursor);
                _v$16 !== _p$.e && (_p$.e = _$setProp2(_el$29, "id", _v$16, _p$.e));
                _v$17 !== _p$.t && (_p$.t = _$setProp2(_el$30, "attributes", _v$17, _p$.t));
                _v$18 !== _p$.a && (_p$.a = _$setProp2(_el$31, "attributes", _v$18, _p$.a));
                _v$19 !== _p$.o && (_p$.o = _$setProp2(_el$33, "attributes", _v$19, _p$.o));
                return _p$;
              }, {
                e: void 0,
                t: void 0,
                a: void 0,
                o: void 0
              });
              return _el$29;
            })()
          });
        })());
        _$insert2(_el$26, () => reviewStatusText(props.status, props.statusMessage));
        _$effect2((_p$) => {
          var _v$10 = TextAttributes2.BOLD, _v$11 = props.modelColumns, _v$12 = TextAttributes2.DIM, _v$13 = props.listRows, _v$14 = props.onKeyDown, _v$15 = TextAttributes2.DIM;
          _v$10 !== _p$.e && (_p$.e = _$setProp2(_el$20, "attributes", _v$10, _p$.e));
          _v$11 !== _p$.t && (_p$.t = _$setProp2(_el$22, "width", _v$11, _p$.t));
          _v$12 !== _p$.a && (_p$.a = _$setProp2(_el$23, "attributes", _v$12, _p$.a));
          _v$13 !== _p$.o && (_p$.o = _$setProp2(_el$24, "maxHeight", _v$13, _p$.o));
          _v$14 !== _p$.i && (_p$.i = _$setProp2(_el$24, "onKeyDown", _v$14, _p$.i));
          _v$15 !== _p$.n && (_p$.n = _$setProp2(_el$26, "attributes", _v$15, _p$.n));
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0,
          n: void 0
        });
        return _el$18;
      })();
    }
  });
}

// src/tui/setup-screens.tsx
var PAGE_STEP = 10;
var NO_MODEL_LABEL = "(no model selected)";
var REVIEW_LABEL = "Review assignments";
var TARGETS_FOOTER = ["up/down, pgup/pgdn", "space, a, n to select", "enter next, backspace back"];
var REVIEW_ACTIONS = ["up/down, pgup/pgdn, home/end", "enter apply", "backspace back"];
var MODEL_BACK_OPTION = "__amm_back__";
var LABELS = {
  opencode: "OpenCode",
  "oh-my": "Oh My OpenAgent",
  agents: "Agents",
  categories: "Categories"
};
function navigationKey(input) {
  switch (input.name) {
    case "up":
      return {
        kind: "move",
        delta: -1
      };
    case "down":
      return {
        kind: "move",
        delta: 1
      };
    case "pageup":
      return {
        kind: "move",
        delta: -PAGE_STEP
      };
    case "pagedown":
      return {
        kind: "move",
        delta: PAGE_STEP
      };
    case "home":
      return {
        kind: "move",
        delta: -input.cursor
      };
    case "end":
      return {
        kind: "move",
        delta: input.count - 1 - input.cursor
      };
    default:
      return null;
  }
}
function targetsKey(input) {
  const navigation = navigationKey(input);
  if (navigation !== null) return navigation;
  switch (input.name) {
    case "space":
      return {
        kind: "select",
        action: {
          type: "toggle"
        }
      };
    case "a":
      return {
        kind: "select",
        action: {
          type: "select-all"
        }
      };
    case "n":
      return {
        kind: "select",
        action: {
          type: "clear-all"
        }
      };
    case "return":
      return {
        kind: "continue"
      };
    case "backspace":
      return {
        kind: "back"
      };
    default:
      return null;
  }
}
function reviewKey(input) {
  const navigation = navigationKey(input);
  if (navigation !== null) return navigation;
  switch (input.name) {
    case "return":
      return {
        kind: "continue"
      };
    case "backspace":
      return {
        kind: "back"
      };
    default:
      return null;
  }
}
function targetRows(state, data) {
  return state.targets.map((target) => {
    const model = data.currentModels.get(target.id);
    return {
      target,
      selected: state.selectedTargetIds.includes(target.id),
      current: model !== void 0,
      inherited: data.inheritedIds.has(target.id),
      metadata: model ?? null
    };
  });
}
function selectedNames(state) {
  const selected = new Set(state.selectedTargetIds);
  return state.targets.filter((target) => selected.has(target.id)).map((target) => target.key);
}
function hubScreen(props) {
  const DialogSelect = props.DialogSelect;
  const choices = [...props.sections, "review"];
  return _$createComponent5(DialogSelect, {
    get title() {
      return props.title;
    },
    get options() {
      return choices.map((choice) => ({
        title: choice === "review" ? REVIEW_LABEL : LABELS[choice],
        value: choice
      }));
    },
    onSelect: (option) => props.onSelect(option.value)
  });
}
function modelScreen(props) {
  const DialogSelect = props.DialogSelect;
  return _$createComponent5(DialogSelect, _$mergeProps({
    get title() {
      return `Select model for ${LABELS[props.section]}`;
    },
    get options() {
      return props.options;
    }
  }, () => props.current === null ? {} : {
    current: props.current
  }, {
    onSelect: (option) => props.onSelect(option.value)
  }));
}
function targetsScreen(props) {
  return _$createComponent5(SetupFrame, {
    get title() {
      return props.title;
    },
    get breadcrumb() {
      return [LABELS[props.scope], LABELS[props.state.section]];
    },
    get body() {
      return _$createComponent5(TargetCheckboxList, {
        get sectionLabel() {
          return LABELS[props.state.section];
        },
        get rows() {
          return targetRows(props.state, props.data);
        },
        get cursor() {
          return props.state.cursor;
        },
        get listRows() {
          return props.listRows;
        },
        get onKeyDown() {
          return props.onKeyDown;
        },
        get onScrollBoxRef() {
          return props.onScrollBoxRef;
        }
      });
    },
    footer: TARGETS_FOOTER
  });
}
function reviewScreen(props) {
  return _$createComponent5(ReviewSummary, {
    get scope() {
      return LABELS[props.scope];
    },
    get section() {
      return LABELS[props.state.section];
    },
    get targetNames() {
      return selectedNames(props.state);
    },
    get model() {
      return props.state.model ?? NO_MODEL_LABEL;
    },
    get modelColumns() {
      return props.modelColumns;
    },
    get cursor() {
      return props.state.reviewCursor;
    },
    get listRows() {
      return props.listRows;
    },
    get status() {
      return props.error === null ? "ready" : "error";
    },
    get statusMessage() {
      return props.error;
    },
    actions: REVIEW_ACTIONS,
    get onKeyDown() {
      return props.onKeyDown;
    },
    get onScrollBoxRef() {
      return props.onScrollBoxRef;
    }
  });
}

// src/tui/setup-state.ts
function assertNever3(value) {
  return value;
}
function createTargetId(kind, key) {
  return `${kind}:${key}`;
}
function createSetupTarget(kind, key) {
  return { id: createTargetId(kind, key), kind, key };
}
function sectionKind(section) {
  switch (section) {
    case "agents":
      return "agent";
    case "categories":
      return "category";
    default:
      return assertNever3(section);
  }
}
function clampCursor(cursor, length) {
  if (length === 0) return 0;
  return Math.max(0, Math.min(length - 1, cursor));
}
function createInitialSetupState(definition) {
  return {
    phase: "hub",
    scope: null,
    section: null,
    sectionCursor: 0,
    availableTargets: definition.targets.map((target) => createSetupTarget(target.kind, target.key)),
    models: [...definition.models]
  };
}
function beginTargets(state, scope, section) {
  const kind = sectionKind(section);
  return {
    phase: "targets",
    scope,
    section,
    availableTargets: state.availableTargets,
    targets: state.availableTargets.filter((target) => target.kind === kind),
    selectedTargetIds: [],
    models: [...state.models],
    cursor: 0,
    modelCursor: 0,
    reviewCursor: 0,
    model: null
  };
}
function close(outcome, request) {
  return { phase: "closed", outcome, request };
}
function canApply(state) {
  switch (state.phase) {
    case "review":
      return state.selectedTargetIds.length > 0 && state.model !== null && state.model.length > 0;
    case "hub":
    case "targets":
    case "model":
    case "closed":
      return false;
    default:
      return assertNever3(state);
  }
}
function reduceHub(state, action) {
  switch (action.type) {
    case "select-scope":
      return { ...state, scope: action.scope, section: null, sectionCursor: 0 };
    case "select-section":
      if (state.scope === null) return state;
      return beginTargets(state, state.scope, action.section);
    case "move-cursor":
      return { ...state, sectionCursor: clampCursor(state.sectionCursor + action.delta, 2) };
    default:
      return state;
  }
}
function reduceTargets(state, action) {
  switch (action.type) {
    case "move-cursor":
      return { ...state, cursor: clampCursor(state.cursor + action.delta, state.targets.length) };
    case "toggle": {
      const target = state.targets[state.cursor];
      if (target === void 0) return state;
      const selected = state.selectedTargetIds.includes(target.id);
      return {
        ...state,
        selectedTargetIds: selected ? state.selectedTargetIds.filter((id) => id !== target.id) : [...state.selectedTargetIds, target.id]
      };
    }
    case "select-all":
      if (state.targets.length === 0) return state;
      return { ...state, selectedTargetIds: state.targets.map((target) => target.id) };
    case "clear-all":
      if (state.selectedTargetIds.length === 0) return state;
      return { ...state, selectedTargetIds: [] };
    case "continue":
      if (state.selectedTargetIds.length === 0) return state;
      return { ...state, phase: "model" };
    default:
      return state;
  }
}
function reduceModel(state, action) {
  switch (action.type) {
    case "move-cursor":
      return { ...state, modelCursor: clampCursor(state.modelCursor + action.delta, state.models.length) };
    case "select-model":
      if (action.model.length === 0 || !state.models.includes(action.model)) return state;
      return { ...state, phase: "review", model: action.model };
    default:
      return state;
  }
}
function reduceReview(state, action) {
  if (action.type === "move-cursor") {
    return { ...state, reviewCursor: clampCursor(state.reviewCursor + action.delta, state.selectedTargetIds.length) };
  }
  if (action.type !== "apply" || !canApply(state)) return state;
  if (state.model === null) return state;
  return close("applied", {
    scope: state.scope,
    section: state.section,
    targetIds: [...state.selectedTargetIds],
    model: state.model
  });
}
function goBack(state) {
  switch (state.phase) {
    case "targets":
      return {
        phase: "hub",
        scope: state.scope,
        section: state.section,
        sectionCursor: 0,
        availableTargets: state.availableTargets,
        models: state.models
      };
    case "model":
      return { ...state, phase: "targets" };
    case "review":
      return { ...state, phase: "model" };
    case "hub":
    case "closed":
      return state;
    default:
      return assertNever3(state);
  }
}
function cancel(state) {
  if (state.phase === "closed") return state;
  return close("cancelled", null);
}
function reducePhase(state, action) {
  switch (state.phase) {
    case "hub":
      return reduceHub(state, action);
    case "targets":
      return reduceTargets(state, action);
    case "model":
      return reduceModel(state, action);
    case "review":
      return reduceReview(state, action);
    case "closed":
      return state;
    default:
      return assertNever3(state);
  }
}
function setupReducer(state, action) {
  switch (action.type) {
    case "back":
      return goBack(state);
    case "cancel":
      return cancel(state);
    default:
      return reducePhase(state, action);
  }
}

// src/tui/viewport.ts
var HOST_CHROME_RATIO = 0.27;
var HOST_CHROME_EXTRA_ROWS = 2;
var MIN_TERMINAL_ROWS = 8;
var MIN_TERMINAL_COLUMNS = 20;
var FALLBACK_TERMINAL_ROWS = 40;
var FALLBACK_TERMINAL_COLUMNS = 120;
var MIN_LIST_ROWS = 1;
var MAX_LIST_ROWS = 20;
var TARGETS_CHROME_ROWS = 8;
var REVIEW_CHROME_ROWS = 13;
var MODEL_GUTTER_COLUMNS = 11;
var SCROLLBAR_COLUMNS = 1;
var MIN_VALUE_COLUMNS = 24;
var MAX_VALUE_COLUMNS = 63;
function terminalRows(api) {
  const rows = api.renderer.height;
  if (!Number.isFinite(rows) || rows < MIN_TERMINAL_ROWS) return FALLBACK_TERMINAL_ROWS;
  return Math.floor(rows);
}
function terminalColumns(api) {
  const columns = api.renderer.width;
  if (!Number.isFinite(columns) || columns < MIN_TERMINAL_COLUMNS) return FALLBACK_TERMINAL_COLUMNS;
  return Math.floor(columns);
}
function hostReserveRows(api) {
  return Math.ceil(terminalRows(api) * HOST_CHROME_RATIO) + HOST_CHROME_EXTRA_ROWS;
}
function listRows(api, chromeRows) {
  const budget = terminalRows(api) - hostReserveRows(api) - chromeRows;
  return Math.max(MIN_LIST_ROWS, Math.min(MAX_LIST_ROWS, budget));
}
function valueColumns(api) {
  const free = terminalColumns(api) - MODEL_GUTTER_COLUMNS - SCROLLBAR_COLUMNS;
  return Math.max(MIN_VALUE_COLUMNS, Math.min(MAX_VALUE_COLUMNS, free));
}
function valueRows(length, columns) {
  return Math.max(1, Math.ceil(length / columns));
}
function reviewChromeRows(api, model) {
  return REVIEW_CHROME_ROWS + valueRows(model.length, valueColumns(api)) - 1;
}

// src/tui/setup-flows.tsx
function assertNever4(value) {
  return value;
}
function warn(api, message) {
  api.ui.toast({
    variant: "warning",
    title: "Agent Model Manager",
    message,
    duration: 3e3
  });
}
function runSetupFlow(api, options) {
  const {
    models,
    scope,
    title
  } = options;
  if (models.length === 0) {
    warn(api, "No models found in the OpenCode configuration");
    return;
  }
  const data = options.collect();
  if (data.targets.length === 0) {
    warn(api, "No targets found in the active configuration");
    return;
  }
  const modelOptions = [...models.map((model) => ({
    title: model.title,
    value: model.value
  })), {
    title: "Back",
    value: MODEL_BACK_OPTION
  }];
  let state = createInitialSetupState({
    targets: data.targets,
    models: models.map((model) => model.value)
  });
  let pendingRowId = null;
  let reviewError = null;
  function showDialog(render2, size) {
    api.ui.dialog.replace(render2);
    api.ui.dialog.setSize(size);
  }
  function onScrollBoxRef(instance) {
    if (pendingRowId === null) return;
    const rowId = pendingRowId;
    pendingRowId = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => instance.scrollChildIntoView(rowId));
    });
  }
  function moveCursor(delta) {
    update({
      type: "move-cursor",
      delta
    });
  }
  function update(action) {
    state = setupReducer(state, action);
    render();
  }
  function onHubSelect(choice) {
    if (choice === "review") {
      api.ui.dialog.clear();
      options.showAssignments();
      return;
    }
    state = setupReducer(state, {
      type: "select-scope",
      scope
    });
    state = setupReducer(state, {
      type: "select-section",
      section: choice
    });
    render();
  }
  function onModelSelect(value) {
    update(value === MODEL_BACK_OPTION ? {
      type: "back"
    } : {
      type: "select-model",
      model: value
    });
  }
  function onTargetsKeyDown(event) {
    if (event.ctrl || event.meta || event.shift) return;
    if (state.phase !== "targets") return;
    const key = targetsKey({
      name: event.name,
      cursor: state.cursor,
      count: state.targets.length
    });
    if (key === null) return;
    event.preventDefault();
    if (key.kind === "move") return moveCursor(key.delta);
    if (key.kind === "select") return update(key.action);
    if (key.kind === "back") return update({
      type: "back"
    });
    if (state.selectedTargetIds.length === 0) {
      warn(api, "Select at least one target before continuing");
      return;
    }
    update({
      type: "continue"
    });
  }
  function onReviewKeyDown(event) {
    if (event.ctrl || event.meta || event.shift) return;
    if (state.phase !== "review") return;
    const key = reviewKey({
      name: event.name,
      cursor: state.reviewCursor,
      count: state.selectedTargetIds.length
    });
    if (key === null) return;
    event.preventDefault();
    if (key.kind === "move") {
      return update({
        type: "move-cursor",
        delta: key.delta
      });
    }
    if (key.kind === "back") {
      reviewError = null;
      return update({
        type: "back"
      });
    }
    applySelection(state);
  }
  function applySelection(current) {
    if (!canApply(current)) return;
    const applied = setupReducer(current, {
      type: "apply"
    });
    if (applied.phase !== "closed" || applied.request === null) return;
    try {
      options.apply(applied.request);
    } catch (error) {
      reviewError = error instanceof Error ? error.message : String(error);
      showError(api, error);
      render();
      return;
    }
    const count = applied.request.targetIds.length;
    api.ui.dialog.clear();
    api.ui.toast({
      variant: "success",
      title: "Model assignments updated",
      message: `${applied.request.model} applied to ${count} target${count === 1 ? "" : "s"}`,
      duration: 2500
    });
  }
  function render() {
    const current = state;
    const select = api.ui.DialogSelect;
    if (current.phase === "hub") {
      pendingRowId = null;
      return showDialog(() => hubScreen({
        DialogSelect: select,
        title,
        sections: options.sections,
        onSelect: onHubSelect
      }), "medium");
    }
    if (current.phase === "targets") {
      pendingRowId = targetRowId(current.cursor);
      return showDialog(() => targetsScreen({
        title,
        scope,
        state: current,
        data,
        listRows: listRows(api, TARGETS_CHROME_ROWS),
        onKeyDown: onTargetsKeyDown,
        onScrollBoxRef
      }), "large");
    }
    if (current.phase === "model") {
      pendingRowId = null;
      return showDialog(() => modelScreen({
        DialogSelect: select,
        section: current.section,
        options: modelOptions,
        current: current.model,
        onSelect: onModelSelect
      }), "medium");
    }
    if (current.phase === "review") {
      const model = current.model ?? "";
      pendingRowId = targetRowId(current.reviewCursor);
      return showDialog(() => reviewScreen({
        scope,
        state: current,
        error: reviewError,
        listRows: listRows(api, reviewChromeRows(api, model)),
        modelColumns: valueColumns(api),
        onKeyDown: onReviewKeyDown,
        onScrollBoxRef
      }), "large");
    }
    pendingRowId = null;
    if (current.phase === "closed") return api.ui.dialog.clear();
    return assertNever4(current);
  }
  render();
}

// src/tui/setup-targets.ts
var AGENT_PREFIX = "agent:";
var CATEGORY_PREFIX = "category:";
function isAgentTargetId(id) {
  return id.startsWith(AGENT_PREFIX);
}
function targetIdToTarget(id) {
  if (isAgentTargetId(id)) {
    return { kind: "agent", key: id.slice(AGENT_PREFIX.length) };
  }
  return { kind: "category", key: id.slice(CATEGORY_PREFIX.length) };
}
function readAssignment(layer, kind, key) {
  const entries = kind === "agent" ? layer.agents ?? {} : layer.categories ?? {};
  return entries[key]?.model;
}
function collectOhMySetupTargets(config, section) {
  const layer = getOhMyConfigLayer(config, section);
  const targets = [];
  const currentModels = /* @__PURE__ */ new Map();
  const inheritedIds = /* @__PURE__ */ new Set();
  for (const target of getOhMyTargets(config, section)) {
    const setupTarget = createSetupTarget(target.kind, target.key);
    targets.push(setupTarget);
    const model = readAssignment(layer, target.kind, target.key);
    if (model === void 0) {
      inheritedIds.add(setupTarget.id);
      continue;
    }
    currentModels.set(setupTarget.id, model);
  }
  return { targets, currentModels, inheritedIds };
}
function collectOpenCodeSetupTargets(configPath, stateAgents) {
  const persisted = readOpenCodeAgentModels(configPath);
  const names = /* @__PURE__ */ new Set([...Object.keys(stateAgents ?? {}), ...Object.keys(persisted)]);
  const targets = [];
  const currentModels = /* @__PURE__ */ new Map();
  const inheritedIds = /* @__PURE__ */ new Set();
  for (const name of names) {
    const setupTarget = createSetupTarget("agent", name);
    targets.push(setupTarget);
    const model = persisted[name] ?? stateAgents?.[name]?.model;
    if (model === void 0) {
      inheritedIds.add(setupTarget.id);
      continue;
    }
    currentModels.set(setupTarget.id, model);
  }
  return { targets, currentModels, inheritedIds };
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

// src/tui/setup-entry.ts
function openOpenCodeSetup(api, openCodeConfigPath, models) {
  runSetupFlow(api, {
    scope: "opencode",
    title: "OpenCode agents setup",
    sections: ["agents"],
    models,
    collect: () => collectOpenCodeSetupTargets(openCodeConfigPath, api.state.config.agent),
    showAssignments: () => handleOpenCodeStatusCommand(api, openCodeConfigPath),
    apply: (request) => setOpenCodeAgentModels(
      openCodeConfigPath,
      request.targetIds.map((id) => targetIdToTarget(id).key),
      request.model
    )
  });
}
function openOhMySetup(api, configLocation, models) {
  const section = configLocation.section ?? "root";
  runSetupFlow(api, {
    scope: "oh-my",
    title: "Oh My OpenAgent setup",
    sections: ["agents", "categories"],
    models,
    collect: () => collectOhMySetupTargets(readConfig(configLocation.path), section),
    showAssignments: () => handleStatusCommand(api, configLocation),
    apply: (request) => {
      const config = readConfig(configLocation.path);
      const layer = getOhMyConfigLayer(config, section);
      applyModelToOhMyTargets(layer, request.targetIds.map(targetIdToTarget), request.model);
      writeConfig(configLocation.path, config, section);
    }
  });
}

// src/tui/commands.tsx
var CATEGORY = "Agent Model Manager";
function guard(api, run) {
  return () => {
    try {
      run();
    } catch (error) {
      showError(api, error);
    }
  };
}
function registerModelManagerCommands(api, configLocation, openCodeConfigPath) {
  const models = getModelOptions(api);
  const ohMyCommands = configLocation ? [{
    name: "amm-ohmy-setup",
    title: "Oh My OpenAgent setup",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-ohmy-setup",
    slashAliases: ["amm", "model-config", "agent-config"],
    suggested: true,
    run: guard(api, () => openOhMySetup(api, configLocation, models))
  }, {
    name: "amm",
    title: "Configure oh-my agent/category models",
    category: CATEGORY,
    namespace: "palette",
    hidden: true,
    run: guard(api, () => handleConfigCommand(api, configLocation, models))
  }, {
    name: "amm-all-ohmy",
    title: "Set one model for all oh-my agents/categories",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-all-ohmy",
    hidden: true,
    run: guard(api, () => handleOhMyBulkCommand(api, configLocation, models))
  }, {
    name: "amm-status",
    title: "Show oh-my model assignments",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-status",
    hidden: true,
    run: guard(api, () => handleStatusCommand(api, configLocation))
  }] : [];
  const openCodeCommands = [{
    name: "amm-opencode-setup",
    title: "OpenCode agents setup",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-opencode-setup",
    slashAliases: ["amm-opencode"],
    suggested: true,
    run: guard(api, () => openOpenCodeSetup(api, openCodeConfigPath, models))
  }, {
    name: "amm-opencode",
    title: "Configure an OpenCode agent model",
    category: CATEGORY,
    namespace: "palette",
    hidden: true,
    run: guard(api, () => handleOpenCodeConfigCommand(api, openCodeConfigPath, models))
  }, {
    name: "amm-opencode-all",
    title: "Set one model for all OpenCode agents",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-opencode-all",
    hidden: true,
    run: guard(api, () => handleOpenCodeBulkCommand(api, openCodeConfigPath, models))
  }, {
    name: "amm-opencode-status",
    title: "Show OpenCode agent models",
    category: CATEGORY,
    namespace: "palette",
    slashName: "amm-opencode-status",
    hidden: true,
    run: guard(api, () => handleOpenCodeStatusCommand(api, openCodeConfigPath))
  }];
  const commands = [...ohMyCommands, ...openCodeCommands];
  const primaryCommand = configLocation ? "amm-ohmy-setup" : "amm-opencode-setup";
  const disposeCommands = api.keymap.registerLayer({
    commands
  });
  const disposeBinding = api.keymap.registerLayer({
    mode: "base",
    bindings: [{
      key: "ctrl+shift+m",
      cmd: primaryCommand,
      desc: "Configure models"
    }]
  });
  for (const dispose of [disposeCommands, disposeBinding]) {
    if (typeof dispose === "function") api.lifecycle.onDispose(dispose);
  }
}

// src/version.ts
import { readFileSync as readFileSync2 } from "node:fs";
var PACKAGE_MANIFEST_URL = new URL("../package.json", import.meta.url);
var UNKNOWN_VERSION = "unknown";
function normalizeVersion(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function readManifestVersion() {
  try {
    const manifest = JSON.parse(readFileSync2(PACKAGE_MANIFEST_URL, "utf-8"));
    if (typeof manifest !== "object" || manifest === null) return void 0;
    return normalizeVersion(manifest.version);
  } catch {
    return void 0;
  }
}
function resolvePluginVersion(metaVersion) {
  return normalizeVersion(metaVersion) ?? readManifestVersion() ?? UNKNOWN_VERSION;
}

// src/tui.tsx
var PLUGIN_ID = "agent-model-manager";
function isOhMyOpenAgentInstalled(api) {
  return (api.state.config.plugin ?? []).some((entry) => {
    const spec = Array.isArray(entry) ? entry[0] : entry;
    return typeof spec === "string" && (spec === "oh-my-openagent" || spec.startsWith("oh-my-openagent@") || spec === "oh-my-opencode" || spec.startsWith("oh-my-opencode@"));
  });
}
var tui = async (api, _options, meta) => {
  const projectDir = api.state.path.directory || process.cwd();
  const configLocation = findConfig(projectDir);
  const ohMyAvailable = configLocation !== null && isOhMyOpenAgentInstalled(api);
  const version = resolvePluginVersion(meta.version);
  registerModelManagerCommands(api, ohMyAvailable ? configLocation : null, api.state.path.config);
  api.ui.toast({
    variant: ohMyAvailable ? "success" : "info",
    title: "Agent Model Manager",
    message: ohMyAvailable ? `Loaded v${version}` : `Loaded v${version}; oh-my-openagent is unavailable`,
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
