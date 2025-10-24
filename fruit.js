javascript:(()=>{/* Shopee Farm Helper v2.7 - highlight harvest, clean log */
const REQUIRED_URL="https://games.shopee.vn/farm/share.html";
const API_BASE="https://games.shopee.vn/farm/api";
let state={running:false,what:null};
let hasShownFirstMessage=false;
let lastShopProps=[];

function q(s){return document.querySelector(s)}
function qAll(s){return Array.from(document.querySelectorAll(s))}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function log(...a){
  const box=q("#sf_log");
  if(!box)return;
  box.innerHTML+=a.join(" ")+"\n\n";
  box.scrollTop=box.scrollHeight;
}

/* ===================== UI ===================== */
const STYLE=`#sf_panel{position:fixed;top:20px;right:20px;z-index:999999;background:#111827;color:#E5E7EB;border:1px solid #374151;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);width:600px;max-height:90vh;display:flex;flex-direction:column;font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}
#sf_head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #1F2937;font-weight:600;cursor:move;user-select:none}
#sf_btns{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px}
.sf_btn{background:#1F2937;border:1px solid #374151;border-radius:8px;padding:8px 10px;color:#E5E7EB;cursor:pointer;text-align:center}
.sf_btn:hover{background:#111827}
#sf_body{padding:0 12px 12px 12px;overflow:auto}
#sf_log{white-space:pre-wrap;background:#0B1220;border:1px solid #1F2937;border-radius:8px;padding:10px;min-height:150px;max-height:320px;overflow:auto;font-family:monospace;line-height:1.5}
.sf_list{margin-top:10px;border:1px solid #1F2937;border-radius:10px;overflow:hidden}
.sf_row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;border-top:1px solid #111827}
.sf_row:first-child{border-top:none}
.sf_row .meta{flex:1;min-width:0}
.sf_row .meta .name{font-weight:600}
.sf_row .meta .sub{opacity:.8;font-size:12px}
.sf_small{font-size:12px;opacity:.9}
#sf_close{background:transparent;border:0;color:#9CA3AF;cursor:pointer;font-weight:700}
#sf_close:hover{color:#F87171}`;

function inject(){
  if(q("#sf_panel")) return;
  const st=document.createElement("style");st.textContent=STYLE;document.head.appendChild(st);
  const w=document.createElement("div");
  w.id="sf_panel";
  w.innerHTML=`
  <div id="sf_head"><div class="title">Shopee Farm Helper</div><button id="sf_close">×</button></div>
  <div id="sf_btns">
    <button class="sf_btn" id="sf_status">Status</button>
    <button class="sf_btn" id="sf_bag">Bag</button>
    <button class="sf_btn" id="sf_shop">Shop</button>
    <button class="sf_btn" id="sf_harvest">Thu hoạch</button>
    <button class="sf_btn" id="sf_autowater">AutoWater</button>
    <button class="sf_btn" id="sf_autofarm">AutoFarm</button>
  </div>
  <div id="sf_body">
    <div class="sf_small" id="sf_hint"></div>
    <div id="sf_log"></div>
    <div id="sf_lists"></div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="sf_btn" id="sf_clear" style="flex:1;">Clear log</button>
      <button class="sf_btn" id="sf_stop" style="flex:1;">Dừng tác vụ</button>
    </div>
  </div>`;
  document.body.appendChild(w);
  q("#sf_close").onclick=()=>w.remove();
  q("#sf_clear").onclick=()=>{q("#sf_log").innerHTML="";q("#sf_lists").innerHTML="";};
  q("#sf_stop").onclick=stop;
  makeDraggable(w,q("#sf_head"));
  bind();
}

function makeDraggable(panel,handle){
  let offsetX=0,offsetY=0,isDown=false;
  handle.addEventListener("mousedown",e=>{
    isDown=true;
    offsetX=e.clientX-panel.offsetLeft;
    offsetY=e.clientY-panel.offsetTop;
    document.body.style.userSelect="none";
  });
  document.addEventListener("mouseup",()=>{isDown=false;document.body.style.userSelect="";});
  document.addEventListener("mousemove",e=>{
    if(!isDown)return;
    panel.style.left=(e.clientX-offsetX)+"px";
    panel.style.top=(e.clientY-offsetY)+"px";
    panel.style.right="auto";
  });
}

/* ===================== Logic ===================== */
async function ensureGameOpen(){
  if(location.href.startsWith(REQUIRED_URL)){
    if(!hasShownFirstMessage){
      log("📌 Bookmarklet sẵn sàng — đang dùng cookie trình duyệt.");
      hasShownFirstMessage=true;
    }
    return true;
  }else{
    const w=window.open(REQUIRED_URL,"_blank");
    if(!w){
      alert(`⚠️ Bạn phải ở trang ${REQUIRED_URL} mới chạy script này!`);
      return false;
    }
    try{w.focus();}catch{}
    log(`⚡ Đã mở tab ${REQUIRED_URL}. Vui lòng chạy lại bookmarklet trên tab đó.`);
    return false;
  }
}

async function callApi(endpoint,method="GET",payload=null){
  const opts={method,credentials:"include",headers:{}};
  if(method!=="GET"&&payload!=null){
    opts.headers["content-type"]="application/json;charset=UTF-8";
    opts.body=JSON.stringify(payload);
  }
  try{
    const r=await fetch(API_BASE+endpoint,opts);
    if(!r.ok)return{error:"HTTP "+r.status,raw:await r.text()};
    try{return await r.json()}catch(e){return{error:"JSON parse error",raw:await r.text()}}
  }catch(e){return{error:e.message}}
}

function levelInfo(crop){
  const st=(crop?.state??-1),expNow=(crop?.exp??0);
  const lc=crop?.meta?.config?.levelConfig||{};
  const lv=Object.entries(lc).filter(([k])=>!isNaN(k)&&parseInt(k)<100)
    .map(([k,v])=>[parseInt(k),v.exp]).sort((a,b)=>a[0]-b[0]);
  const before=lv.filter(([l])=>l<st).reduce((s,[_ ,e])=>s+e,0);
  const tot=before+expNow;
  const max=lv.reduce((s,[_ ,e])=>s+e,0);
  const need=(lv.find(([l])=>l===st)||[0,0])[1];
  return {st,expNow,before,tot,max,need};
}

/* ===================== Functions ===================== */
async function renderStatus(){const ctx=await callApi("/orchard/context/get?skipGuidance=1&pre=1");if(ctx?.error)return log("Lỗi status:",ctx.error);const crop=ctx?.data?.crops?.[0];if(!crop)return log("Không tìm thấy cây.");const user=ctx?.data?.user;const info=levelInfo(crop);log(`[STATUS]\nUser: ${user?.name||"?"}\nCây: ${crop?.meta?.name}\nLevel: ${info.st}\nEXP: ${info.expNow}/${info.need}\nTổng: ${info.tot}/${info.max}`);}
async function renderBag(){const res=await callApi("/prop/backpack/list");if(res?.error)return log("Lỗi bag:",res.error);const items=(res?.data?.props||[]).filter(p=>p.typeId===4&&p.parameter>0);if(!items.length){q("#sf_lists").innerHTML="<div class='sf_list'><div class='sf_row'><div class='meta'><div class='name'>Túi trống</div><div class='sub'>Không có bình nước</div></div></div></div>";return}const rows=items.map(p=>`<div class='sf_row'><div class='meta'><div class='name'>${p.name}</div><div class='sub'>${p.parameter} nước x${p.amount}</div></div><div class='acts'><button class='sf_btn' data-item='${p.itemId}'>Tưới</button></div></div>`).join("");q("#sf_lists").innerHTML=`<div class='sf_list'>${rows}</div>`;qAll(".sf_btn[data-item]").forEach(b=>b.onclick=()=>waterByItem(parseInt(b.getAttribute("data-item"))));}
async function renderShop(){const res=await callApi("/prop/list");if(res?.error)return log("Lỗi shop:",res.error);const coins=res?.data?.coins||0;const props=(res?.data?.props||[]).filter(p=>p.typeId===4);lastShopProps=props;let html=`<div class='sf_list'><div class='sf_row'><div class='meta'><div class='name'>Xu: ${coins}</div></div></div>`+props.map(p=>`<div class='sf_row'><div class='meta'><div class='name'>${p.name}</div><div class='sub'>${p.parameter} nước - ${p.price} xu [${p.buyNum}/${p.buyLimit}]</div></div><div class='acts'><button class='sf_btn' data-buy='${p.propMetaId}'>Mua</button></div></div>`).join("")+"</div>";q("#sf_lists").innerHTML=html;qAll(".sf_btn[data-buy]").forEach(b=>b.onclick=()=>buyProp(b.getAttribute("data-buy")));}
async function buyProp(id){const prop=lastShopProps.find(p=>p.propMetaId==id);const r=await callApi("/prop/buy/v2","POST",{propMetaId:parseInt(id)});if(r?.code===0){log(`✅ Đã mua: <span style="color:#FACC15;font-weight:bold;">${prop?.name||"Bình"} (${prop?.parameter||"?"} nước)</span> - ${prop?.price||"?"} xu`);await renderShop();}else log("❌ Mua lỗi:",r?.msg||JSON.stringify(r));}
async function waterByItem(id){const r=await callApi("/orchard/crop/use_bottled_water","POST",{cropId:0,propItemId:id});if(r?.code===0){log(`💧 Đã tưới nước.`);}else log("Tưới lỗi:",r?.msg||JSON.stringify(r));}
async function harvest(){const ctx=await callApi("/orchard/context/get?skipGuidance=1&pre=1");if(ctx?.error)return log("Lỗi harvest:",ctx.error);const crop=ctx?.data?.crops?.[0];if(!crop)return log("Không có cây.");const r=await callApi("/orchard/crop/harvest","POST",{cropId:crop.id,metaId:crop.metaId});if(r?.code===0){const items=(r?.data?.reward?.rewardItems||[]).map(it=>`${it?.itemExtraData?.luckyDrawAwardName||it?.meta?.name||"Vật"} x${it?.itemExtraData?.gameItemInfo?.gameItem?.quantity||1}`).join("\n");log(`<span style="color:#4ADE80;font-weight:bold;">✅ Thu hoạch thành công:</span>\n<span style="color:#FACC15;font-weight:bold;">${items}</span>`);}else log("Thu hoạch lỗi:",r?.msg||JSON.stringify(r));}

/* ===================== AutoWater & AutoFarm ===================== */
async function tryWater(item){const r=await callApi("/orchard/crop/use_bottled_water","POST",{cropId:0,propItemId:item.itemId});if(r?.code===0){log(`Tưới ${item.name} (${item.parameter})`);return true}else{log("Tưới lỗi:",r?.msg||JSON.stringify(r));return false}}
async function buyBest(need){const shop=await callApi("/prop/list");if(shop?.error)return false;const coins=shop?.data?.coins||0;let buyables=(shop?.data?.props||[]).filter(p=>p.typeId===4&&p.buyNum<p.buyLimit&&p.price<=coins);if(!buyables.length)return false;let best=null,minEx=1e9;for(const p of buyables){const ex=p.parameter-need;if(ex>=0&&ex<minEx){best=p;minEx=ex}}if(!best)best=buyables.sort((a,b)=>a.parameter-b.parameter)[0];const r=await callApi("/prop/buy/v2","POST",{propMetaId:best.propMetaId});if(r?.code===0){log(`✅ Đã mua tự động: ${best.name} (${best.parameter} nước) - ${best.price} xu`);const bag=await callApi("/prop/backpack/list");const match=(bag?.data?.props||[]).find(i=>i.typeId===4&&i.parameter===best.parameter);if(match)return await tryWater(match);return true}else{log("Mua lỗi:",r?.msg||JSON.stringify(r));return false}}
async function autowater(isSubTask=false){if(state.running&&!isSubTask)return log("Tác vụ khác đang chạy.");if(!isSubTask){state.running=true;state.what="autowater";}log("=== Bắt đầu AutoWater ===");try{let round=0;while(state.running){const ctx=await callApi("/orchard/context/get?skipGuidance=1&pre=1");const crop=ctx?.data?.crops?.[0];if(!crop)break;const info=levelInfo(crop);if(info.tot>=info.max){log("Đã max EXP.");break}const need=info.max-info.tot;log(`Lượt ${++round}: cần ${need}`);const bag=await callApi("/prop/backpack/list");const waters=(bag?.data?.props||[]).filter(p=>p.typeId===4&&p.parameter>0&&p.amount>0);if(!waters.length){if(!await buyBest(need)){log("Không còn bình.");break}else continue}waters.sort((a,b)=>a.parameter-b.parameter);let best=null,minEx=1e9;for(const w of waters){const ex=w.parameter-need;if(ex>=0&&ex<minEx){best=w;minEx=ex}}if(!best)best=waters[0];if(best.parameter-need>50&&await buyBest(need))continue;if(!await tryWater(best))break;await sleep(800)}}finally{if(!isSubTask){state.running=false;state.what=null;log("=== Kết thúc AutoWater ===")}}}
async function autofarm(){if(state.running)return log("Tác vụ khác đang chạy.");state.running=true;state.what="autofarm";log("=== Bắt đầu AutoFarm ===");try{const ctx=await callApi("/orchard/context/get?skipGuidance=1&pre=1");const crop=ctx?.data?.crops?.[0];if(crop&&(crop.state===4||crop.state===100||crop.harvestTime>0)){log("Cây đã chín → Thu hoạch.");await harvest();return}await autowater(true);if(!state.running)return;const ctx2=await callApi("/orchard/context/get?skipGuidance=1&pre=1");const c2=ctx2?.data?.crops?.[0];if(c2&&(c2.state===4||c2.state===100||c2.harvestTime>0)){log("Cây đã chín → Thu hoạch.");await harvest();}else log("Kết thúc AutoFarm, cây chưa chín.");}finally{state.running=false;state.what=null;log("=== Hoàn tất AutoFarm ===");}}

/* ===================== Others ===================== */
function stop(){if(state.running){state.running=false;log("🛑 Đã đặt lệnh dừng — sẽ dừng sau bước hiện tại");}else log("Không có tác vụ nào đang chạy")}
function bind(){q("#sf_status").onclick=async()=>{if(await ensureGameOpen())renderStatus()};q("#sf_bag").onclick=async()=>{if(await ensureGameOpen())renderBag()};q("#sf_shop").onclick=async()=>{if(await ensureGameOpen())renderShop()};q("#sf_harvest").onclick=async()=>{if(await ensureGameOpen())harvest()};q("#sf_autowater").onclick=async()=>{if(await ensureGameOpen())autowater()};q("#sf_autofarm").onclick=async()=>{if(await ensureGameOpen())autofarm()}}

(async()=>{inject();if(!location.href.startsWith(REQUIRED_URL))await ensureGameOpen();})();
})();
