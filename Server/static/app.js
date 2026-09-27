let recipesData = { items: [], crafts: [] };
let itemsById = {};
let craftsById = {};
let producerIndex = {};   // itemId -> { craft, outputCount }
let totals = {};
let containers = [];
let unlockedCraftIds = [];
let oneTimeCompletedCraftIds = [];
let builtWgoIds = [];
let pinned = {};
let bundles = [];
let expandedTrees = new Set(); // craft ids whose crafting tree is expanded on the Pinned tab
let lastPinnedFingerprint = null;

const MAX_TREE_DEPTH = 6;

function prettify(id) {
  if (!id) return "";
  let clean = id
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

function displayNameFor(itemId) {
  const item = itemsById[itemId];
  if (item && item.displayName) return item.displayName;
  return prettify(itemId);
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
    return;
  }
  banner.hidden = true;
  if (s.recipesFound && s.inventoryFound) {
    el.textContent = "Connected — live";
    el.className = "status status--ok";
  } else {
    el.textContent = "Waiting for game data (launch GK2 with the plugin installed)";
    el.className = "status status--bad";
  }
}

function buildProducerIndex() {
  producerIndex = {};
  for (const craft of recipesData.crafts) {
    if (craftIsTestJunk(craft)) continue;
    for (const out of craft.outputItems) {
      if (!out.itemId || out.itemId in producerIndex) continue;
      producerIndex[out.itemId] = { craft, outputCount: out.count || 1 };
    }
  }
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

function craftIsCompleted(craft) {
  if (!craft || !craftHasContent(craft) || !craft.isOneTime) return false;
  if (oneTimeCompletedCraftIds.includes(craft.id)) return true;
  if (builtWgoIds.includes(craft.id)) return true;
  if (craft.outputItems && craft.outputItems.some(o => o.itemId && builtWgoIds.includes(o.itemId))) return true;
  return false;
}

function craftIsTestJunk(craft) {
  return /(^|_)test(_|s_|$)/i.test(craft.id);
}

function craftDisplayName(craft) {
  return craft.outputItems.length > 0
    ? craft.outputItems.map(o => displayNameFor(o.itemId)).join(", ")
    : prettify(craft.id);
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
  summary.innerHTML = `<span>${iconImgTag(itemId)}${displayNameFor(itemId)}</span><span>${have} / ${neededQty}</span>`;
  details.appendChild(summary);

  const runs = Math.ceil(neededQty / (producer.outputCount || 1));
  const subUl = document.createElement("ul");
  subUl.className = "ingredient-list";
  const nextVisited = new Set(visited);
  nextVisited.add(itemId);
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

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";
  titleRow.innerHTML = `
    <span class="card-title-group"><span class="card-title">${iconImgTag(craft.outputItems[0]?.itemId)}${craftDisplayName(craft)}</span></span>
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

function buildBundleTotalsBox(craftIds) {
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

  const box = document.createElement("div");
  box.className = "card bundle-totals";
  box.innerHTML = '<div class="card-title-row"><span class="card-title">Total Items Needed</span></div>';
  const ul = document.createElement("ul");
  ul.className = "ingredient-list";
  for (const itemId of itemIds) {
    const have = totals[itemId] || 0;
    const need = needed[itemId];
    const li = document.createElement("li");
    li.className = have >= need ? "ok" : "short";
    li.innerHTML = `<span>${iconImgTag(itemId)}${displayNameFor(itemId)}</span><span>${have} / ${need}</span>`;
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

function getPinnedStateFingerprint() {
  const showWhere = document.getElementById("pinned-show-where")?.checked;
  return JSON.stringify({
    pinned,
    totals,
    unlockedCount: unlockedCraftIds.length,
    completedCount: oneTimeCompletedCraftIds.length,
    builtCount: builtWgoIds.length,
    expandedTrees: Array.from(expandedTrees).sort(),
    showWhere
  });
}

function renderPinned() {
  lastPinnedFingerprint = getPinnedStateFingerprint();

  const list = document.getElementById("pinned-list");
  const showWhere = document.getElementById("pinned-show-where").checked;
  const ids = Object.keys(pinned).filter(id => craftsById[id]);

  const openBundles = new Set();
  list.querySelectorAll("details.section[open]").forEach(d => openBundles.add(d.dataset.bundle));

  list.innerHTML = "";
  if (ids.length === 0 && bundles.length === 0) {
    list.innerHTML = '<p class="empty-hint">No recipes pinned yet. Go to Search or Browse Recipes to add some.</p>';
    return;
  }

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

    const totalsBox = buildBundleTotalsBox(craftIds);
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
    list.appendChild(details);
  }

  if (bundles.length > 0 && ids.length > 0) {
    const heading = document.createElement("h3");
    heading.className = "pinned-flat-heading";
    heading.textContent = "All Pinned Recipes";
    list.appendChild(heading);
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
  list.appendChild(flatList);
}

// ---------- Search tab ----------

function craftSearchableText(craft, includeMaterials = true) {
  const parts = [
    craft.id,
    prettify(craft.id),
    craftDisplayName(craft)
  ];
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

  let matches = recipesData.crafts.filter(craft => {
    if (!craftHasContent(craft)) return false;
    if (!showTest && craftIsTestJunk(craft)) return false;
    if (hideCompleted && craftIsCompleted(craft)) return false;

    if (terms.length > 0) {
      const text = craftSearchableText(craft, includeMaterials);
      if (!terms.every(t => text.includes(t))) return false;
    }
    return true;
  });

  if (onlyCraftable) matches = matches.filter(c => craftIsCraftable(c, 1));
  matches = matches.slice(0, 60);

  if (matches.length === 0) {
    list.innerHTML = '<p class="empty-hint">No matching recipes.</p>';
    return;
  }

  for (const craft of matches) {
    list.appendChild(buildRecipeCard(craft, { qty: 1, showTree, showWhere, pinButton: { onPinned: renderSearch } }));
  }
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

  container.innerHTML = "";
  const sortedKeys = Object.keys(groups).sort((a, b) => keyLabelFn(a).localeCompare(keyLabelFn(b)));

  if (sortedKeys.length === 0) {
    container.innerHTML = '<p class="empty-hint">No recipes match these filters.</p>';
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
    container.appendChild(details);
  }
}

function renderBrowseByArea() {
  const container = document.getElementById("browse-sections-area");
  const showTree = document.getElementById("browse-show-tree").checked;
  const showWhere = document.getElementById("browse-show-where").checked;
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

  container.innerHTML = "";
  if (stationKeys.length === 0 && locationKeys.length === 0) {
    container.innerHTML = '<p class="empty-hint">No recipes match these filters.</p>';
    return;
  }

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
    container.appendChild(metaDetails);
  };

  if (stationKeys.length > 0) buildMetaSection("stations", "Crafting Stations", stationKeys);
  if (locationKeys.length > 0) buildMetaSection("locations", "Actual Places in the Game World", locationKeys);
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
    btn.textContent = `Completed (${count})`;
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
    } else {
      expandedTrees.clear();
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

function getInventoryFingerprint() {
  return JSON.stringify(totals) + "|" + oneTimeCompletedCraftIds.join(",") + "|" + builtWgoIds.join(",");
}

async function pollLoop() {
  try {
    await refreshStatus();
    await loadInventory();
    const invFp = getInventoryFingerprint();
    const invChanged = invFp !== lastInventoryFingerprint;
    lastInventoryFingerprint = invFp;

    const active = document.activeElement;
    const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if (!isTyping) {
      const tab = currentTab();
      if (tab === "pinned") {
        const currentFp = getPinnedStateFingerprint();
        if (currentFp !== lastPinnedFingerprint || invChanged) {
          renderPinned();
        }
      } else if (invChanged) {
        renderActiveTab();
      }
    }
    updateCompletedTabBadge();
  } catch (e) {
    console.error(e);
  }
  setTimeout(pollLoop, 1500);
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
  await refreshStatus();
  await loadRecipes();
  await loadInventory();
  await loadPinned();
  await loadBundles();
  renderActiveTab();
  updateCompletedTabBadge();
  pollLoop();
}

setupTabs();
setupSubtabs();
setupOnDemandControls();
setupConfigBanner();
setupBundleCreation();
setupClearAllPinned();
bootstrap();
