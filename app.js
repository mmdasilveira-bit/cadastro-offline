/* PASSO 4 — PWA Offline + IndexedDB + Base CEP Local
   - Sem custos adicionais
   - Funciona em smartphone e computador
   - CEP preenche rua/bairro/cidade/uf via arquivo cep_base.json (offline)
*/

const DB_NAME = "cadastro_partido_db";
const DB_VERSION = 1;
const STORE = "pessoas";

let db;
let cepBase = []; // carregada do JSON local

// ---------- Utilidades ----------
function nowBR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

function normalizeCEP(cep) {
  const d = onlyDigits(cep);
  if (d.length !== 8) return "";
  return d;
}

function maskCPF(cpfDigits) {
  if (!cpfDigits || cpfDigits.length !== 11) return "***********";
  // ***.***.***-**
  return `***.***.***-${cpfDigits.slice(9, 11)}`;
}

function getPerfil() {
  return document.getElementById("perfilAcesso").value;
}

function enabledMunicipios() {
  const checks = [...document.querySelectorAll(".muni")];
  return new Set(checks.filter(c => c.checked).map(c => c.value));
}

function netStatus() {
  const el = document.getElementById("netPill");
  el.textContent = `Rede: ${navigator.onLine ? "Online" : "Offline"}`;
}

function pwaStatus() {
  const el = document.getElementById("pwaPill");
  const ok = ("serviceWorker" in navigator);
  el.textContent = `PWA: ${ok ? "Ativa" : "Indisponível"}`;
}

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("cpf", "cpf", { unique: false });
      store.createIndex("nome", "nome", { unique: false });
      store.createIndex("cidade", "cidade", { unique: false });
      store.createIndex("tipo", "tipo", { unique: false });
      store.createIndex("dataCadastro", "dataCadastro", { unique: false });
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = "readonly") {
  const t = db.transaction(storeName, mode);
  return t.objectStore(storeName);
}

function addPessoa(pessoa) {
  return new Promise((resolve, reject) => {
    const store = tx(STORE, "readwrite");
    const req = store.add(pessoa);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllPessoas() {
  return new Promise((resolve, reject) => {
    const store = tx(STORE, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function clearAll() {
  return new Promise((resolve, reject) => {
    const store = tx(STORE, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- CEP Base Local ----------
async function loadCepBase() {
  // Arquivo local (offline)
  const res = await fetch("cep_base.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Não foi possível carregar cep_base.json");
  cepBase = await res.json();
}

function findCep(cepDigits) {
  const muniSet = enabledMunicipios();
  // Estrutura esperada no JSON:
  // { "cep":"89200-000", "cep_digits":"89200000", "logradouro":"...", "bairro":"...", "cidade":"Jaraguá do Sul", "uf":"SC" }
  return cepBase.find(r => r.cep_digits === cepDigits && muniSet.has(r.cidade));
}

function setCepMsg(msg) {
  document.getElementById("cepMsg").textContent = msg || "";
}

// ---------- UI ----------
function readForm() {
  return {
    tipo: document.getElementById("tipo").value,
    origem: document.getElementById("origem").value,
    codigoConvite: document.getElementById("codigoConvite").value.trim(),
    responsavelCadastro: document.getElementById("responsavelCadastro").value.trim(),

    nome: document.getElementById("nome").value.trim(),
    sobrenome: document.getElementById("sobrenome").value.trim(),
    cpf: onlyDigits(document.getElementById("cpf").value),
    nascimento: document.getElementById("nascimento").value.trim(),

    cel1: document.getElementById("cel1").value.trim(),
    cel2: document.getElementById("cel2").value.trim(),
    fixo: document.getElementById("fixo").value.trim(),
    email: document.getElementById("email").value.trim(),
    instagram: document.getElementById("instagram").value.trim(),
    rede1: document.getElementById("rede1").value.trim(),
    rede2: document.getElementById("rede2").value.trim(),
    wa: document.getElementById("wa").value.trim(),

    cep: document.getElementById("cep").value.trim(),
    rua: document.getElementById("rua").value.trim(),
    numero: document.getElementById("numero").value.trim(),
    complemento: document.getElementById("complemento").value.trim(),
    bairro: document.getElementById("bairro").value.trim(),
    cidade: document.getElementById("cidade").value.trim(),
    uf: document.getElementById("uf").value.trim(),

    obs: document.getElementById("obs").value.trim(),
    dataCadastro: document.getElementById("dataCadastro").value.trim(),
    dataAtualizacao: document.getElementById("dataAtualizacao").value.trim(),
  };
}

function clearForm() {
  [
    "codigoConvite","responsavelCadastro","nome","sobrenome","cpf","nascimento",
    "cel1","cel2","fixo","email","instagram","rede1","rede2","wa",
    "cep","rua","numero","complemento","bairro","cidade","uf",
    "obs"
  ].forEach(id => document.getElementById(id).value = "");

  document.getElementById("dataCadastro").value = nowBR();
  document.getElementById("dataAtualizacao").value = nowBR();
  setCepMsg("");
}

function validatePessoa(p) {
  if (!p.nome) return "Informe o nome.";
  if (!p.sobrenome) return "Informe o sobrenome.";
  if (p.cpf && p.cpf.length !== 11) return "CPF inválido (use 11 dígitos).";
  if (p.cep) {
    const c = normalizeCEP(p.cep);
    if (!c) return "CEP inválido (use 8 dígitos).";
  }
  return "";
}

async function refreshTable() {
  const all = await getAllPessoas();
  document.getElementById("dbPill").textContent = `Registros: ${all.length}`;

  const perfil = getPerfil();
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  // Ordena por ID desc
  all.sort((a,b) => (b.id||0) - (a.id||0));

  for (const r of all) {
    const tr = document.createElement("tr");

    const cpfCell = (perfil === "GESTOR")
      ? (r.cpf ? r.cpf : "")
      : (r.cpf ? maskCPF(r.cpf) : "");

    tr.innerHTML = `
      <td>${r.tipo || ""}</td>
      <td>${(r.nome||"")} ${(r.sobrenome||"")}</td>
      <td class="cpf-mask">${cpfCell}</td>
      <td>${r.cel1 || ""}</td>
      <td>${r.cidade || ""}</td>
      <td>${r.dataCadastro || ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------- Eventos ----------
async function onBuscarCep() {
  try {
    const raw = document.getElementById("cep").value;
    const cepDigits = normalizeCEP(raw);
    if (!cepDigits) {
      setCepMsg("CEP inválido. Informe 8 dígitos.");
      return;
    }

    const hit = findCep(cepDigits);
    if (!hit) {
      setCepMsg("CEP não encontrado na base local (ou município não habilitado).");
      return;
    }

    document.getElementById("rua").value = hit.logradouro || "";
    document.getElementById("bairro").value = hit.bairro || "";
    document.getElementById("cidade").value = hit.cidade || "";
    document.getElementById("uf").value = hit.uf || "";
    setCepMsg("CEP encontrado e preenchido pela base local.");
  } catch (e) {
    setCepMsg(`Erro na busca do CEP: ${e.message}`);
  }
}

async function onSalvar() {
  const p = readForm();
  const err = validatePessoa(p);
  if (err) { alert(err); return; }

  // Datas
  if (!p.dataCadastro) p.dataCadastro = nowBR();
  p.dataAtualizacao = nowBR();

  // Normaliza CEP no armazenamento (mantém original digitado, mas garante consistência)
  const cepDigits = normalizeCEP(p.cep);
  p.cep_digits = cepDigits || "";

  await addPessoa(p);
  await refreshTable();
  clearForm();
  alert("Registro salvo localmente (offline).");
}

function onExportar() {
  getAllPessoas().then(all => {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `cadastros_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  });
}

async function onApagarTudo() {
  const ok = confirm("Confirma apagar TODOS os registros locais deste dispositivo?");
  if (!ok) return;
  await clearAll();
  await refreshTable();
  alert("Registros removidos do armazenamento local.");
}

// ---------- Service Worker ----------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    // Falha não impede o uso online; apenas não instala offline.
    console.warn("Falha ao registrar service worker:", e);
  }
}

// ---------- Inicialização ----------
async function init() {
  netStatus();
  pwaStatus();

  window.addEventListener("online", netStatus);
  window.addEventListener("offline", netStatus);

  db = await openDB();

  // datas iniciais
  document.getElementById("dataCadastro").value = nowBR();
  document.getElementById("dataAtualizacao").value = nowBR();

  // listeners
  document.getElementById("btnBuscarCep").addEventListener("click", onBuscarCep);
  document.getElementById("btnSalvar").addEventListener("click", onSalvar);
  document.getElementById("btnLimpar").addEventListener("click", clearForm);
  document.getElementById("btnExportar").addEventListener("click", onExportar);
  document.getElementById("btnApagarTudo").addEventListener("click", onApagarTudo);
  document.getElementById("perfilAcesso").addEventListener("change", refreshTable);

  // carrega base de CEP local
  try {
    await loadCepBase();
    setCepMsg(`Base CEP local carregada: ${cepBase.length} registros.`);
  } catch (e) {
    setCepMsg(`Atenção: base CEP local não carregou (${e.message}).`);
  }

  await registerSW();
  await refreshTable();
}

init();
