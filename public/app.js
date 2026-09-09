const $ = id => document.getElementById(id);
let token = localStorage.getItem("estoqueToken");
let toners = [];
let categorias = [];
let demoMode = false;
const DEMO_USER = { id: 1, nome: "Guilherme", login: "guilherme" };
const DEMO_CATEGORIES = [
  {id:1,nome:"Samsung"},{id:2,nome:"Ricoh"},{id:3,nome:"HP"},{id:4,nome:"Kyocera"},{id:5,nome:"Canon"}
];
let demoToners = JSON.parse(localStorage.getItem("helpaxDemoToners") || "null") || [
  {id:1,categoria:"Samsung",categoria_id:1,modelo:"MLT-D111S",cor:"Preto",quantidade:5},
  {id:2,categoria:"HP",categoria_id:3,modelo:"CF283A",cor:"Preto",quantidade:2},
  {id:3,categoria:"Canon",categoria_id:5,modelo:"728",cor:"Preto",quantidade:0}
];
let demoHistory = JSON.parse(localStorage.getItem("helpaxDemoHistory") || "[]");
function saveDemo(){ localStorage.setItem("helpaxDemoToners", JSON.stringify(demoToners)); localStorage.setItem("helpaxDemoHistory", JSON.stringify(demoHistory)); }

function api(url, options = {}) {
  if (demoMode) return demoApi(url, options);
  options.headers = { ...(options.headers || {}), "Content-Type": "application/json" };
  if (token && url !== "/api/login") options.headers.Authorization = `Bearer ${token}`;

  return fetch(url, options).then(async r => {
    const contentType = r.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await r.json().catch(() => ({}))
      : {};

    if (!r.ok) {
      const error = new Error(data.erro || `Erro HTTP ${r.status}.`);
      error.status = r.status;
      throw error;
    }
    return data;
  });
}

async function demoApi(url, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : {};
  if (url === "/api/login" && method === "POST") {
    if (body.login === "guilherme" && body.senha === "1234") return { token: "demo-token", usuario: DEMO_USER };
    throw new Error("Usuário ou senha incorretos.");
  }
  if (url === "/api/categorias") return DEMO_CATEGORIES;
  if (url === "/api/toners" && method === "GET") return demoToners;
  if (url === "/api/toners" && method === "POST") {
    const c = DEMO_CATEGORIES.find(x => x.id === Number(body.categoria_id));
    const novo = { id: Date.now(), categoria:c?.nome || "Outros", categoria_id:Number(body.categoria_id), modelo:String(body.modelo).trim(), cor:body.cor || "Preto", quantidade:Number(body.quantidade)||0 };
    demoToners.push(novo); saveDemo(); return novo;
  }
  if (url.startsWith("/api/toners/") && method === "DELETE") {
    const id=Number(url.split("/").pop()); demoToners=demoToners.filter(x=>x.id!==id); demoHistory=demoHistory.filter(x=>x.toner_id!==id); saveDemo(); return {ok:true};
  }
  if (url === "/api/movimentacoes" && method === "GET") return demoHistory;
  if (url === "/api/movimentacoes" && method === "POST") {
    const t=demoToners.find(x=>x.id===Number(body.toner_id)); if(!t) throw new Error("Toner não encontrado.");
    const qtd=Number(body.quantidade); const nova=body.tipo==="ENTRADA"?t.quantidade+qtd:t.quantidade-qtd;
    if(nova<0) throw new Error("Estoque insuficiente."); t.quantidade=nova;
    const mov={id:Date.now(),tipo:body.tipo,quantidade:qtd,observacao:body.observacao||null,data_movimentacao:new Date().toISOString(),modelo:t.modelo,cor:t.cor,categoria:t.categoria,usuario:"Guilherme",toner_id:t.id};
    demoHistory.unshift(mov); saveDemo(); return {movimentacao:mov,nova_quantidade:nova};
  }
  throw new Error("Operação não disponível no modo local.");
}

function showApp(user) {
  $("loginPage").classList.add("hidden");
  $("appPage").classList.remove("hidden");
  $("userName").textContent = user?.nome || "Guilherme";
  load();
}

async function load() {
  try {
    [categorias, toners] = await Promise.all([
      api("/api/categorias"),
      api("/api/toners")
    ]);
    fillCategories();
    renderToners();
    await loadHistory();
  } catch (e) {
    if (e.message.includes("Sessão")) logout();
    else notify(e.message, true);
  }
}

function fillCategories() {
  $("categoria").innerHTML = categorias.map(c =>
    `<option value="${c.id}">${escapeHTML(c.nome)}</option>`
  ).join("");
}

function renderToners() {
  const term = $("search").value.toLowerCase().trim();
  const rows = toners.filter(t =>
    `${t.categoria} ${t.modelo} ${t.cor}`.toLowerCase().includes(term)
  );

  $("tonerTable").innerHTML = rows.map(t => {
    const status = t.quantidade === 0
      ? ["Sem estoque", "out"]
      : t.quantidade <= 2
      ? ["Estoque baixo", "low"]
      : ["Disponível", "ok"];

    return `<tr>
      <td><span class="category">${escapeHTML(t.categoria)}</span></td>
      <td><strong>${escapeHTML(t.modelo)}</strong></td>
      <td>${escapeHTML(t.cor)}</td>
      <td class="qty">${t.quantidade}</td>
      <td><span class="badge ${status[1]}">${status[0]}</span></td>
      <td><div class="actions">
        <button class="action remove" onclick="openMove(${t.id},'SAIDA')">− Saída</button>
        <button class="action add" onclick="openMove(${t.id},'ENTRADA')">+ Entrada</button>
        <button class="action delete" onclick="deleteToner(${t.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join("");

  $("totalModels").textContent = toners.length;
  $("totalUnits").textContent = toners.reduce((s,t)=>s+Number(t.quantidade),0);
  $("low").textContent = toners.filter(t=>t.quantidade>0 && t.quantidade<=2).length;
  $("out").textContent = toners.filter(t=>t.quantidade===0).length;
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  const button = $("loginButton");
  button.disabled = true;
  button.textContent = "Entrando...";
  try {
    const data = await api("/api/login", {
      method:"POST",
      body:JSON.stringify({ login:$("login").value.trim(), senha:$("senha").value })
    });
    token = data.token;
    localStorage.setItem("estoqueToken", token);
    showApp(data.usuario);
  } catch(e) {
    const loginValue = $("login").value.trim().toLowerCase();
    const senhaValue = $("senha").value;

    // Se o HTML estiver sendo aberto sozinho ou não houver servidor disponível,
    // permite o acesso local com o usuário de demonstração.
    const servidorIndisponivel =
      location.protocol === "file:" ||
      !e.status ||
      e.status === 404 ||
      e.status >= 500 ||
      /Failed to fetch|NetworkError|Load failed|fetch|HTTP 404/i.test(e.message);

    if (loginValue === "guilherme" && senhaValue === "1234" && servidorIndisponivel) {
      demoMode = true;
      token = "demo-token";
      localStorage.setItem("estoqueToken", token);
      showApp(DEMO_USER);
    } else {
      $("loginError").textContent = e.message || "Não foi possível entrar.";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Entrar";
  }
});

$("logout").onclick = logout;
function logout() {
  localStorage.removeItem("estoqueToken");
  token = null;
  $("appPage").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
}

$("newToner").onclick = () => {
  $("tonerForm").reset();
  $("quantidade").value = 0;
  $("modal").classList.remove("hidden");
};
$("closeModal").onclick = () => $("modal").classList.add("hidden");

$("tonerForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/toners", {
      method:"POST",
      body:JSON.stringify({
        categoria_id:Number($("categoria").value),
        modelo:$("modelo").value,
        cor:$("cor").value,
        quantidade:Number($("quantidade").value)
      })
    });
    $("modal").classList.add("hidden");
    notify("Toner cadastrado com sucesso.");
    await load();
  } catch(e) { notify(e.message,true); }
});

window.openMove = (id, type) => {
  const t = toners.find(x=>x.id===id);
  $("moveTonerId").value=id;
  $("moveType").value=type;
  $("moveQty").value=1;
  $("moveObs").value="";
  $("moveTitle").textContent=type==="ENTRADA" ? "Entrada de toner" : "Saída de toner";
  $("moveSubmit").textContent=type==="ENTRADA" ? "Registrar entrada" : "Registrar saída";
  $("moveInfo").textContent=`${t.categoria} • ${t.modelo} • ${t.cor} • estoque atual: ${t.quantidade}`;
  $("moveModal").classList.remove("hidden");
};

$("closeMove").onclick=()=>$("moveModal").classList.add("hidden");

$("moveForm").addEventListener("submit", async e=>{
  e.preventDefault();
  try {
    await api("/api/movimentacoes", {
      method:"POST",
      body:JSON.stringify({
        toner_id:Number($("moveTonerId").value),
        tipo:$("moveType").value,
        quantidade:Number($("moveQty").value),
        observacao:$("moveObs").value
      })
    });
    $("moveModal").classList.add("hidden");
    notify("Movimentação registrada.");
    await load();
  } catch(e){ notify(e.message,true); }
});

window.deleteToner = async id => {
  if(!confirm("Excluir este toner? O histórico desse toner também será excluído.")) return;
  try {
    await api(`/api/toners/${id}`,{method:"DELETE"});
    notify("Toner excluído.");
    await load();
  } catch(e){ notify(e.message,true); }
};

$("search").addEventListener("input", renderToners);
$("refreshHistory").onclick=loadHistory;

async function loadHistory(){
  const rows=await api("/api/movimentacoes");
  $("historyTable").innerHTML=rows.map(m=>`
    <tr>
      <td>${new Date(m.data_movimentacao).toLocaleString("pt-BR")}</td>
      <td>${escapeHTML(m.categoria)}</td>
      <td>${escapeHTML(m.modelo)}</td>
      <td>${escapeHTML(m.cor)}</td>
      <td class="${m.tipo==='ENTRADA'?'entrada':'saida'}">${m.tipo}</td>
      <td>${m.quantidade}</td>
      <td>${escapeHTML(m.usuario)}</td>
      <td>${escapeHTML(m.observacao || "—")}</td>
    </tr>`).join("");
}

document.querySelectorAll(".tab").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(x=>x.classList.add("hidden"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.remove("hidden");
  };
});

function notify(text,bad=false){
  $("message").innerHTML=`<div class="notice ${bad?"bad":""}">${escapeHTML(text)}</div>`;
  setTimeout(()=>$("message").innerHTML="",3500);
}

function escapeHTML(v){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

if (token) {
  if (token === "demo-token" || location.protocol === "file:") {
    demoMode = true;
    showApp(DEMO_USER);
  } else {
    api("/api/toners")
      .then(() => showApp())
      .catch(() => {
        localStorage.removeItem("estoqueToken");
        token = null;
      });
  }
}
