const SUPABASE_URL = "https://yzpwwmbbifzxelwdlsnu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6cHd3bWJiaWZ6eGVsd2Rsc251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjkzODksImV4cCI6MjEwMzM0NTM4OX0.A0NEJwKjqg262uTDlPaffOaCM20Pep8LbsB9SUA49GU";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const viewSignin = document.getElementById("view-signin");
const viewList = document.getElementById("view-list");
const viewSettings = document.getElementById("view-settings");

const signinForm = document.getElementById("signin-form");
const signinError = document.getElementById("signin-error");

const addItemForm = document.getElementById("add-item-form");
const addItemName = document.getElementById("add-item-name");
const addItemQty = document.getElementById("add-item-qty");

const itemListEl = document.getElementById("item-list");
const remainingCountEl = document.getElementById("remaining-count");
const clearCheckedBtn = document.getElementById("clear-checked");

const openSettingsBtn = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const signOutBtn = document.getElementById("sign-out");
const exportBtn = document.getElementById("export-data");
const loadDemoBtn = document.getElementById("load-demo");
const removeDemoBtn = document.getElementById("remove-demo");
const demoStatus = document.getElementById("demo-status");

function showView(view) {
  [viewSignin, viewList, viewSettings].forEach(v => v.hidden = v !== view);
}

async function getSession() {
  const { data } = await client.auth.getSession();
  return data.session;
}

async function init() {
  const session = await getSession();
  if (session) {
    showView(viewList);
    await loadItems();
  } else {
    showView(viewSignin);
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
  await loadItems();
});

signOutBtn.addEventListener("click", async () => {
  await client.auth.signOut();
  showView(viewSignin);
});

openSettingsBtn.addEventListener("click", () => showView(viewSettings));
closeSettingsBtn.addEventListener("click", async () => {
  showView(viewList);
  await loadItems();
});

addItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addItemName.value.trim();
  if (!name) return;
  const quantity = addItemQty.value.trim() || null;
  const session = await getSession();
  const { error } = await client.from("items").insert({
    user_id: session.user.id,
    name,
    quantity,
    state: "to_get",
  });
  if (error) {
    alert("Could not add item: " + error.message);
    return;
  }
  addItemName.value = "";
  addItemQty.value = "";
  addItemName.focus();
  await loadItems();
});

clearCheckedBtn.addEventListener("click", async () => {
  const session = await getSession();
  const { error } = await client.from("items")
    .delete()
    .eq("user_id", session.user.id)
    .eq("state", "got");
  if (error) {
    alert("Could not clear checked items: " + error.message);
    return;
  }
  await loadItems();
});

async function loadItems() {
  const session = await getSession();
  if (!session) return;
  const { data, error } = await client.from("items")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: true });
  if (error) {
    alert("Could not load items: " + error.message);
    return;
  }
  renderItems(data || []);
}

function renderItems(items) {
  const toGet = items.filter(i => i.state !== "got");
  const got = items.filter(i => i.state === "got");

  remainingCountEl.textContent = `${toGet.length} to get`;

  itemListEl.innerHTML = "";
  toGet.forEach(item => itemListEl.appendChild(renderItemRow(item)));

  if (got.length > 0) {
    const divider = document.createElement("li");
    divider.className = "list-divider";
    divider.textContent = `Checked (${got.length})`;
    itemListEl.appendChild(divider);
    got.forEach(item => itemListEl.appendChild(renderItemRow(item)));
  }
}

function renderItemRow(item) {
  const li = document.createElement("li");
  li.className = "item-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.state === "got";
  checkbox.setAttribute("aria-label", `Mark ${item.name} as ${item.state === "got" ? "not got" : "got"}`);
  checkbox.addEventListener("change", async () => {
    const newState = checkbox.checked ? "got" : "to_get";
    const { error } = await client.from("items").update({ state: newState }).eq("id", item.id);
    if (error) {
      alert("Could not update item: " + error.message);
      return;
    }
    await loadItems();
  });

  const main = document.createElement("div");
  main.className = "item-main";

  const nameEl = document.createElement("span");
  nameEl.className = "item-name" + (item.state === "got" ? " got" : "");
  nameEl.textContent = item.name;
  nameEl.tabIndex = 0;
  nameEl.title = "Click to edit";
  nameEl.addEventListener("click", () => startEditingName(item, nameEl));
  main.appendChild(nameEl);

  if (item.quantity) {
    const qtyEl = document.createElement("span");
    qtyEl.className = "item-qty";
    qtyEl.textContent = item.quantity;
    main.appendChild(qtyEl);
  }

  li.appendChild(checkbox);
  li.appendChild(main);

  if (item.state === "got") {
    const badge = document.createElement("span");
    badge.className = "got-badge";
    badge.textContent = "Got";
    li.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    const { error } = await client.from("items").delete().eq("id", item.id);
    if (error) {
      alert("Could not delete item: " + error.message);
      return;
    }
    await loadItems();
  });
  actions.appendChild(deleteBtn);
  li.appendChild(actions);

  return li;
}

function startEditingName(item, nameEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = item.name;
  input.className = "item-name-edit";
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  async function commit() {
    const newName = input.value.trim();
    if (newName && newName !== item.name) {
      const { error } = await client.from("items").update({ name: newName }).eq("id", item.id);
      if (error) {
        alert("Could not rename item: " + error.message);
      }
    }
    await loadItems();
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") { input.value = item.name; input.blur(); }
  });
}

exportBtn.addEventListener("click", async () => {
  const session = await getSession();
  const { data, error } = await client.from("items").select("*").eq("user_id", session.user.id);
  if (error) {
    alert("Could not export data: " + error.message);
    return;
  }
  const payload = {
    exported_at: new Date().toISOString().slice(0, 10),
    account: session.user.email,
    items: data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `panier-export-${payload.exported_at}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const DEMO_ITEMS = [
  { name: "Milk", quantity: "2 L", state: "got" },
  { name: "Eggs", quantity: "a dozen", state: "to_get" },
  { name: "Bread", quantity: null, state: "to_get" },
  { name: "Tomatoes", quantity: null, state: "to_get" },
  { name: "tomato", quantity: null, state: "to_get" },
  { name: "Bananas", quantity: null, state: "got" },
  { name: "Ground coffee, medium roast, the one in the yellow bag from the specialty shop downtown", quantity: null, state: "to_get" },
  { name: "Butter", quantity: null, state: "got" },
  { name: "Yogurt", quantity: null, state: "to_get" },
  { name: "Pasta", quantity: null, state: "to_get" },
  { name: "Onions", quantity: null, state: "to_get" },
  { name: "Paper towels", quantity: null, state: "to_get" },
];

loadDemoBtn.addEventListener("click", async () => {
  const session = await getSession();
  const rows = DEMO_ITEMS.map(i => ({ ...i, user_id: session.user.id, is_demo: true }));
  const { error } = await client.from("items").insert(rows);
  demoStatus.textContent = error ? "Could not load demo data: " + error.message : "Demo data loaded.";
});

removeDemoBtn.addEventListener("click", async () => {
  const session = await getSession();
  const { error } = await client.from("items")
    .delete()
    .eq("user_id", session.user.id)
    .eq("is_demo", true);
  demoStatus.textContent = error ? "Could not remove demo data: " + error.message : "Demo data removed.";
});

init();
