let recipesData = { items: [], crafts: [] };
let itemsById = {};
let craftsById = {};
let producerIndex = {};   // itemId -> { craft, outputCount } (active/chosen producer)
let producersByItem = {}; // itemId -> array of { craft, outputCount } (all valid producers)
let preferredProducer = {}; // itemId -> craftId (user preferred producer stored in localStorage)
let totals = {};
let containers = [];
let unlockedCraftIds = [];
let oneTimeCompletedCraftIds = [];
let builtWgoIds = [];
let pinned = {};
let bundles = [];
let expandedTrees = new Set(); // craft ids whose crafting tree is expanded on the Pinned tab
let expandedTotalsTrees = new Set(); // bundle/totals keys whose crafting trees are expanded
let lastPinnedFingerprint = null;

const MAX_TREE_DEPTH = 6;

const PRETTIFIED_GROUPS = {
  "church_blockage": "Church Blockages",
  "base_blockage": "Base Blockages",
  "basement_blockage": "Basement Blockages",
};

function prettify(id) {
  if (!id) return "";
  if (PRETTIFIED_GROUPS[id]) return PRETTIFIED_GROUPS[id];
  let clean = id
    .replace(/^gr_/i, "")
    .replace(/^conv_/, "Conveyor: ")
    .replace(/_[spr]$/i, "")
    .replace(/_place$/i, "")
    .replace(/_clr\d+(_xxs)?$/i, "")
    .replace(/[:/_]+/g, " ")
    .trim();
  return clean
    .split(" ")
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const NAME_OVERRIDES = {
  "garden_farming_base_1": "Garden Upgrade (1)",
  "garden_farming_base_2": "Garden Upgrade (2)",
  "garden_farming_base_1_s": "Garden Upgrade (1)",
  "garden_farming_base_2_s": "Garden Upgrade (2)",
  "well_garden_upgrade": "Garden Well Upgrade",
  "well_garden_upgrade_s": "Garden Well Upgrade",
  "kitchen_table_repair": "Kitchen Table Repair",
  "kitchen_oven_repair": "Kitchen Stove Repair",
  "kitchen_table_up": "Kitchen Table Upgrade",
  "kitchen_table_up_s": "Kitchen Table Upgrade",
  "kitchen_oven_up": "Kitchen Stove Upgrade",
  "kitchen_oven_up_s": "Kitchen Stove Upgrade",
  "unlock_graveyard_zone_1": "Unlock Graveyard Zone 1",
  "unlock_graveyard_zone_1_s": "Unlock Graveyard Zone 1",
  "unlock_graveyard_zone_2": "Unlock Graveyard Zone 2",
  "unlock_graveyard_zone_2_s": "Unlock Graveyard Zone 2",
  "unlock_graveyard_zone_3": "Unlock Graveyard Zone 3",
  "unlock_graveyard_zone_3_s": "Unlock Graveyard Zone 3",
  "zombie_supplier_station_house": "Zombie Supplier Station",
  "garden_compost_pile": "Garden Compost Pile",
  "garden_compost_pile_s": "Garden Compost Pile",
  "garden_compost_pile_upgrade": "Garden Compost Pile Upgrade",
  "garden_compost_pile_upgrade_s": "Garden Compost Pile Upgrade",
  "home_upgrade": "Home Upgrade",
  "home_attic": "Home Attic",
  "upgrade_church_1": "Church Upgrade I",
  "upgrade_church_1_s": "Church Upgrade I",
  "upgrade_church_2": "Church Upgrade II",
  "upgrade_church_2_s": "Church Upgrade II",
  "upgrade_church_3": "Church Upgrade III",
  "upgrade_church_3_s": "Church Upgrade III",
  "upgrade_church_2_tech": "Church Upgrade II (Tech)",
  "upgrade_church_2_tech_s": "Church Upgrade II (Tech)",
  "upgrade_church_3_tech": "Church Upgrade III (Tech)",
  "upgrade_church_3_tech_s": "Church Upgrade III (Tech)",
  "church_train_unlock": "Church Train Unlock",
  "church_train_unlock_s": "Church Train Unlock",
  "upgrade_graveyard_fence_1": "Graveyard Fence Upgrade I",
  "upgrade_graveyard_fence_2": "Graveyard Fence Upgrade II",
  "vineyard_upgrade": "Vineyard Upgrade",
  "conveyor_storage_upgrade": "Conveyor Storage Upgrade",
  "bed_upgrade": "Bed Upgrade",
  "church_blockage_1": "Church Blockage 1",
  "church_blockage_2": "Church Blockage 2",
  "church_blockage_3": "Church Blockage 3",
  "church_blockage_4": "Church Blockage 4",
  "church_blockage_5": "Church Blockage 5",
  "church_blockage_6": "Church Blockage 6",
  "church_blockage_7": "Church Blockage 7",
  "church_blockage_8": "Church Blockage 8",
  "church_blockage_9": "Church Blockage 9",
};

function displayNameFor(itemId) {
  if (!itemId) return "";
  if (NAME_OVERRIDES[itemId]) return NAME_OVERRIDES[itemId];
  const item = itemsById[itemId];
  let name = (item && item.displayName) ? item.displayName : prettify(itemId);
  const match = itemId.match(/:(\d+)$/);
  if (match) {
    const q = match[1];
    const qualityNames = { "1": "Bronze", "2": "Silver", "3": "Gold" };
    const qName = qualityNames[q] || `Tier ${q}`;
    if (!name.includes(qName) && !name.match(/\b(I|II|III|IV)\b/)) {
      name = `${name} (${qName})`;
    }
  }
  return name;
}

function iconImgTag(itemId) {
  if (!itemId) return "";
  return `<img class="item-icon" src="/icons/i_${itemId}.png" onerror="this.remove()" alt="">`;
}

async function fetchJSON(url, opts) {
  const sep = url.includes("?") ? "&" : "?";
  const nocacheUrl = `${url}${sep}_t=${Date.now()}`;
  const res = await fetch(nocacheUrl, { cache: "no-store", ...opts });
  return res.json();
}

async function refreshStatus() {
  const s = await fetchJSON("/api/status");
  const el = document.getElementById("status");
  const banner = document.getElementById("config-banner");
  if (!s.found) {
    el.textContent = "Game install not found";
    el.className = "status status--bad";
    banner.hidden = false;
    return s;
  }
  banner.hidden = true;
  const newText = (s.recipesFound && s.inventoryFound)
    ? "Connected — live"
    : "Waiting for game data (launch GK2 with the plugin installed)";
  const newClass = (s.recipesFound && s.inventoryFound)
    ? "status status--ok"
    : "status status--bad";
  if (el.textContent !== newText) el.textContent = newText;
  if (el.className !== newClass) el.className = newClass;
  return s;
}

function buildProducerIndex() {
  producerIndex = {};
  producersByItem = {};

  try {
    const saved = localStorage.getItem("gk2_preferred_producers");
    if (saved) preferredProducer = JSON.parse(saved);
  } catch (e) {}

  for (const craft of recipesData.crafts) {
    if (!craftHasContent(craft) || craftIsTestJunk(craft)) continue;
    for (const out of craft.outputItems) {
      if (!out.itemId) continue;
      const outputCount = out.count || 1;
      if (!producersByItem[out.itemId]) producersByItem[out.itemId] = [];
      if (!producersByItem[out.itemId].some(p => p.craft.id === craft.id)) {
        producersByItem[out.itemId].push({ craft, outputCount });
      }
    }
  }

  for (const itemId in producersByItem) {
    const candidates = producersByItem[itemId];
    if (candidates.length === 1) {
      producerIndex[itemId] = candidates[0];
      continue;
    }

    const prefId = preferredProducer[itemId];
    const userMatch = candidates.find(c => c.craft.id === prefId);
    if (userMatch) {
      producerIndex[itemId] = userMatch;
      continue;
    }

    let best = candidates[0];
    const readyCandidate = candidates.find(c => craftIsCraftable(c.craft, 1));
    const learnedCandidate = candidates.find(c => craftIsLearned(c.craft));
    if (readyCandidate) best = readyCandidate;
    else if (learnedCandidate) best = learnedCandidate;
    producerIndex[itemId] = best;
  }
}

function setPreferredProducer(itemId, craftId) {
  preferredProducer[itemId] = craftId;
  try {
    localStorage.setItem("gk2_preferred_producers", JSON.stringify(preferredProducer));
  } catch (e) {}
  buildProducerIndex();
  renderPinned();
  const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
  if (activeTab === "crafts") renderSearch();
  else if (activeTab === "browse") renderBrowse();
}

async function loadRecipes() {
  recipesData = await fetchJSON("/api/recipes");
  itemsById = {};
  for (const item of recipesData.items) itemsById[item.id] = item;
  craftsById = {};
  for (const craft of recipesData.crafts) craftsById[craft.id] = craft;
  buildProducerIndex();
}

async function loadInventory() {
  const inv = await fetchJSON("/api/inventory");
  totals = inv.totals || {};
  containers = inv.containers || [];
  unlockedCraftIds = inv.unlockedCraftIds || [];
  oneTimeCompletedCraftIds = inv.oneTimeCompletedCraftIds || [];
  builtWgoIds = inv.builtWgoIds || [];
  buildProducerIndex();
}

function sourcesFor(itemId) {
  const rows = [];
  for (const c of containers) {
    const stack = c.items.find(i => i.id === itemId);
    if (!stack || stack.count <= 0) continue;
    let label;
    if (c.source === "player") label = "Inventory";
    else if (c.source === "toolbelt") label = "Tool Belt";
    else if (c.zoneId) label = `${prettify(c.wgoId || "Chest")} (${prettify(c.zoneId)})`;
    else label = `${prettify(c.wgoId || "Chest")} (${Math.round(c.x)}, ${Math.round(c.y)}, ${Math.round(c.z)})`;
    rows.push({ label, count: stack.count });
  }
  return rows;
}

async function loadPinned() {
  pinned = await fetchJSON("/api/pinned");
}

function craftHasContent(craft) {
  return craft && Array.isArray(craft.needItems) && craft.needItems.length > 0;
}

function craftIsCraftable(craft, qty) {
  return craft.needItems.every(n => (totals[n.itemId] || 0) >= n.count * qty);
}

function craftIsLearned(craft) {
  return !craft.isNeedsUnlock || unlockedCraftIds.includes(craft.id);
}

const WGO_ALIASES = {
  "well_garden_upgrade": ["well_garden_2", "well_garden_1"],
  "well_garden_upgrade_s": ["well_garden_2", "well_garden_1"],
  "zombie_supplier_station": ["zombie_supplier_station_mini"],
  "zombie_supplier_station_p": ["zombie_supplier_station_mini"],
  "chest_rough": ["wood_container"],
  "chest_rough_place_p": ["wood_container"],
  "unlock_graveyard_zone_1": ["graveyard_module_grave_1"],
  "unlock_graveyard_zone_1_s": ["graveyard_module_grave_1"],
  "unlock_graveyard_zone_2": ["graveyard_module_grave_2", "graveyard_module_grave_3", "graveyard_module_grave_4"],
  "unlock_graveyard_zone_2_s": ["graveyard_module_grave_2", "graveyard_module_grave_3", "graveyard_module_grave_4"],
  "unlock_graveyard_zone_3": ["graveyard_module_grave_3", "graveyard_module_grave_4"],
  "unlock_graveyard_zone_3_s": ["graveyard_module_grave_3", "graveyard_module_grave_4"],
  "garden_compost_pile": ["compost_pile_1", "compost_pile_2"],
  "garden_compost_pile_s": ["compost_pile_1", "compost_pile_2"],
  "garden_compost_pile_upgrade": ["compost_pile_2"],
  "garden_compost_pile_upgrade_s": ["compost_pile_2"],
  "kitchen_table_repair": ["kitchen_table", "kitchen_table_t2"],
  "kitchen_oven_repair": ["kitchen_oven", "kitchen_oven_t2"],
  "kitchen_table_up_s": ["kitchen_table_t2"],
  "kitchen_table_up": ["kitchen_table_t2"],
  "kitchen_oven_up_s": ["kitchen_oven_t2"],
  "kitchen_oven_up": ["kitchen_oven_t2"],
  "upgrade_church_1": ["church_t1", "church_t2", "church_t3"],
  "upgrade_church_1_s": ["church_t1", "church_t2", "church_t3"],
  "upgrade_church_2": ["church_t2", "church_t3"],
  "upgrade_church_2_s": ["church_t2", "church_t3"],
  "upgrade_church_3": ["church_t3"],
  "upgrade_church_3_s": ["church_t3"],
  "upgrade_church_2_tech": ["church_t2", "church_t3"],
  "upgrade_church_2_tech_s": ["church_t2", "church_t3"],
  "upgrade_church_3_tech": ["church_t3"],
  "upgrade_church_3_tech_s": ["church_t3"],
  "church_train_unlock": ["church_train_unlock"],
  "church_train_unlock_s": ["church_train_unlock"],
};

const SCENE_STATIC_MARKERS = new Set([
  "tree_apple_clr1_xxs", "bush_ashberry_clr1_xxs", "bush_rhodod_clr1_xxs", "bush_blueberry_clr1_xxs",
  "garden_extension_trees_bushes", "garden_extension_trees_bushes_p"
]);

function normalizeWgoId(s) {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/_[spr]$/i, "")
    .replace(/_place$/i, "");
}

function isBlockageCraft(craft) {
  if (!craft || !craft.id) return false;
  const cid = craft.id.toLowerCase();
  if (cid.includes("kitchen_table_repair") || cid.includes("kitchen_oven_repair")) return false;
  return cid.includes("blockage") || cid.includes("ladder_broken");
}

function craftIsCompleted(craft) {
  if (!craft || !craftHasContent(craft)) return false;

  const cid = craft.id;
  const cidLower = cid.toLowerCase();
  const normCid = normalizeWgoId(cid);
  const outs = (craft.outputItems || []).map(o => o.itemId).filter(Boolean);
  const normOuts = outs.map(normalizeWgoId);

  // Exclude scene static markers & wild flora
  if (SCENE_STATIC_MARKERS.has(cid) || outs.some(o => SCENE_STATIC_MARKERS.has(o))) {
    return false;
  }

  // 1. One-time completed craft IDs registered by game engine
  if (oneTimeCompletedCraftIds.includes(cid)) return true;

  const builtSet = new Set(builtWgoIds.map(w => w.toLowerCase()));
  const normBuiltSet = new Set(builtWgoIds.map(normalizeWgoId));

  // 2. Blockage crafts: Standing blockage WGOs mean uncleared
  if (isBlockageCraft(craft)) {
    // If any obstacle WGO in craftsIn is still present in the world, it is UNCLEARED
    if (craft.craftsIn && craft.craftsIn.some(w => builtSet.has(w.toLowerCase()))) {
      return false;
    }

    // For church blockages: completed if church has been unlocked/entered and obstacle is cleared
    if (cidLower.startsWith("church_blockage_")) {
      return builtSet.has("builder_church") || builtSet.has("church_t0") || builtSet.has("church_t1") || builtSet.has("church_t2") || builtSet.has("church_t3");
    }

    // For chained blockages: base_blockage_2 requires base_blockage_1 to be cleared first
    if (cidLower === "base_blockage_2" && builtSet.has("base_blockage_1")) {
      return false;
    }

    return false;
  }

  // 3. Any craft that requires technology unlock MUST be unlocked in player's knowledge system!
  if (craft.isNeedsUnlock && !craftIsLearned(craft)) {
    return false;
  }

  // 4. One-time building / station / upgrade crafts
  if (craft.isOneTime) {

    // Check alias mapping
    const aliases = (WGO_ALIASES[cid] || []).concat(WGO_ALIASES[normCid] || []);
    for (const o of outs) {
      if (WGO_ALIASES[o]) aliases.push(...WGO_ALIASES[o]);
      if (WGO_ALIASES[normalizeWgoId(o)]) aliases.push(...WGO_ALIASES[normalizeWgoId(o)]);
    }

    for (const a of aliases) {
      const aLower = a.toLowerCase();
      if (builtSet.has(aLower) || normBuiltSet.has(normalizeWgoId(a))) {
        return true;
      }
    }

    // Check exact & normalized matches
    if (builtSet.has(cidLower) || normBuiltSet.has(normCid)) return true;
    for (let i = 0; i < outs.length; i++) {
      if (builtSet.has(outs[i].toLowerCase()) || normBuiltSet.has(normOuts[i])) return true;
    }
  }

  return false;
}

function craftIsTestJunk(craft) {
  return /(^|_)test(_|s_|$)/i.test(craft.id);
}

function craftVariantLabel(craft) {
  if (!craft || !craft.outputItems || craft.outputItems.length === 0) return "";
  const primaryOut = craft.outputItems.find(o => (o.count || 1) > 0) || craft.outputItems[0];
  const outId = primaryOut.itemId;
  const sisters = (producersByItem[outId] || []).map(p => p.craft);
  if (sisters.length <= 1) return "";

  const myInputs = (craft.needItems || []).map(n => n.itemId);
  const myCoreInputs = myInputs.filter(id => id !== 'fire' && id !== 'water');
  const targetInputs = myCoreInputs.length > 0 ? myCoreInputs : myInputs;

  for (const inputId of targetInputs) {
    const isDistinct = sisters.some(other => {
      if (other.id === craft.id) return false;
      return !(other.needItems || []).some(n => n.itemId === inputId);
    });
    if (isDistinct) {
      return `from ${displayNameFor(inputId)}`;
    }
  }

  const myWgos = (craft.craftsIn || []).filter(w => !w.includes('signboard'));
  if (myWgos.length > 0) {
    const isStationDistinct = sisters.some(other => {
      if (other.id === craft.id) return false;
      const otherWgos = (other.craftsIn || []).filter(w => !w.includes('signboard'));
      return !otherWgos.includes(myWgos[0]);
    });
    if (isStationDistinct) {
      return prettify(myWgos[0]);
    }
  }

  const yieldCount = primaryOut.count || 1;
  const idMatch = craft.id.match(/_(\d+)$/);
  if (idMatch) {
    return `Tier ${idMatch[1]} (yields ${yieldCount})`;
  }

  return `yields ${yieldCount}`;
}

function craftDisplayName(craft) {
  if (NAME_OVERRIDES[craft.id]) return NAME_OVERRIDES[craft.id];
  const baseName = craft.outputItems.length > 0
    ? craft.outputItems.map(o => displayNameFor(o.itemId)).join(", ")
    : prettify(craft.id);
  const variant = craftVariantLabel(craft);
  return variant ? `${baseName} (${variant})` : baseName;
}

function buildWhereBlock(itemId) {
  const sources = sourcesFor(itemId);
  if (sources.length === 0) return null;

  const ul = document.createElement("ul");
  ul.className = "ingredient-list where-block";
  for (const row of sources) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${row.label}</span><span>${row.count}</span>`;
    ul.appendChild(li);
  }
  return ul;
}

function buildIngredientNode(itemId, neededQty, showTree, showWhere, depth, visited) {
  const have = totals[itemId] || 0;
  const li = document.createElement("li");
  li.className = have >= neededQty ? "ok" : "short";

  const producer = producerIndex[itemId];
  const canExpand = showTree && producer && depth < MAX_TREE_DEPTH && !visited.has(itemId);

  if (!canExpand) {
    li.innerHTML = `<span>${iconImgTag(itemId)}${displayNameFor(itemId)}</span><span>${have} / ${neededQty}</span>`;
    if (showWhere) {
      const where = buildWhereBlock(itemId);
      if (where) li.appendChild(where);
    }
    return li;
  }

  const details = document.createElement("details");
  details.className = "tree-node";
  details.open = true;
  const summary = document.createElement("summary");

  const outCount = producer.outputCount || 1;
  const yieldTag = outCount > 1
    ? `<span class="tree-yield-tag">(makes ${outCount}/craft)</span>`
    : "";

  const runs = Math.ceil(neededQty / outCount);
  const runsTag = runs > 1
    ? `<span class="tree-runs-tag">[${runs} crafts needed]</span>`
    : "";

  summary.innerHTML = `<span>${iconImgTag(itemId)}${displayNameFor(itemId)}${yieldTag}${runsTag}</span><span>${have} / ${neededQty}</span>`;
  details.appendChild(summary);

  const subUl = document.createElement("ul");
  subUl.className = "ingredient-list";
  const nextVisited = new Set(visited);
  nextVisited.add(itemId);

  const sisters = (producersByItem[itemId] || []).filter(p => p.craft.id !== producer.craft.id);
  if (sisters.length > 0) {
    const switchLi = document.createElement("li");
    switchLi.className = "tree-alt-switcher";
    switchLi.innerHTML = `<span class="tree-alt-label">⇄ Alt recipe:</span>`;
    for (const alt of sisters) {
      const altNeeds = alt.craft.needItems
        .filter(n => n.itemId !== 'fire')
        .map(n => `${n.count}x ${displayNameFor(n.itemId)}`)
        .join(', ');
      const altYield = alt.outputCount || 1;
      const btn = document.createElement("button");
      btn.className = "tree-alt-btn";
      btn.textContent = `Use ${altNeeds} (makes ${altYield})`;
      btn.title = `Switch crafting tree to use ${craftDisplayName(alt.craft)}`;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setPreferredProducer(itemId, alt.craft.id);
      });
      switchLi.appendChild(btn);
    }
    subUl.appendChild(switchLi);
  }

  for (const sub of producer.craft.needItems) {
    subUl.appendChild(buildIngredientNode(sub.itemId, sub.count * runs, showTree, showWhere, depth + 1, nextVisited));
  }
  details.appendChild(subUl);
  li.appendChild(details);

  if (showWhere) {
    const where = buildWhereBlock(itemId);
    if (where) li.appendChild(where);
  }
  return li;
}

function buildIngredientList(needItems, qty, showTree, showWhere) {
  const ul = document.createElement("ul");
  ul.className = "ingredient-list";
  for (const need of needItems) {
    ul.appendChild(buildIngredientNode(need.itemId, need.count * qty, showTree, showWhere, 0, new Set()));
  }
  return ul;
}

function buildRecipeCard(craft, { qty, showTree, showWhere, pinButton, unpinButton, qtyInput, bundleSelect, treeToggle }) {
  const card = document.createElement("div");
  card.className = "card";

  const isDone = craftIsCompleted(craft);
  const allOk = craftIsCraftable(craft, qty);

  let badgeHtml = "";
  if (isDone) {
    badgeHtml = `<span class="card-badge card-badge--completed">✓ Completed</span>`;
  } else {
    badgeHtml = `<span class="card-badge ${allOk ? 'card-badge--ready' : 'card-badge--missing'}">${allOk ? 'Ready' : 'Missing items'}</span>`;
  }

  const primaryOut = craft.outputItems.find(o => (o.count || 1) > 0) || craft.outputItems[0];
  const yieldCount = primaryOut ? (primaryOut.count || 1) : 1;
  const yieldBadgeHtml = yieldCount > 1 ? `<span class="yield-badge" title="Each craft makes ${yieldCount}">Makes ${yieldCount}</span>` : "";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";
  titleRow.innerHTML = `
    <span class="card-title-group"><span class="card-title">${iconImgTag(primaryOut?.itemId)}${craftDisplayName(craft)}</span>${yieldBadgeHtml}</span>
    ${badgeHtml}
  `;
  const titleGroup = titleRow.querySelector(".card-title-group");
  const titleSpan = titleRow.querySelector(".card-title");
  if (treeToggle) {
    titleSpan.style.cursor = "pointer";
    titleSpan.title = "Click to toggle this recipe's crafting tree";
    titleSpan.addEventListener("click", () => {
      if (expandedTrees.has(craft.id)) expandedTrees.delete(craft.id);
      else expandedTrees.add(craft.id);
      renderPinned();
    });
  }

  if (qtyInput) {
    const qtyControl = document.createElement("div");
    qtyControl.className = "qty-control";

    const decBtn = document.createElement("button");
    decBtn.className = "qty-btn qty-btn-dec";
    decBtn.textContent = "-";
    decBtn.title = "Decrease quantity";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = qty;
    input.className = "qty-input";

    const incBtn = document.createElement("button");
    incBtn.className = "qty-btn qty-btn-inc";
    incBtn.textContent = "+";
    incBtn.title = "Increase quantity";

    const updateQty = async (newQty) => {
      const q = Math.max(1, parseInt(newQty, 10) || 1);
      pinned = await fetchJSON(`/api/pinned/${encodeURIComponent(craft.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: q }),
      });
      renderPinned();
    };

    decBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      updateQty(qty - 1);
    });

    incBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      updateQty(qty + 1);
    });

    input.addEventListener("click", e => e.stopPropagation());
    input.addEventListener("touchstart", e => e.stopPropagation());

    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        input.blur();
      }
    });

    input.addEventListener("change", async e => {
      await updateQty(e.target.value);
      e.target.blur();
    });

    qtyControl.appendChild(decBtn);
    qtyControl.appendChild(input);
    qtyControl.appendChild(incBtn);
    titleGroup.appendChild(qtyControl);
  }

  card.appendChild(titleRow);

  if (craft.needItems.length > 0) {
    card.appendChild(buildIngredientList(craft.needItems, qty, showTree, showWhere));
  }

  if (primaryOut && primaryOut.itemId) {
    const alts = (producersByItem[primaryOut.itemId] || []).filter(p => p.craft.id !== craft.id);
    if (alts.length > 0) {
      const altsContainer = document.createElement("div");
      altsContainer.className = "card-alts";

      const altsTitle = document.createElement("div");
      altsTitle.className = "card-alts-title";
      altsTitle.innerHTML = `<span class="card-alts-icon">⇄</span> <span>Alternate Materials / Recipes (${alts.length}):</span>`;
      altsContainer.appendChild(altsTitle);

      const altsList = document.createElement("div");
      altsList.className = "card-alts-list";

      for (const alt of alts) {
        const altCraft = alt.craft;
        const altYield = alt.outputCount || 1;
        const isAltReady = craftIsCraftable(altCraft, 1);
        const isAltDone = craftIsCompleted(altCraft);

        const pill = document.createElement("div");
        pill.className = `alt-pill ${isAltReady ? 'alt-pill--ready' : ''} ${isAltDone ? 'alt-pill--done' : ''}`;

        const needDesc = altCraft.needItems
          .filter(n => n.itemId !== 'fire')
          .map(n => `${n.count}x ${displayNameFor(n.itemId)}`)
          .join(', ');

        const stationName = altCraft.craftsIn && altCraft.craftsIn.length > 0
          ? prettify(altCraft.craftsIn[0])
          : '';

        pill.innerHTML = `
          <div class="alt-pill-info">
            <span class="alt-pill-needs">${needDesc}</span>
            <span class="alt-pill-arrow">➔</span>
            <span class="alt-pill-yield">Makes ${altYield}</span>
            ${stationName ? `<span class="alt-pill-station">@ ${stationName}</span>` : ''}
          </div>
        `;

        const isAltPinned = !!pinned[altCraft.id];
        const altPinBtn = document.createElement("button");
        altPinBtn.className = isAltPinned ? "alt-pill-pin pinned" : "alt-pill-pin";
        altPinBtn.textContent = isAltPinned ? "Pinned" : "+ Pin";
        altPinBtn.title = isAltPinned ? "Already pinned" : "Pin this alternate recipe";
        altPinBtn.disabled = isAltPinned;
        altPinBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          pinned = await fetchJSON(`/api/pinned/${encodeURIComponent(altCraft.id)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qty: 1 }),
          });
          renderPinned();
          const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
          if (activeTab === "crafts") renderSearch();
          else if (activeTab === "browse") renderBrowse();
        });
        pill.appendChild(altPinBtn);
        altsList.appendChild(pill);
      }
      altsContainer.appendChild(altsList);
      card.appendChild(altsContainer);
    }
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (treeToggle) {
    const isExpanded = expandedTrees.has(craft.id);
    const btn = document.createElement("button");
    btn.className = isExpanded ? "secondary" : "";
    btn.textContent = isExpanded ? "Hide Crafting Tree" : "Show Crafting Tree";
    btn.addEventListener("click", () => {
      if (isExpanded) expandedTrees.delete(craft.id);
      else expandedTrees.add(craft.id);
      renderPinned();
    });
    actions.appendChild(btn);
  }

  if (pinButton) {
    const isPinned = !!pinned[craft.id];
    const btn = document.createElement("button");
    btn.className = isPinned ? "" : "primary";
    btn.textContent = isPinned ? "Pinned" : "+ Pin";
    btn.disabled = isPinned;
    btn.addEventListener("click", async () => {
      pinned = await fetchJSON(`/api/pinned/${encodeURIComponent(craft.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 1 }),
      });
      pinButton.onPinned && pinButton.onPinned();
    });
    actions.appendChild(btn);
  }

  if (bundleSelect) {
    const count = (pinned[craft.id]?.bundles || []).length;
    const btn = document.createElement("button");
    btn.textContent = count > 0 ? `Bundles (${count})` : "+ Add to bundle";
    btn.addEventListener("click", () => openBundleModal(craft.id));
    actions.appendChild(btn);
  }

  if (unpinButton) {
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.textContent = "Unpin";
    btn.addEventListener("click", async () => {
      pinned = await fetchJSON(`/api/pinned/${encodeURIComponent(craft.id)}`, { method: "DELETE" });
      renderPinned();
    });
    actions.appendChild(btn);
  }

  card.appendChild(actions);
  return card;
}

// ---------- Bundle picker modal ----------

function openBundleModal(craftId) {
  const overlay = document.getElementById("bundle-modal-overlay");
  const optionsEl = document.getElementById("bundle-modal-options");
  const current = new Set(pinned[craftId]?.bundles || []);

  optionsEl.innerHTML = "";
  if (bundles.length === 0) {
    optionsEl.innerHTML = '<p class="empty-hint">No bundles yet - use "+ Create bundle" first.</p>';
  } else {
    for (const bundleName of bundles) {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${bundleName}"${current.has(bundleName) ? " checked" : ""}> ${bundleName}`;
      optionsEl.appendChild(label);
    }
  }

  overlay.hidden = false;

  const apply = async () => {
    const checked = Array.from(optionsEl.querySelectorAll("input:checked")).map(i => i.value);
    pinned = await fetchJSON(`/api/pinned/${encodeURIComponent(craftId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundles: checked }),
    });
    closeModal();
    renderPinned();
  };
  const cancel = () => closeModal();
  function closeModal() {
    overlay.hidden = true;
    document.getElementById("bundle-modal-apply").removeEventListener("click", apply);
    document.getElementById("bundle-modal-cancel").removeEventListener("click", cancel);
  }
  document.getElementById("bundle-modal-apply").addEventListener("click", apply);
  document.getElementById("bundle-modal-cancel").addEventListener("click", cancel);
}

function buildBundleTotalsBox(craftIds, boxKey = "totals") {
  const needed = {};
  for (const craftId of craftIds) {
    const craft = craftsById[craftId];
    if (!craft) continue;
    const qty = pinned[craftId]?.qty || 1;
    for (const need of craft.needItems) {
      needed[need.itemId] = (needed[need.itemId] || 0) + need.count * qty;
    }
  }

  const itemIds = Object.keys(needed);
  if (itemIds.length === 0) return null;
  itemIds.sort((a, b) => displayNameFor(a).localeCompare(displayNameFor(b)));

  const isExpanded = expandedTotalsTrees.has(boxKey) || (document.getElementById("pinned-show-tree")?.checked || false);

  const box = document.createElement("div");
  box.className = "card bundle-totals";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const titleSpan = document.createElement("span");
  titleSpan.className = "card-title";
  titleSpan.textContent = "Total Items Needed";
  titleRow.appendChild(titleSpan);

  const treeBtn = document.createElement("button");
  treeBtn.className = isExpanded ? "secondary totals-tree-btn" : "totals-tree-btn";
  treeBtn.textContent = isExpanded ? "Hide Crafting Trees" : "Show Crafting Trees";
  treeBtn.title = "Toggle crafting trees for all total items needed";
  treeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (expandedTotalsTrees.has(boxKey)) {
      expandedTotalsTrees.delete(boxKey);
    } else {
      expandedTotalsTrees.add(boxKey);
    }
    renderPinned();
  });
  titleRow.appendChild(treeBtn);
  box.appendChild(titleRow);

  const showWhere = document.getElementById("pinned-show-where")?.checked || false;
  const ul = document.createElement("ul");
  ul.className = "ingredient-list";
  for (const itemId of itemIds) {
    const need = needed[itemId];
    ul.appendChild(buildIngredientNode(itemId, need, isExpanded, showWhere, 0, new Set()));
  }
  box.appendChild(ul);
  return box;
}

function serializeTotals(t) {
  const keys = Object.keys(t || {}).sort();
  return keys.map(k => `${k}:${t[k]}`).join(";");
}

function getPinnedStateFingerprint() {
  const showWhere = document.getElementById("pinned-show-where")?.checked;
  return JSON.stringify({
    pinned,
    totals: serializeTotals(totals),
    unlockedCount: unlockedCraftIds.length,
    completedCount: oneTimeCompletedCraftIds.length,
    builtCount: builtWgoIds.length,
    expandedTrees: Array.from(expandedTrees).sort(),
    expandedTotalsTrees: Array.from(expandedTotalsTrees).sort(),
    preferredProducer,
    showWhere
  });
}

function renderPinned() {
  lastPinnedFingerprint = getPinnedStateFingerprint();

  const list = document.getElementById("pinned-list");
  const showWhere = document.getElementById("pinned-show-where")?.checked || false;
  const ids = Object.keys(pinned).filter(id => craftsById[id]);

  if (ids.length === 0 && bundles.length === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "No recipes pinned yet. Go to Search or Browse Recipes to add some.";
    list.replaceChildren(hint);
    return;
  }

  const openBundles = new Set();
  list.querySelectorAll("details.section[open]").forEach(d => openBundles.add(d.dataset.bundle));

  const frag = document.createDocumentFragment();

  const byBundle = {};
  for (const craftId of ids) {
    for (const bundleName of pinned[craftId].bundles || []) {
      (byBundle[bundleName] = byBundle[bundleName] || []).push(craftId);
    }
  }

  for (const bundleName of bundles) {
    const craftIds = byBundle[bundleName] || [];
    const details = document.createElement("details");
    details.className = "section";
    details.dataset.bundle = bundleName;
    if (openBundles.has(bundleName)) details.open = true;

    const allReady = craftIds.length > 0 && craftIds.every(id =>
      craftIsCraftable(craftsById[id], pinned[id].qty || 1));
    if (allReady) details.classList.add("bundle-ready");

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="section-title">${bundleName} (${craftIds.length})</span>`;
    const delBtn = document.createElement("button");
    delBtn.className = "danger bundle-delete";
    delBtn.textContent = "Delete bundle";
    delBtn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      bundles = await fetchJSON(`/api/bundles/${encodeURIComponent(bundleName)}`, { method: "DELETE" });
      pinned = await fetchJSON("/api/pinned");
      renderPinned();
    });
    summary.appendChild(delBtn);
    details.appendChild(summary);

    const totalsBox = buildBundleTotalsBox(craftIds, `bundle-${bundleName}`);
    if (totalsBox) details.appendChild(totalsBox);

    const cardList = document.createElement("div");
    cardList.className = "card-list";
    if (craftIds.length === 0) {
      cardList.innerHTML = '<p class="empty-hint">Nothing in this bundle yet. Pin a recipe from Search or Browse Recipes, then use its "Add to bundle" button and check this bundle.</p>';
    }
    for (const craftId of craftIds) {
      const qty = pinned[craftId].qty || 1;
      cardList.appendChild(buildRecipeCard(craftsById[craftId], {
        qty, showTree: expandedTrees.has(craftId), showWhere, treeToggle: true,
        unpinButton: true, qtyInput: true, bundleSelect: true,
      }));
    }
    details.appendChild(cardList);
    if (craftIds.length === 0) details.open = true;
    frag.appendChild(details);
  }

  if (bundles.length > 0 && ids.length > 0) {
    const heading = document.createElement("h3");
    heading.className = "pinned-flat-heading";
    heading.textContent = "All Pinned Recipes";
    frag.appendChild(heading);
  }

  if (bundles.length === 0 && ids.length > 0) {
    const allTotalsBox = buildBundleTotalsBox(ids, "all-pinned-totals");
    if (allTotalsBox) frag.appendChild(allTotalsBox);
  }

  const flatList = document.createElement("div");
  flatList.className = "card-list";
  for (const craftId of ids) {
    const qty = pinned[craftId].qty || 1;
    flatList.appendChild(buildRecipeCard(craftsById[craftId], {
      qty, showTree: expandedTrees.has(craftId), showWhere, treeToggle: true,
      unpinButton: true, qtyInput: true, bundleSelect: true,
    }));
  }
  frag.appendChild(flatList);
  list.replaceChildren(frag);
}

// ---------- Search tab ----------

function craftSearchableText(craft, includeMaterials = true) {
  const parts = [
    craft.id,
    prettify(craft.id),
    craftDisplayName(craft),
    craftVariantLabel(craft)
  ];
  for (const cin of craft.craftsIn || []) {
    parts.push(cin);
    parts.push(prettify(cin));
  }
  for (const o of craft.outputItems || []) {
    if (o.itemId) {
      parts.push(o.itemId);
      parts.push(displayNameFor(o.itemId));
    }
  }
  if (includeMaterials) {
    for (const n of craft.needItems || []) {
      if (n.itemId) {
        parts.push(n.itemId);
        parts.push(displayNameFor(n.itemId));
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

function scoreSearchMatch(craft, queryRaw, terms) {
  const title = craftDisplayName(craft).toLowerCase();
  const cid = craft.id.toLowerCase();
  let score = 0;

  if (title === queryRaw) score += 1000;
  else if (title.startsWith(queryRaw)) score += 500;
  else if (terms.every(t => title.includes(t))) score += 250;
  else if (terms.some(t => title.includes(t))) score += 100;

  if (terms.every(t => cid.includes(t))) score += 50;

  for (const o of craft.outputItems || []) {
    if (o.itemId) {
      const dName = displayNameFor(o.itemId).toLowerCase();
      if (dName === queryRaw) score += 300;
      else if (dName.includes(queryRaw)) score += 80;
    }
  }

  for (const cin of craft.craftsIn || []) {
    if (cin.toLowerCase().includes(queryRaw)) score += 30;
  }

  return score;
}

function renderSearch() {
  const list = document.getElementById("search-list");
  const queryRaw = document.getElementById("search").value.toLowerCase().trim();
  const onlyCraftable = document.getElementById("search-only-craftable").checked;
  const includeMaterials = document.getElementById("search-include-materials").checked;
  const hideCompleted = document.getElementById("search-hide-completed").checked;
  const showTest = document.getElementById("search-show-test").checked;
  const showTree = document.getElementById("search-show-tree").checked;
  const showWhere = document.getElementById("search-show-where").checked;

  list.innerHTML = "";
  if (!queryRaw) {
    list.innerHTML = '<p class="empty-hint">Start typing to search recipes.</p>';
    return;
  }

  const terms = queryRaw.split(/\s+/).filter(Boolean);

  let scoredMatches = [];
  for (const craft of recipesData.crafts) {
    if (!craftHasContent(craft)) continue;
    if (!showTest && craftIsTestJunk(craft)) continue;
    if (hideCompleted && craftIsCompleted(craft)) continue;

    if (terms.length > 0) {
      const text = craftSearchableText(craft, includeMaterials);
      if (!terms.every(t => text.includes(t))) continue;
    }

    if (onlyCraftable && !craftIsCraftable(craft, 1)) continue;

    const score = scoreSearchMatch(craft, queryRaw, terms);
    scoredMatches.push({ craft, score });
  }

  scoredMatches.sort((a, b) => b.score - a.score);
  const matches = scoredMatches.slice(0, 150).map(m => m.craft);

  const frag = document.createDocumentFragment();
  if (matches.length === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "No matching recipes.";
    list.replaceChildren(hint);
    return;
  }

  for (const craft of matches) {
    frag.appendChild(buildRecipeCard(craft, { qty: 1, showTree, showWhere, pinButton: { onPinned: renderSearch } }));
  }
  list.replaceChildren(frag);
}

// ---------- Browse Recipes tab ----------

function normalizeGroupKey(key) {
  return key.replace(/_t\d+$/, "").replace(/_\d+(?=_|$)/g, "");
}

function areaGroupKeyFor(craft) {
  if (craft.craftsIn && craft.craftsIn.length > 0) return normalizeGroupKey(craft.craftsIn[0]);
  return "other";
}

function craftGroupIsStation(crafts) {
  return crafts.some(c => c.outputItems.length > 0);
}

const MATERIAL_KEYWORDS = [
  ["iron", "Iron"], ["bronze", "Bronze"], ["steel", "Steel"], ["copper", "Copper"],
  ["gold", "Gold"], ["silver", "Silver"], ["tin", "Tin"],
  ["wood", "Wood"], ["plank", "Wood"], ["flitch", "Wood"], ["log", "Wood"],
  ["stone", "Stone"], ["rock", "Stone"], ["marble", "Stone"],
  ["clay", "Clay"], ["brick", "Clay"],
  ["glass", "Glass"], ["cloth", "Cloth"], ["fabric", "Cloth"], ["thread", "Cloth"],
  ["leather", "Leather"], ["bone", "Bone"], ["coal", "Coal"], ["paper", "Paper"],
  ["ink", "Ink"], ["wax", "Wax"], ["rope", "Rope"],
  ["seed", "Seeds & Plants"], ["flower", "Seeds & Plants"], ["berry", "Seeds & Plants"],
  ["herb", "Herbs & Alchemy"], ["potion", "Herbs & Alchemy"], ["alchemy", "Herbs & Alchemy"],
  ["fish", "Food"], ["meat", "Food"], ["bread", "Food"], ["cook", "Food"], ["food", "Food"],
  ["wine", "Food"], ["beer", "Food"],
  ["gem", "Gems & Jewelry"], ["jewel", "Gems & Jewelry"],
];

function materialGroupKeyFor(craft) {
  const outputId = craft.outputItems[0]?.itemId?.toLowerCase() || "";
  for (const [keyword, category] of MATERIAL_KEYWORDS) {
    if (outputId.includes(keyword)) return category;
  }
  return "Other Materials";
}

function baseBrowseCrafts() {
  const onlyCraftable = document.getElementById("browse-only-craftable").checked;
  const showNotLearned = document.getElementById("browse-show-not-learned").checked;
  const hideCompleted = document.getElementById("browse-hide-completed").checked;
  const showTest = document.getElementById("browse-show-test").checked;

  let crafts = recipesData.crafts.filter(craftHasContent);
  if (!showTest) crafts = crafts.filter(c => !craftIsTestJunk(c));
  if (hideCompleted) crafts = crafts.filter(c => !craftIsCompleted(c));
  if (onlyCraftable) crafts = crafts.filter(c => craftIsCraftable(c, 1));
  if (!showNotLearned) crafts = crafts.filter(craftIsLearned);
  return crafts;
}

function buildAddAllButton(crafts, bundleName, onDone) {
  const btn = document.createElement("button");
  btn.className = "secondary add-all-btn";
  btn.textContent = "Add all";
  btn.addEventListener("click", async e => {
    e.preventDefault();
    e.stopPropagation();

    if (!bundles.includes(bundleName)) {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: bundleName }),
      });
      bundles = await res.json();
    }

    const failed = [];
    for (const c of crafts) {
      const existing = new Set(pinned[c.id]?.bundles || []);
      existing.add(bundleName);
      try {
        const res = await fetch(`/api/pinned/${encodeURIComponent(c.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundles: Array.from(existing) }),
        });
        if (!res.ok) failed.push(c.id);
      } catch {
        failed.push(c.id);
      }
    }
    pinned = await fetchJSON("/api/pinned");
    onDone();
    if (failed.length > 0) {
      alert(`Added ${crafts.length - failed.length} of ${crafts.length}. These didn't go through - try "Add all" again: ${failed.map(displayNameFor).join(", ")}`);
    }
  });
  return btn;
}

function renderGroupedSections(containerId, crafts, groupKeyFn, keyLabelFn, rerender) {
  const container = document.getElementById(containerId);
  const showTree = document.getElementById("browse-show-tree")?.checked || false;
  const showWhere = document.getElementById("browse-show-where")?.checked || false;

  const openSections = new Set();
  container.querySelectorAll("details.section[open]").forEach(d => openSections.add(d.dataset.section));

  const groups = {};
  for (const craft of crafts) {
    const key = groupKeyFn(craft);
    (groups[key] = groups[key] || []).push(craft);
  }

  const frag = document.createDocumentFragment();
  const sortedKeys = Object.keys(groups).sort((a, b) => keyLabelFn(a).localeCompare(keyLabelFn(b)));

  if (sortedKeys.length === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "No recipes match these filters.";
    container.replaceChildren(hint);
    return;
  }

  for (const key of sortedKeys) {
    const details = document.createElement("details");
    details.className = "section";
    details.dataset.section = key;
    if (openSections.has(key)) details.open = true;

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="section-title">${keyLabelFn(key)} (${groups[key].length})</span>`;
    summary.appendChild(buildAddAllButton(groups[key], keyLabelFn(key), rerender));
    details.appendChild(summary);

    const cardList = document.createElement("div");
    cardList.className = "card-list";
    for (const craft of groups[key]) {
      cardList.appendChild(buildRecipeCard(craft, { qty: 1, showTree, showWhere, pinButton: { onPinned: rerender } }));
    }
    details.appendChild(cardList);
    frag.appendChild(details);
  }
  container.replaceChildren(frag);
}

function renderBrowseByArea() {
  const container = document.getElementById("browse-sections-area");
  const showTree = document.getElementById("browse-show-tree")?.checked || false;
  const showWhere = document.getElementById("browse-show-where")?.checked || false;
  const crafts = baseBrowseCrafts();

  const openSections = new Set();
  container.querySelectorAll("details.section[open]").forEach(d => openSections.add(d.dataset.section));
  const openMeta = new Set();
  container.querySelectorAll("details.meta-section[open]").forEach(d => openMeta.add(d.dataset.meta));

  const groups = {};
  for (const craft of crafts) {
    const key = areaGroupKeyFor(craft);
    (groups[key] = groups[key] || []).push(craft);
  }

  const stationKeys = [];
  const locationKeys = [];
  for (const key of Object.keys(groups)) {
    (craftGroupIsStation(groups[key]) ? stationKeys : locationKeys).push(key);
  }
  const byLabel = (a, b) => prettify(a).localeCompare(prettify(b));
  stationKeys.sort(byLabel);
  locationKeys.sort(byLabel);

  if (stationKeys.length === 0 && locationKeys.length === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "No recipes match these filters.";
    container.replaceChildren(hint);
    return;
  }

  const frag = document.createDocumentFragment();
  const buildMetaSection = (metaKey, label, keys) => {
    const metaDetails = document.createElement("details");
    metaDetails.className = "section meta-section";
    metaDetails.dataset.meta = metaKey;
    if (openMeta.has(metaKey)) metaDetails.open = true;

    const totalCount = keys.reduce((sum, k) => sum + groups[k].length, 0);
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="section-title">${label} (${totalCount})</span>`;
    metaDetails.appendChild(summary);

    const inner = document.createElement("div");
    inner.className = "meta-section-body";
    for (const key of keys) {
      const details = document.createElement("details");
      details.className = "section";
      details.dataset.section = key;
      if (openSections.has(key)) details.open = true;

      const innerSummary = document.createElement("summary");
      innerSummary.innerHTML = `<span class="section-title">${prettify(key)} (${groups[key].length})</span>`;
      innerSummary.appendChild(buildAddAllButton(groups[key], prettify(key), renderBrowseByArea));
      details.appendChild(innerSummary);

      const cardList = document.createElement("div");
      cardList.className = "card-list";
      for (const craft of groups[key]) {
        cardList.appendChild(buildRecipeCard(craft, { qty: 1, showTree, showWhere, pinButton: { onPinned: renderBrowseByArea } }));
      }
      details.appendChild(cardList);
      inner.appendChild(details);
    }
    metaDetails.appendChild(inner);
    frag.appendChild(metaDetails);
  };

  if (stationKeys.length > 0) buildMetaSection("stations", "Crafting Stations", stationKeys);
  if (locationKeys.length > 0) buildMetaSection("locations", "Actual Places in the Game World", locationKeys);
  container.replaceChildren(frag);
}

function renderBrowseByMaterial() {
  const crafts = baseBrowseCrafts().filter(c => c.outputItems.length > 0);
  renderGroupedSections("browse-sections-material", crafts, materialGroupKeyFor, k => k, renderBrowseByMaterial);
}

function renderBrowse() {
  renderBrowseByArea();
  renderBrowseByMaterial();
}

// ---------- Completed tab ----------

function renderCompleted() {
  const container = document.getElementById("completed-sections");
  const showWhere = document.getElementById("completed-show-where")?.checked || false;

  const completedCrafts = recipesData.crafts.filter(craftIsCompleted);
  updateCompletedTabBadge(completedCrafts.length);

  renderGroupedSections(
    "completed-sections",
    completedCrafts,
    areaGroupKeyFor,
    prettify,
    renderCompleted
  );
}

function updateCompletedTabBadge(count) {
  if (count === undefined) {
    count = recipesData.crafts.filter(craftIsCompleted).length;
  }
  const btn = document.getElementById("tab-btn-completed");
  if (btn) {
    const text = `Completed (${count})`;
    if (btn.textContent !== text) {
      btn.textContent = text;
    }
  }
}

// ---------- Tabs / wiring ----------

function currentTab() {
  return document.querySelector(".tab-btn.active").dataset.tab;
}

function renderActiveTab() {
  const tab = currentTab();
  if (tab === "pinned") renderPinned();
  else if (tab === "search") renderSearch();
  else if (tab === "browse") renderBrowse();
  else if (tab === "completed") renderCompleted();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      renderActiveTab();
    });
  });
}

function setupSubtabs() {
  document.querySelectorAll(".subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".subtab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".subtab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`browse-sections-${btn.dataset.subtab}`).classList.add("active");
    });
  });
}

function setupOnDemandControls() {
  const ids = [
    "search", "search-only-craftable", "search-include-materials", "search-hide-completed", "search-show-test", "search-show-tree", "search-show-where",
    "browse-only-craftable", "browse-show-not-learned", "browse-hide-completed", "browse-show-test", "browse-show-tree", "browse-show-where",
    "completed-show-where",
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", renderActiveTab);
  }
  document.getElementById("pinned-show-where").addEventListener("input", renderPinned);

  document.getElementById("pinned-show-tree").addEventListener("input", e => {
    if (e.target.checked) {
      Object.keys(pinned).forEach(id => expandedTrees.add(id));
      expandedTotalsTrees.add("all-pinned-totals");
      bundles.forEach(b => expandedTotalsTrees.add(`bundle-${b}`));
    } else {
      expandedTrees.clear();
      expandedTotalsTrees.clear();
    }
    renderPinned();
  });
}

function setupConfigBanner() {
  document.getElementById("config-save").addEventListener("click", async () => {
    const path = document.getElementById("config-path").value.trim();
    if (!path) return;
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_install_dir: path }),
    });
    if (res.ok) {
      await bootstrap();
    } else {
      alert("That path doesn't exist. Double check it.");
    }
  });
}

let lastInventoryFingerprint = null;
let lastInventoryModified = null;
let lastPinnedJson = null;
let lastBundlesJson = null;
let pollTimer = null;
let isPolling = false;
let needsRefresh = false;

function getInventoryFingerprint() {
  return (
    serializeTotals(totals) +
    "|" +
    unlockedCraftIds.slice().sort().join(",") +
    "|" +
    oneTimeCompletedCraftIds.slice().sort().join(",") +
    "|" +
    builtWgoIds.slice().sort().join(",")
  );
}

async function pollOnce() {
  if (isPolling) return;
  isPolling = true;
  try {
    const s = await refreshStatus();
    const fileMtimeChanged = !!(s && s.inventoryModified && s.inventoryModified !== lastInventoryModified);
    if (s && s.inventoryModified) {
      lastInventoryModified = s.inventoryModified;
    }

    await loadInventory();
    const invFp = getInventoryFingerprint();
    const invChanged = invFp !== lastInventoryFingerprint;

    // Synchronize pinned recipes and bundles across multiple devices
    let pinnedChanged = false;
    let bundlesChanged = false;
    try {
      const serverPinned = await fetchJSON("/api/pinned");
      const serverPinnedJson = JSON.stringify(serverPinned);
      if (lastPinnedJson === null) {
        lastPinnedJson = serverPinnedJson;
        pinned = serverPinned;
      } else if (serverPinnedJson !== lastPinnedJson) {
        lastPinnedJson = serverPinnedJson;
        pinned = serverPinned;
        pinnedChanged = true;
      }

      const serverBundles = await fetchJSON("/api/bundles");
      const serverBundlesJson = JSON.stringify(serverBundles);
      if (lastBundlesJson === null) {
        lastBundlesJson = serverBundlesJson;
        bundles = serverBundles;
      } else if (serverBundlesJson !== lastBundlesJson) {
        lastBundlesJson = serverBundlesJson;
        bundles = serverBundles;
        bundlesChanged = true;
      }
    } catch (e) {
      console.warn("Could not sync pinned/bundles:", e);
    }

    const active = document.activeElement;
    // Only pause DOM reconstruction if the user is actively typing inside a quantity input
    // within a recipe card, so we don't disrupt their keystroke/cursor.
    const isEditingQty = active && active.classList.contains("qty-input");

    if (isEditingQty) {
      if (invChanged || pinnedChanged || bundlesChanged) {
        needsRefresh = true;
      }
    } else {
      const shouldRender = invChanged || pinnedChanged || bundlesChanged || needsRefresh;
      if (shouldRender) {
        needsRefresh = false;
        lastInventoryFingerprint = invFp;
        const tab = currentTab();
        if (tab === "pinned") {
          renderPinned();
        } else {
          renderActiveTab();
        }
      } else {
        lastInventoryFingerprint = invFp;
      }
    }
    updateCompletedTabBadge();
  } catch (e) {
    console.error("Poll error:", e);
  } finally {
    isPolling = false;
  }
}

function pollLoop() {
  if (pollTimer) clearTimeout(pollTimer);
  pollOnce().finally(() => {
    pollTimer = setTimeout(pollLoop, 1500);
  });
}

async function loadBundles() {
  bundles = await fetchJSON("/api/bundles");
}

function setupBundleCreation() {
  const nameInput = document.getElementById("new-bundle-name");

  document.getElementById("new-bundle-cancel").addEventListener("click", () => {
    nameInput.value = "";
  });

  const confirm = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const res = await fetch("/api/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    bundles = await res.json();
    nameInput.value = "";
    renderPinned();
  };
  document.getElementById("new-bundle-confirm").addEventListener("click", confirm);
  nameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") confirm();
  });
}

function setupClearAllPinned() {
  document.getElementById("clear-all-pinned").addEventListener("click", async () => {
    if (!confirm("Unpin every recipe on the Pinned Recipes page? This can't be undone (bundles stay, but they'll end up empty).")) {
      return;
    }
    pinned = await fetchJSON("/api/pinned", { method: "DELETE" });
    renderPinned();
  });
}

async function bootstrap() {
  const s = await refreshStatus();
  if (s && s.inventoryModified) {
    lastInventoryModified = s.inventoryModified;
  }
  await loadRecipes();
  await loadInventory();
  await loadPinned();
  await loadBundles();
  lastInventoryFingerprint = getInventoryFingerprint();
  lastPinnedJson = JSON.stringify(pinned);
  lastBundlesJson = JSON.stringify(bundles);
  renderActiveTab();
  updateCompletedTabBadge();
  pollLoop();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    pollOnce();
  }
});
window.addEventListener("focus", () => {
  pollOnce();
});
document.addEventListener("focusout", (e) => {
  if (e.target && e.target.classList.contains("qty-input") && needsRefresh) {
    setTimeout(pollOnce, 50);
  }
});

setupTabs();
setupSubtabs();
setupOnDemandControls();
setupConfigBanner();
setupBundleCreation();
setupClearAllPinned();
bootstrap();
