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
export {
  applyModelToOhMyEntries,
  applyModelToOhMyTargets
};
//# sourceMappingURL=operations.js.map
