const SUPABASE_URL = "https://yzpwwmbbifzxelwdlsnu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6cHd3bWJiaWZ6eGVsd2Rsc251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjkzODksImV4cCI6MjEwMzM0NTM4OX0.A0NEJwKjqg262uTDlPaffOaCM20Pep8LbsB9SUA49GU";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UNIT_FAMILY = {
  each: "count", dozen: "count",
  g: "mass", kg: "mass",
  ml: "volume", L: "volume",
  pack: "pack", box: "box", bag: "bag",
};
const UNIT_BASE = {
  each: 1, dozen: 12,
  g: 1, kg: 1000,
  ml: 1, L: 1000,
  pack: 1, box: 1, bag: 1,
};
const DEFAULT_CATEGORIES = ["Produce", "Dairy & Eggs", "Bakery", "Meat & Seafood", "Frozen", "Pantry", "Beverages", "Household"];

// ---------- state ----------
let categories = [];
let catalogue = [];
let activeLists = [];
let templateLists = [];
let archivedLists = [];
let currentListId = null;
let currentItems = [];

// ---------- elements ----------
const viewSignin = document.getElementById("view-signin");
const viewList = document.getElementById("view-list");
const viewSettings = document.getElementById("view-settings");

const signinForm = document.getElementById("signin-form");
const signinError = document.getElementById("signin-error");

const listSwitcher = document.getElementById("list-switcher");
const newListBtn = document.getElementById("new-list-btn");

const addItemForm = document.getElementById("add-item-form");
const addItemName = document.getElementById("add-item-name");
const addItemQty = document.getElementById("add-item-qty");
const addItemUnit = document.getElementById("add-item-unit");
const autocompleteList = document.getElementById("autocomplete-list");

const toggleMultiaddBtn = document.getElementById("toggle-multiadd");
const multiAddForm = document.getElementById("multi-add-form");
const multiAddText = document.getElementById("multi-add-text");

const frequentsSection = document.getElementById("frequents-section");
const frequentsList = document.getElementById("frequents-list");

const remainingCountEl = document.getElementById("remaining-count");
const itemGroupsEl = document.getElementById("item-groups");
const clearCheckedBtn = document.getElementById("clear-checked");
const shareListBtn = document.getElementById("share-list");

const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const signOutBtn = document.getElementById("sign-out");
const exportBtn = document.getElementById("export-data");
const loadDemoBtn = document.getElementById("load-demo");
const removeDemoBtn = document.getElementById("remove-demo");
const demoStatus = document.getElementById("demo-status");
const toggleThemeBtn = document.getElementById("toggle-theme");

const listsManageEl = document.getElementById("lists-manage");
const templatesManageEl = document.getElementById("templates-manage");
const archivedManageEl = document.getElementById("archived-manage");
const categoriesManageEl = document.getElementById("categories-manage");
const newCategoryForm = document.getElementById("new-category-form");
const newCategoryName = document.getElementById("new-category-name");
const catalogueManageEl = document.getElementById("catalogue-manage");

// ---------- helpers ----------
function showView(view) {
  [viewSignin, viewList, viewSettings].forEach(v => v.hidden = v !== view);
}

async function getSession() {
  const { data } = await client.auth.getSession();
  return data.session;
}

function stripCombiningMarks(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code < 0x0300 || code > 0x036f) out += ch;
  }
  return out;
}

function normalizeName(str) {
  let s = str.toLowerCase();
  s = stripCombiningMarks(s.normalize("NFD"));
  s = s.replace(/\s+/g, " ").trim();
  if (s.endsWith("es") && s.length > 3) s = s.slice(0, -2);
  else if (s.endsWith("s") && s.length > 2) s = s.slice(0, -1);
  return s;
}

function combineQuantities(exAmount, exUnit, inAmount, inUnit) {
  if (exUnit && inUnit && UNIT_FAMILY[exUnit] !== UNIT_FAMILY[inUnit]) return null;
  const targetUnit = exUnit || inUnit || null;
  if (!targetUnit) return { amount: null, unit: null };
  const exBase = (exAmount != null && exUnit) ? exAmount * UNIT_BASE[exUnit] : 0;
  const inBase = (inAmount != null && inUnit) ? inAmount * UNIT_BASE[inUnit] : 0;
  const sumBase = exBase + inBase;
  if (sumBase === 0) return { amount: null, unit: null };
  return { amount: sumBase / UNIT_BASE[targetUnit], unit: targetUnit };
}

function formatQty(amount, unit) {
  if (amount == null || !unit) return "";
  const trimmed = Number.isInteger(amount) ? amount : Math.round(amount * 100) / 100;
  return `${trimmed} ${unit}`;
}

// ---------- theme ----------
function applyTheme() {
  const pref = localStorage.getItem("panier-theme");
  if (pref === "light" || pref === "dark") {
    document.documentElement.setAttribute("data-theme", pref);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
toggleThemeBtn.addEventListener("click", () => {
  const pref = localStorage.getItem("panier-theme");
  const next = pref === "dark" ? "light" : pref === "light" ? null : "dark";
  if (next) localStorage.setItem("panier-theme", next);
  else localStorage.removeItem("panier-theme");
  applyTheme();
});
applyTheme();

// ---------- init ----------
async function init() {
  const session = await getSession();
  if (session) {
    showView(viewList);
    await bootstrapAccount();
  } else {
    showView(viewSignin);
  }
}

async function bootstrapAccount() {
  await ensureDefaultCategories();
  await loadCategories();
  await loadCatalogue();
  await loadLists();
  const saved = localStorage.getItem("panier-current-list");
  const stillExists = activeLists.find(l => l.id === saved);
  currentListId = stillExists ? saved : (activeLists[0] ? activeLists[0].id : null);
  if (!currentListId) {
    currentListId = await createList("My list");
    await loadLists();
  }
  renderListSwitcher();
  await loadItems();
  renderFrequents();
}

async function ensureDefaultCategories() {
  const session = await getSession();
  const { count } = await client.from("categories").select("id", { count: "exact", head: true }).eq("user_id", session.user.id);
  if (count === 0) {
    const rows = DEFAULT_CATEGORIES.map((name, i) => ({ user_id: session.user.id, name, position: i }));
    await client.from("categories").insert(rows);
  }
}

signinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signinError.hidden = true;
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    signinError.textContent = "Sign-in failed. Check your email and password.";
    signinError.hidden = false;
    return;
  }
  showView(viewList);
  await bootstrapAccount();
});

signOutBtn.addEventListener("click", async () => {
  await client.auth.signOut();
  showView(viewSignin);
});

openSettingsBtn.addEventListener("click", async () => {
  showView(viewSettings);
  renderListsManage();
  renderCategoriesManage();
  renderCatalogueManage();
});
closeSettingsBtn.addEventListener("click", async () => {
  showView(viewList);
  await loadLists();
  renderListSwitcher();
  await loadItems();
  renderFrequents();
});

// ---------- lists ----------
async function loadLists() {
  const session = await getSession();
  const { data, error } = await client.from("lists").select("*").eq("user_id", session.user.id).order("position", { ascending: true });
  if (error) { alert("Could not load lists: " + error.message); return; }
  activeLists = (data || []).filter(l => !l.is_archived && !l.is_template);
  templateLists = (data || []).filter(l => l.is_template);
  archivedLists = (data || []).filter(l => l.is_archived && !l.is_template);
}

async function createList(name, opts = {}) {
  const session = await getSession();
  const { data, error } = await client.from("lists").insert({
    user_id: session.user.id, name,
    is_template: !!opts.isTemplate, is_demo: !!opts.isDemo,
  }).select().single();
  if (error) { alert("Could not create list: " + error.message); return null; }
  return data.id;
}

function renderListSwitcher() {
  listSwitcher.innerHTML = "";
  activeLists.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === currentListId) opt.selected = true;
    listSwitcher.appendChild(opt);
  });
}

listSwitcher.addEventListener("change", async () => {
  currentListId = listSwitcher.value;
  localStorage.setItem("panier-current-list", currentListId);
  await loadItems();
});

newListBtn.addEventListener("click", async () => {
  const name = prompt("Name for the new list:");
  if (!name || !name.trim()) return;
  const id = await createList(name.trim());
  if (!id) return;
  await loadLists();
  currentListId = id;
  localStorage.setItem("panier-current-list", currentListId);
  renderListSwitcher();
  await loadItems();
});

function renderListsManage() {
  listsManageEl.innerHTML = "";
  activeLists.forEach(l => {
    const li = document.createElement("li");
    li.className = "manage-row";
    const name = document.createElement("span");
    name.className = "manage-name";
    name.textContent = l.name;
    li.appendChild(name);

    li.appendChild(makeManageButton("Rename", async () => {
      const newName = prompt("Rename list:", l.name);
      if (!newName || !newName.trim()) return;
      await client.from("lists").update({ name: newName.trim() }).eq("id", l.id);
      await loadLists(); renderListsManage(); renderListSwitcher();
    }));
    li.appendChild(makeManageButton("Archive", async () => {
      await client.from("lists").update({ is_archived: true }).eq("id", l.id);
      await loadLists(); renderListsManage(); renderListSwitcher();
      if (currentListId === l.id) currentListId = activeLists[0] ? activeLists[0].id : null;
    }));
    li.appendChild(makeManageButton("Save as template", async () => {
      await saveListAsTemplate(l.id, l.name);
      await loadLists(); renderListsManage();
    }));
    li.appendChild(makeManageButton("Delete", async () => {
      if (!confirm(`Delete "${l.name}" and all its items? This cannot be undone.`)) return;
      await client.from("lists").delete().eq("id", l.id);
      await loadLists(); renderListsManage(); renderListSwitcher();
      if (currentListId === l.id) currentListId = activeLists[0] ? activeLists[0].id : null;
    }));
    listsManageEl.appendChild(li);
  });

  templatesManageEl.innerHTML = "";
  templateLists.forEach(l => {
    const li = document.createElement("li");
    li.className = "manage-row";
    const name = document.createElement("span");
    name.className = "manage-name";
    name.textContent = l.name;
    li.appendChild(name);
    li.appendChild(makeManageButton("Start from this", async () => {
      const id = await startListFromTemplate(l.id, l.name);
      await loadLists();
      currentListId = id;
      localStorage.setItem("panier-current-list", currentListId);
      renderListSwitcher(); renderListsManage();
    }));
    li.appendChild(makeManageButton("Delete", async () => {
      if (!confirm(`Delete template "${l.name}"?`)) return;
      await client.from("lists").delete().eq("id", l.id);
      await loadLists(); renderListsManage();
    }));
    templatesManageEl.appendChild(li);
  });

  archivedManageEl.innerHTML = "";
  archivedLists.forEach(l => {
    const li = document.createElement("li");
    li.className = "manage-row";
    const name = document.createElement("span");
    name.className = "manage-name";
    name.textContent = l.name;
    li.appendChild(name);
    li.appendChild(makeManageButton("Unarchive", async () => {
      await client.from("lists").update({ is_archived: false }).eq("id", l.id);
      await loadLists(); renderListsManage(); renderListSwitcher();
    }));
    li.appendChild(makeManageButton("Delete", async () => {
      if (!confirm(`Delete archived list "${l.name}" and all its items? This cannot be undone.`)) return;
      await client.from("lists").delete().eq("id", l.id);
      await loadLists(); renderListsManage();
    }));
    archivedManageEl.appendChild(li);
  });
}

function makeManageButton(label, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", handler);
  return btn;
}

async function saveListAsTemplate(sourceListId, sourceName) {
  const session = await getSession();
  const { data: items } = await client.from("items").select("*").eq("list_id", sourceListId);
  const templateId = await createList(sourceName, { isTemplate: true });
  if (!templateId || !items) return;
  const rows = items.map(i => ({
    user_id: session.user.id, list_id: templateId, name: i.name,
    qty_amount: i.qty_amount, qty_unit: i.qty_unit, note: i.note,
    category_id: i.category_id, state: "to_get",
  }));
  if (rows.length) await client.from("items").insert(rows);
}

async function startListFromTemplate(templateId, templateName) {
  const session = await getSession();
  const { data: items } = await client.from("items").select("*").eq("list_id", templateId);
  const newId = await createList(templateName);
  if (!newId || !items) return newId;
  const rows = items.map(i => ({
    user_id: session.user.id, list_id: newId, name: i.name,
    qty_amount: i.qty_amount, qty_unit: i.qty_unit, note: i.note,
    category_id: i.category_id, state: "to_get",
  }));
  if (rows.length) await client.from("items").insert(rows);
  return newId;
}

// ---------- categories ----------
async function loadCategories() {
  const session = await getSession();
  const { data, error } = await client.from("categories").select("*").eq("user_id", session.user.id).order("position", { ascending: true });
  if (error) { alert("Could not load categories: " + error.message); return; }
  categories = data || [];
}

function renderCategoriesManage() {
  categoriesManageEl.innerHTML = "";
  categories.forEach((c, idx) => {
    const li = document.createElement("li");
    li.className = "manage-row";
    const name = document.createElement("span");
    name.className = "manage-name";
    name.textContent = c.name;
    li.appendChild(name);

    li.appendChild(makeManageButton("Rename", async () => {
      const newName = prompt("Rename category:", c.name);
      if (!newName || !newName.trim()) return;
      await client.from("categories").update({ name: newName.trim() }).eq("id", c.id);
      await loadCategories(); renderCategoriesManage();
    }));
    if (idx > 0) {
      li.appendChild(makeManageButton("Up", async () => {
        await swapCategoryPosition(idx, idx - 1);
      }));
    }
    if (idx < categories.length - 1) {
      li.appendChild(makeManageButton("Down", async () => {
        await swapCategoryPosition(idx, idx + 1);
      }));
    }
    li.appendChild(makeManageButton("Delete", async () => {
      if (!confirm(`Delete category "${c.name}"? Items in it move to Other.`)) return;
      await client.from("categories").delete().eq("id", c.id);
      await loadCategories(); renderCategoriesManage();
    }));
    categoriesManageEl.appendChild(li);
  });
}

async function swapCategoryPosition(i, j) {
  const a = categories[i], b = categories[j];
  await client.from("categories").update({ position: b.position }).eq("id", a.id);
  await client.from("categories").update({ position: a.position }).eq("id", b.id);
  await loadCategories();
  renderCategoriesManage();
}

newCategoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newCategoryName.value.trim();
  if (!name) return;
  const session = await getSession();
  await client.from("categories").insert({ user_id: session.user.id, name, position: categories.length });
  newCategoryName.value = "";
  await loadCategories();
  renderCategoriesManage();
});

function categorySelectOptions(selectedId) {
  let html = `<option value="">Other</option>`;
  categories.forEach(c => {
    html += `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
  });
  return html;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---------- catalogue ----------
async function loadCatalogue() {
  const session = await getSession();
  const { data, error } = await client.from("catalogue_items").select("*").eq("user_id", session.user.id).order("times_added", { ascending: false });
  if (error) { alert("Could not load catalogue: " + error.message); return; }
  catalogue = data || [];
}

async function upsertCatalogue(name, categoryId) {
  const session = await getSession();
  const norm = normalizeName(name);
  const existing = catalogue.find(c => c.normalized_name === norm);
  if (existing) {
    await client.from("catalogue_items").update({
      times_added: existing.times_added + 1,
      last_added_at: new Date().toISOString(),
      category_id: categoryId != null ? categoryId : existing.category_id,
    }).eq("id", existing.id);
  } else {
    await client.from("catalogue_items").insert({
      user_id: session.user.id, normalized_name: norm, display_name: name, category_id: categoryId || null,
    });
  }
  await loadCatalogue();
}

function renderFrequents() {
  const top = catalogue.slice(0, 8);
  frequentsSection.hidden = top.length === 0;
  frequentsList.innerHTML = "";
  top.forEach(c => {
    const chip = document.createElement("span");
    chip.className = "frequent-chip";
    const label = document.createElement("span");
    label.textContent = c.display_name;
    chip.appendChild(label);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "+";
    btn.setAttribute("aria-label", `Add ${c.display_name} to the list`);
    btn.addEventListener("click", async () => {
      await addItemToCurrentList(c.display_name, null, null);
      await loadItems();
    });
    chip.appendChild(btn);
    frequentsList.appendChild(chip);
  });
}

function renderCatalogueManage() {
  catalogueManageEl.innerHTML = "";
  catalogue.forEach(c => {
    const li = document.createElement("li");
    li.className = "manage-row";
    const cat = categories.find(cc => cc.id === c.category_id);
    const name = document.createElement("span");
    name.className = "manage-name";
    name.textContent = `${c.display_name}${cat ? " — " + cat.name : ""} (${c.times_added}×)`;
    li.appendChild(name);
    li.appendChild(makeManageButton("Remove", async () => {
      await client.from("catalogue_items").delete().eq("id", c.id);
      await loadCatalogue();
      renderCatalogueManage();
      renderFrequents();
    }));
    catalogueManageEl.appendChild(li);
  });
}

// ---------- items ----------
async function loadItems() {
  const session = await getSession();
  if (!session || !currentListId) return;
  const { data, error } = await client.from("items")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("list_id", currentListId)
    .order("created_at", { ascending: true });
  if (error) { alert("Could not load items: " + error.message); return; }
  currentItems = data || [];
  renderItems(currentItems);
}

async function addItemToCurrentList(name, amount, unit) {
  const session = await getSession();
  const norm = normalizeName(name);
  const existing = currentItems.find(it => normalizeName(it.name) === norm);

  if (existing) {
    const combined = combineQuantities(existing.qty_amount, existing.qty_unit, amount, unit);
    if (combined) {
      const { error } = await client.from("items").update({
        qty_amount: combined.amount, qty_unit: combined.unit,
      }).eq("id", existing.id);
      if (error) { alert("Could not update item: " + error.message); return; }
      await upsertCatalogue(existing.name, existing.category_id);
      return;
    }
  }

  const catEntry = catalogue.find(c => c.normalized_name === norm);
  const category_id = catEntry ? catEntry.category_id : null;
  const { error } = await client.from("items").insert({
    user_id: session.user.id, list_id: currentListId, name,
    qty_amount: amount, qty_unit: unit, category_id, state: "to_get",
  });
  if (error) { alert("Could not add item: " + error.message); return; }
  await upsertCatalogue(name, category_id);
}

addItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addItemName.value.trim();
  if (!name) return;
  const amountRaw = addItemQty.value.trim();
  const amount = amountRaw === "" ? null : parseFloat(amountRaw);
  const unit = amount === null ? null : addItemUnit.value;

  await addItemToCurrentList(name, amount, unit);
  addItemName.value = "";
  addItemQty.value = "";
  autocompleteList.hidden = true;
  addItemName.focus();
  await loadItems();
  renderFrequents();
});

addItemName.addEventListener("input", () => {
  const q = normalizeName(addItemName.value.trim());
  if (!q) { autocompleteList.hidden = true; return; }
  const matches = catalogue.filter(c => c.normalized_name.startsWith(q) || c.normalized_name.includes(q)).slice(0, 6);
  if (!matches.length) { autocompleteList.hidden = true; return; }
  autocompleteList.innerHTML = "";
  matches.forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "autocomplete-item";
    btn.textContent = m.display_name;
    btn.addEventListener("click", () => {
      addItemName.value = m.display_name;
      autocompleteList.hidden = true;
      addItemName.focus();
    });
    autocompleteList.appendChild(btn);
  });
  autocompleteList.hidden = false;
});
document.addEventListener("click", (e) => {
  if (!addItemForm.contains(e.target)) autocompleteList.hidden = true;
});

toggleMultiaddBtn.addEventListener("click", () => {
  multiAddForm.hidden = !multiAddForm.hidden;
});
multiAddForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = multiAddText.value.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    await addItemToCurrentList(line, null, null);
  }
  multiAddText.value = "";
  multiAddForm.hidden = true;
  await loadItems();
  renderFrequents();
});

clearCheckedBtn.addEventListener("click", async () => {
  const session = await getSession();
  const { error } = await client.from("items")
    .delete()
    .eq("user_id", session.user.id)
    .eq("list_id", currentListId)
    .eq("state", "got");
  if (error) { alert("Could not clear checked items: " + error.message); return; }
  await loadItems();
});

shareListBtn.addEventListener("click", async () => {
  const list = activeLists.find(l => l.id === currentListId);
  const lines = currentItems
    .filter(i => i.state !== "got")
    .map(i => `- ${i.name}${i.qty_amount ? " (" + formatQty(i.qty_amount, i.qty_unit) + ")" : ""}${i.note ? " — " + i.note : ""}`);
  const text = `${list ? list.name : "Panier list"}\n${lines.join("\n")}`;
  if (navigator.share) {
    try { await navigator.share({ text, title: list ? list.name : "Panier" }); return; } catch (e) { /* user cancelled */ return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("List copied to clipboard.");
  } catch {
    alert(text);
  }
});

function renderItems(items) {
  const toGet = items.filter(i => i.state !== "got");
  const got = items.filter(i => i.state === "got");

  remainingCountEl.textContent = `${toGet.length} to get`;

  toGet.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const groups = new Map();
  toGet.forEach(it => {
    const key = it.category_id || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });

  itemGroupsEl.innerHTML = "";
  categories.forEach(c => {
    if (groups.has(c.id)) renderGroup(c.name, groups.get(c.id));
  });
  if (groups.has("other")) renderGroup("Other", groups.get("other"));

  if (got.length > 0) {
    const divider = document.createElement("div");
    divider.className = "list-divider";
    divider.textContent = `Checked (${got.length})`;
    itemGroupsEl.appendChild(divider);
    const ul = document.createElement("ul");
    ul.className = "item-list";
    got.forEach(item => ul.appendChild(renderItemRow(item)));
    itemGroupsEl.appendChild(ul);
  }
}

function renderGroup(name, items) {
  const wrapper = document.createElement("div");
  wrapper.className = "category-group";
  const heading = document.createElement("div");
  heading.className = "category-heading";
  heading.textContent = name;
  wrapper.appendChild(heading);
  const ul = document.createElement("ul");
  ul.className = "item-list";
  items.forEach(item => ul.appendChild(renderItemRow(item)));
  wrapper.appendChild(ul);
  itemGroupsEl.appendChild(wrapper);
}

function renderItemRow(item) {
  const li = document.createElement("li");
  li.className = "item-row" + (item.state === "got" ? " checked" : "") + (item.urgent ? " urgent" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.state === "got";
  checkbox.setAttribute("aria-label", `Mark ${item.name} as ${item.state === "got" ? "not got" : "got"}`);
  checkbox.addEventListener("change", async () => {
    const newState = checkbox.checked ? "got" : "to_get";
    const { error } = await client.from("items").update({ state: newState }).eq("id", item.id);
    if (error) { alert("Could not update item: " + error.message); return; }
    await loadItems();
  });

  const main = document.createElement("div");
  main.className = "item-main";

  const nameEl = document.createElement("span");
  nameEl.className = "item-name" + (item.state === "got" ? " got" : "");
  nameEl.textContent = item.name;
  main.appendChild(nameEl);

  const qtyText = formatQty(item.qty_amount, item.qty_unit);
  if (qtyText) {
    const qtyEl = document.createElement("span");
    qtyEl.className = "item-qty";
    qtyEl.textContent = qtyText;
    main.appendChild(qtyEl);
  }
  if (item.note) {
    const noteEl = document.createElement("span");
    noteEl.className = "item-note";
    noteEl.textContent = item.note;
    main.appendChild(noteEl);
  }

  li.appendChild(checkbox);
  li.appendChild(main);

  if (item.urgent) {
    const badge = document.createElement("span");
    badge.className = "urgent-badge";
    badge.textContent = "Urgent";
    li.appendChild(badge);
  }
  if (item.state === "got") {
    const badge = document.createElement("span");
    badge.className = "got-badge";
    badge.textContent = "Got";
    li.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openEditPanel(item, li));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    const { error } = await client.from("items").delete().eq("id", item.id);
    if (error) { alert("Could not delete item: " + error.message); return; }
    await loadItems();
  });
  actions.appendChild(deleteBtn);
  li.appendChild(actions);

  return li;
}

function openEditPanel(item, li) {
  const panel = document.createElement("div");
  panel.className = "edit-panel";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = item.name;
  nameInput.setAttribute("aria-label", "Item name");

  const row1 = document.createElement("div");
  row1.className = "edit-row";
  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.step = "any";
  qtyInput.min = "0";
  qtyInput.value = item.qty_amount != null ? item.qty_amount : "";
  qtyInput.placeholder = "qty";
  qtyInput.setAttribute("aria-label", "Quantity amount");
  const unitSelect = document.createElement("select");
  unitSelect.setAttribute("aria-label", "Unit");
  Object.keys(UNIT_FAMILY).forEach(u => {
    const opt = document.createElement("option");
    opt.value = u; opt.textContent = u;
    if (item.qty_unit === u) opt.selected = true;
    unitSelect.appendChild(opt);
  });
  row1.appendChild(qtyInput);
  row1.appendChild(unitSelect);

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.value = item.note || "";
  noteInput.placeholder = "note (optional)";
  noteInput.setAttribute("aria-label", "Note");

  const catSelect = document.createElement("select");
  catSelect.setAttribute("aria-label", "Category");
  catSelect.innerHTML = categorySelectOptions(item.category_id);

  const urgentLabel = document.createElement("label");
  const urgentCheckbox = document.createElement("input");
  urgentCheckbox.type = "checkbox";
  urgentCheckbox.checked = !!item.urgent;
  urgentLabel.appendChild(urgentCheckbox);
  urgentLabel.appendChild(document.createTextNode(" Urgent"));

  const actionsRow = document.createElement("div");
  actionsRow.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    const newName = nameInput.value.trim() || item.name;
    const amountRaw = qtyInput.value.trim();
    const amount = amountRaw === "" ? null : parseFloat(amountRaw);
    const unit = amount === null ? null : unitSelect.value;
    const category_id = catSelect.value || null;
    const { error } = await client.from("items").update({
      name: newName, qty_amount: amount, qty_unit: unit,
      note: noteInput.value.trim() || null, category_id, urgent: urgentCheckbox.checked,
    }).eq("id", item.id);
    if (error) { alert("Could not save item: " + error.message); return; }
    await upsertCatalogue(newName, category_id);
    await loadItems();
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => loadItems());
  actionsRow.appendChild(saveBtn);
  actionsRow.appendChild(cancelBtn);

  panel.appendChild(nameInput);
  panel.appendChild(row1);
  panel.appendChild(noteInput);
  panel.appendChild(catSelect);
  panel.appendChild(urgentLabel);
  panel.appendChild(actionsRow);

  li.innerHTML = "";
  li.appendChild(panel);
  nameInput.focus();
}

// ---------- export ----------
exportBtn.addEventListener("click", async () => {
  const session = await getSession();
  const { data: lists } = await client.from("lists").select("*").eq("user_id", session.user.id);
  const { data: items } = await client.from("items").select("*").eq("user_id", session.user.id);
  const { data: cats } = await client.from("categories").select("*").eq("user_id", session.user.id);
  const { data: cat } = await client.from("catalogue_items").select("*").eq("user_id", session.user.id);
  const payload = {
    exported_at: new Date().toISOString().slice(0, 10),
    account: session.user.email,
    lists, items, categories: cats, catalogue: cat,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `panier-export-${payload.exported_at}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- demo data ----------
const DEMO_ITEMS_MAIN = [
  { name: "Milk", qty_amount: 2, qty_unit: "L", state: "got", cat: "Dairy & Eggs" },
  { name: "Eggs", qty_amount: 1, qty_unit: "dozen", state: "to_get", cat: "Dairy & Eggs" },
  { name: "Bread", qty_amount: null, qty_unit: null, state: "to_get", cat: "Bakery" },
  { name: "Tomatoes", qty_amount: null, qty_unit: null, state: "to_get", cat: "Produce" },
  { name: "tomato", qty_amount: null, qty_unit: null, state: "to_get", cat: "Produce" },
  { name: "Bananas", qty_amount: null, qty_unit: null, state: "got", cat: "Produce" },
  { name: "Ground coffee, medium roast, the one in the yellow bag from the specialty shop downtown", qty_amount: null, qty_unit: null, state: "to_get", cat: "Pantry" },
  { name: "Butter", qty_amount: null, qty_unit: null, state: "got", cat: "Dairy & Eggs" },
  { name: "Yogurt", qty_amount: null, qty_unit: null, state: "to_get", cat: "Dairy & Eggs" },
  { name: "Pasta", qty_amount: null, qty_unit: null, state: "to_get", cat: "Pantry" },
  { name: "Onions", qty_amount: null, qty_unit: null, state: "to_get", cat: null },
  { name: "Paper towels", qty_amount: null, qty_unit: null, state: "to_get", cat: "Household" },
  { name: "Flour", qty_amount: 1, qty_unit: "kg", state: "to_get", cat: "Pantry" },
  { name: "Flour", qty_amount: 1, qty_unit: "bag", state: "to_get", cat: "Pantry" },
];
const DEMO_ITEMS_SECOND_LIST = [
  { name: "Chips", qty_amount: 2, qty_unit: "bag", state: "to_get", cat: "Pantry" },
  { name: "Soda", qty_amount: 2, qty_unit: "L", state: "to_get", cat: "Beverages" },
  { name: "Burger buns", qty_amount: 1, qty_unit: "pack", state: "to_get", cat: "Bakery" },
  { name: "Ground beef", qty_amount: 500, qty_unit: "g", state: "to_get", cat: "Meat & Seafood" },
];
const DEMO_CATALOGUE_EXTRA = [
  { name: "Milk", times: 6, cat: "Dairy & Eggs" },
  { name: "Eggs", times: 5, cat: "Dairy & Eggs" },
  { name: "Bread", times: 5, cat: "Bakery" },
  { name: "Bananas", times: 4, cat: "Produce" },
  { name: "Butter", times: 3, cat: "Dairy & Eggs" },
  { name: "Coffee", times: 3, cat: "Pantry" },
  { name: "Yogurt", times: 2, cat: "Dairy & Eggs" },
  { name: "Pasta", times: 2, cat: "Pantry" },
  { name: "Onions", times: 2, cat: null },
  { name: "Paper towels", times: 1, cat: "Household" },
  { name: "Chips", times: 1, cat: "Pantry" },
  { name: "Soda", times: 1, cat: "Beverages" },
];

loadDemoBtn.addEventListener("click", async () => {
  const session = await getSession();
  await ensureDefaultCategories();
  await loadCategories();
  const catId = (name) => name ? (categories.find(c => c.name === name) || {}).id || null : null;

  const mainListId = await createList("Groceries", { isDemo: true });
  const secondListId = await createList("Weekend BBQ", { isDemo: true });
  if (!mainListId || !secondListId) { demoStatus.textContent = "Could not create demo lists."; return; }

  const mainRows = DEMO_ITEMS_MAIN.map(i => ({
    user_id: session.user.id, list_id: mainListId, is_demo: true,
    name: i.name, qty_amount: i.qty_amount, qty_unit: i.qty_unit, state: i.state,
    category_id: catId(i.cat),
  }));
  const secondRows = DEMO_ITEMS_SECOND_LIST.map(i => ({
    user_id: session.user.id, list_id: secondListId, is_demo: true,
    name: i.name, qty_amount: i.qty_amount, qty_unit: i.qty_unit, state: i.state,
    category_id: catId(i.cat),
  }));
  const { error: itemsErr } = await client.from("items").insert([...mainRows, ...secondRows]);

  const catalogueRows = DEMO_CATALOGUE_EXTRA.map(c => ({
    user_id: session.user.id, is_demo: true,
    normalized_name: normalizeName(c.name), display_name: c.name,
    category_id: catId(c.cat), times_added: c.times,
  }));
  const { error: catErr } = await client.from("catalogue_items").upsert(catalogueRows, { onConflict: "user_id,normalized_name" });

  demoStatus.textContent = (itemsErr || catErr) ? "Could not fully load demo data: " + ((itemsErr || catErr).message) : "Demo data loaded.";
  await loadLists();
  currentListId = mainListId;
  localStorage.setItem("panier-current-list", currentListId);
  renderListSwitcher();
  renderListsManage();
  await loadCatalogue();
  await loadItems();
  renderFrequents();
});

removeDemoBtn.addEventListener("click", async () => {
  const session = await getSession();
  await client.from("items").delete().eq("user_id", session.user.id).eq("is_demo", true);
  await client.from("lists").delete().eq("user_id", session.user.id).eq("is_demo", true);
  await client.from("catalogue_items").delete().eq("user_id", session.user.id).eq("is_demo", true);
  demoStatus.textContent = "Demo data removed.";
  await loadLists();
  if (!activeLists.find(l => l.id === currentListId)) {
    currentListId = activeLists[0] ? activeLists[0].id : await createList("My list");
    await loadLists();
  }
  localStorage.setItem("panier-current-list", currentListId);
  renderListSwitcher();
  renderListsManage();
  await loadCatalogue();
  await loadItems();
  renderFrequents();
});

init();
