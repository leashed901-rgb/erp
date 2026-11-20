/* ================= Create actions: one form engine for every document ================= */
const FM = { kind:null, d:{}, lines:[], charges:[], edit:null };
const KIND_META = {
  'Sales Quote':   { party:'Customer', price:true,  charges:'Sales',     primary:'Save & send',     go:'send',     hint:'Prices come from each product\u2019s Customer Pricing column.' },
  'Sales Order':   { party:'Customer', price:true,  charges:'Sales',     primary:'Save & allocate', go:'allocate', hint:'Allocating reserves stock and plans picks by bin.' },
  'Purchase Order':{ party:'Supplier', cost:true,   charges:'Purchases', primary:'Save & send',     go:'send',     hint:'Costs come from each product\u2019s Purchase Cost column.' },
  'Supplier Return':{ party:'Supplier', cost:true,  charges:null,        primary:'Save & ship',     go:'ship',     hint:'Shipping the return takes the units out of the bin you pick.' },
  'Assembly':      { single:'bom', primary:'Save & start', go:'start', hint:'Completing consumes components from the Bill of Materials and adds the finished goods.' },
  'Disassembly':   { single:'bom', primary:'Save & complete', go:'complete', hint:'Breaks finished goods or kits back into components.' },
  'Transfer':      { single:'any', primary:'Save & dispatch', go:'dispatch', hint:'Moves stock between shelves, buildings or your 3PL.' },
  'Stock Take':    { take:true, primary:'Start count', go:null, hint:'Freezes the system quantities for the shelves you pick. Enter counts, then post the variance.' }
};
const stockedProducts = () => PRODUCTS.filter(p=>isStocked(p) || isBundle(p));
const sellable = () => PRODUCTS.filter(p=>p.status!=='Internal');
const shelfOpts = (sel, only) => allShelves().filter(s=>!only || only.includes(s.id)).map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${s.id} · ${esc(s.w.name.split(' ·')[0])}</option>`).join('');
const optList = (arr, sel) => arr.map(([v,t])=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(t)}</option>`).join('');

function docForm(kind, preset={}, editId){
  const M = KIND_META[kind]; const ed = editId ? docById(editId) : null;
  FM.kind = kind; FM.edit = editId || null;
  if(ed){ FM.d = { party:ed.party, sup:ed.sup, channel:ed.channel, wh:ed.wh, eta:ed.eta, expires:ed.expires, due:ed.due, loc:ed.loc, from:ed.from, to:ed.to, ref:ed.ref, reason:ed.reason, comments:ed.comments, aisles:ed.aisles||[] }; FM.lines = ed.lines.map(l=>({...l})); FM.charges = (ed.charges||[]).map(c=>({...c})); }
  else {
    const c0 = CUSTOMERS[0];
    FM.d = Object.assign({ party: M.party==='Customer' ? c0.name : M.party==='Supplier' ? mfr(preset.sup||'cotton').name : '', sup:preset.sup||'cotton', channel:c0.channel, wh:'CDC', eta:'', expires:iso(new Date(TODAY.getTime()+14*864e5)), due:iso(new Date(TODAY.getTime()+5*864e5)), comments:'', aisles:['A'] }, preset);
    FM.lines = (preset.lines || []).map(l=>({...l}));
    FM.charges = (preset.charges || []).map(c=>({...c}));
    if(M.single && !FM.lines.length){ const p = preset.pid ? prod(preset.pid) : (M.single==='bom' ? PRODUCTS.find(x=>x.bom && (kind==='Disassembly' ? x.bom.type!=='Bundle' && onHand(x)>0 : x.bom.type!=='Bundle')) : PRODUCTS.find(isStocked)); FM.lines = [{ pid:p.id, qty:preset.qty||1 }]; }
    if(kind==='Assembly' || kind==='Disassembly'){ const p = prod(FM.lines[0].pid); FM.d.loc = FM.d.loc || p.locs[0]?.s || bestBin(p,'CDC'); }
    if(kind==='Transfer'){ const p = prod(FM.lines[0].pid); FM.d.from = FM.d.from || p.locs[0]?.s || 'A-01'; FM.d.to = FM.d.to || allShelves().find(s=>s.id!==FM.d.from && s.w.id==='TUP')?.id; }
    if(!M.single && !M.take && !FM.lines.length) fmAddLine();
  }
  if(M.party==='Customer' && !FM.edit) FM.lines.forEach(l=>{ if(l.price==null) l.price = priceFor(prod(l.pid), FM.d.party, l.qty).price; });
  if(M.cost) FM.lines.forEach(l=>{ if(l.cost==null) l.cost = prod(l.pid).cost; });
  openDrawer(`<div class="dh"><div class="li-ic">${ic(TX_ICON[kind])}</div><div><div class="dh-t">${ed?'Edit '+ed.no:'New '+kind}</div><div class="dh-s">${M.hint} Saves as a row in Stock Updates.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db" id="fmBody"></div>
    <div class="df"><button class="btn" data-cmd="close-drawer">Cancel</button><span class="sp"></span>${M.take?'':`<button class="btn" data-cmd="fm-save" data-go="">Save draft</button>`}<button class="btn primary" data-cmd="fm-save" data-go="${M.go||''}">${M.primary}</button></div>`);
  $('#drawer').dataset.doc = '';
  fmRender();
}
function fmAddLine(pid){
  const M = KIND_META[FM.kind];
  let pool = M.party==='Customer' ? sellable() : M.party==='Supplier' ? PRODUCTS.filter(p=>p.mfr===FM.d.sup && isStocked(p)) : stockedProducts();
  if(!pool.length) pool = PRODUCTS.filter(isStocked);
  const p = pid ? prod(pid) : pool.find(x=>!FM.lines.some(l=>l.pid===x.id)) || pool[0];
  const l = { pid:p.id, qty:1 };
  if(M.price) l.price = priceFor(p, FM.d.party, 1).price;
  if(M.cost) l.cost = p.cost;
  if(FM.kind==='Supplier Return') l.loc = p.locs[0]?.s || '';
  FM.lines.push(l);
}
function fmProductPool(){
  const M = KIND_META[FM.kind];
  if(M.party==='Customer') return sellable();
  if(M.party==='Supplier') return PRODUCTS.filter(isStocked).sort((a,b)=>(b.mfr===FM.d.sup)-(a.mfr===FM.d.sup));
  if(M.single==='bom') return PRODUCTS.filter(p=>p.bom && p.bom.type!=='Bundle');
  return PRODUCTS.filter(isStocked);
}
function fmLineTotal(l){ return l.qty*(KIND_META[FM.kind].price ? (l.price||0) : (l.cost||0)); }
function fmTotals(){ const tmp = { lines:FM.lines, charges:FM.charges }; return { sub:lineSub(tmp), ch:chargesTotal(tmp), tot:docTotal(tmp), chg:FM.charges.map(c=>chargeAmt(tmp,c)) }; }
function fmTotHTML(){ const t = fmTotals(); return `<div class="tot-row"><span>Lines</span><b class="num">${money(t.sub)}</b></div>${FM.charges.length?`<div class="tot-row"><span>Freight & charges</span><b class="num">${money(t.ch)}</b></div>`:''}<div class="tot-row grand"><span>Total</span><b class="num">${money(t.tot)}</b></div>`; }
function bomNeedHTML(p, qty, dir){
  if(!p.bom) return '';
  return `<table class="t mini"><thead><tr><th>Component</th><th class="r">Per unit</th><th class="r">${dir<0?'Returns':'Needs'}</th><th class="r">On hand</th><th class="r">Available</th></tr></thead><tbody>${p.bom.comps.map(c=>{ const cp = prod(c.pid), need = c.qty*qty, av = availableQty(cp); return `<tr><td><button class="link" data-cmd="open-product" data-id="${cp.id}">${esc(cp.name)}</button><div class="muted mono" style="font-size:11.5px">${cp.sku}</div></td><td class="r num">${c.qty}</td><td class="r num">${num(need)}</td><td class="r num">${num(onHand(cp))}</td><td class="r num ${dir>0 && onHand(cp)<need?'var-neg':''}">${num(av)}</td></tr>`; }).join('')}</tbody></table>
  <div class="muted" style="font-size:12px;margin-top:6px">Unit cost from BOM ${money(bomCost(p))} (components + ${money(p.bom.labor)} labor)${dir>0 && p.bom.comps.some(c=>onHand(prod(c.pid))<c.qty*qty) ? ` · <span class="var-neg">short on components</span> <button class="btn xs" data-cmd="fm-short-po">${ic('shopping_cart')}Draft PO for shortfall</button>`:''}</div>`;
}
function fmRender(){
  const k = FM.kind, M = KIND_META[k], d = FM.d; const el = $('#fmBody'); if(!el) return;
  let head = '';
  if(M.party==='Customer'){ const c = CUSTOMERS.find(x=>x.name===d.party);
    head = `<div class="fld"><label>Customer</label><select class="inp" data-ff="party">${optList(CUSTOMERS.map(c=>[c.name, c.name+' · '+c.tier]), d.party)}</select></div>
      <div class="fld"><label>Distribution Channel</label><select class="inp" data-ff="channel">${optList(CHANNELS_ALL.map(x=>[x,x]), d.channel)}</select></div>
      ${k==='Sales Quote' ? `<div class="fld"><label>Valid until</label><input class="inp" type="date" data-ff="expires" value="${d.expires||''}"/></div>` : `<div class="fld"><label>Ship from</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div>`}
      <div class="fld"><label>Terms</label><input class="inp" readonly value="${esc(c?c.terms+' · '+c.tier+' pricing':'—')}"/></div>`; }
  else if(M.party==='Supplier'){ const m = mfr(d.sup);
    head = `<div class="fld"><label>Supplier</label><select class="inp" data-ff="sup">${optList(MANUFACTURERS.map(m=>[m.id,m.name]), d.sup)}</select></div>
      ${k==='Purchase Order' ? `<div class="fld"><label>Deliver to</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div><div class="fld"><label>Expected</label><input class="inp" type="date" data-ff="eta" value="${d.eta||iso(new Date(TODAY.getTime()+m.lead*864e5))}"/></div>` : `<div class="fld"><label>Against PO</label><select class="inp" data-ff="ref">${optList([['','—'], ...docs('Purchase Order',['Received','Partially received']).filter(u=>u.sup===d.sup).map(u=>[u.no,u.no])], d.ref||'')}</select></div><div class="fld"><label>Reason</label><select class="inp" data-ff="reason">${optList(['Damaged','Stitching defect','Wrong item','Over-shipped','Quality'].map(x=>[x,x]), d.reason||'Damaged')}</select></div>`}
      <div class="fld"><label>Terms</label><input class="inp" readonly value="${esc(m.terms+' · '+m.lead+'-day lead · '+m.ontime+'% on time')}"/></div>`; }
  else if(M.single){ const l = FM.lines[0], p = prod(l.pid);
    head = `<div class="fld full"><label>${k==='Transfer'?'Product':'Finished product'}</label><select class="inp" data-lf="pid" data-li="0">${optList(fmProductPool().map(x=>[x.id, x.sku+' — '+x.name+(x.bom?' · '+x.bom.type:'')]), l.pid)}</select></div>
      <div class="fld"><label>Quantity</label><input class="inp num" type="number" min="1" data-lf="qty" data-li="0" value="${l.qty}"/></div>
      ${k==='Transfer' ? `<div class="fld"><label>Status after save</label><input class="inp" readonly value="Draft"/></div><div class="fld"><label>From shelf <span class="opt">· ${qtyAt(p,d.from)} there</span></label><select class="inp" data-ff="from">${shelfOpts(d.from, p.locs.map(x=>x.s))}</select></div><div class="fld"><label>To shelf</label><select class="inp" data-ff="to">${shelfOpts(d.to)}</select></div>`
        : `<div class="fld"><label>${k==='Assembly'?'Output shelf':'Take from shelf'}</label><select class="inp" data-ff="loc">${shelfOpts(d.loc, k==='Disassembly'?p.locs.map(x=>x.s):null)}</select></div>${k==='Assembly'?`<div class="fld"><label>Due</label><input class="inp" type="date" data-ff="due" value="${d.due||''}"/></div>`:''}`}`;
  }
  else if(M.take){ head = `<div class="fld"><label>Warehouse</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div>
      <div class="fld"><label>Aisles to count</label><div class="seg" style="flex-wrap:wrap">${WAREHOUSES.find(w=>w.id===d.wh).aisles.map(a=>`<button type="button" class="${d.aisles.includes(a)?'on':''}" data-cmd="fm-aisle" data-a="${a}">${a}</button>`).join('')}</div></div>`; }
  let body = '';
  if(M.single==='bom'){ const l = FM.lines[0]; body = `<div class="dsec"><div class="dsec-h"><h4>Bill of Materials</h4><button class="btn xs ghost" data-cmd="bom-edit" data-id="${l.pid}">${ic('edit')}Edit BOM</button></div>${bomNeedHTML(prod(l.pid), l.qty, k==='Assembly'?1:-1)}</div>`; }
  else if(M.take){ const bins = allShelves().filter(s=>s.w.id===d.wh && d.aisles.includes(s.a)); const n = bins.reduce((a,s)=>a+s.items.length,0); body = `<div class="dsec"><div class="muted">${bins.length} shelves · ${n} product positions will be frozen for counting.</div></div>`; }
  else if(!M.single){
    const pool = fmProductPool();
    body = `<div class="dsec"><div class="dsec-h"><h4>Lines</h4><button class="btn xs" data-cmd="fm-add-line">${ic('add')}Add line</button></div>
      <table class="t mini lines"><thead><tr><th>Product</th><th class="r" style="width:72px">Qty</th>${k==='Supplier Return'?'<th style="width:96px">From shelf</th>':''}<th class="r" style="width:96px">${M.price?'Unit price':'Unit cost'}</th><th class="r" style="width:90px">Line</th><th style="width:30px"></th></tr></thead>
      <tbody>${FM.lines.map((l,i)=>{ const p = prod(l.pid); const pf = M.price ? priceFor(p, d.party, l.qty) : null; const av = availableQty(p);
        return `<tr><td><select class="inp sm" data-lf="pid" data-li="${i}">${optList(pool.map(x=>[x.id, x.sku+' — '+x.name]), l.pid)}</select>
          <div class="muted" style="font-size:11.5px;margin-top:3px">${M.price ? `${esc(pf.why)}${isStocked(p)||isBundle(p)?` · ${av===Infinity?'':num(av)+' available'}`:` · ${FT_LABEL[p.ftype]}`}${isBundle(p)?' · bundle':''}` : `${num(onHand(p))} on hand · ${p.mfr===d.sup?'from this supplier':'<span class="var-neg">usually from '+esc(mfr(p.mfr).name)+'</span>'}`}</div></td>
          <td class="r"><input class="inp sm num r" type="number" min="1" data-lf="qty" data-li="${i}" value="${l.qty}"/></td>
          ${k==='Supplier Return'?`<td><select class="inp sm" data-lf="loc" data-li="${i}">${shelfOpts(l.loc, p.locs.map(x=>x.s))}</select></td>`:''}
          <td class="r"><input class="inp sm num r" type="number" step="0.01" min="0" data-lf="${M.price?'price':'cost'}" data-li="${i}" value="${M.price?l.price:l.cost}"/></td>
          <td class="r num" data-lt="${i}">${money(fmLineTotal(l))}</td>
          <td><button class="icon-btn sm" data-cmd="fm-rm-line" data-li="${i}" aria-label="Remove line">${ic('close')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
    if(M.charges) body += `<div class="dsec"><div class="dsec-h"><h4>Freight & charges</h4><button class="btn xs" data-cmd="fm-add-charge">${ic('add')}Add charge</button></div>
      ${FM.charges.length ? `<table class="t mini"><thead><tr><th>Charge</th><th style="width:110px">Basis</th><th class="r" style="width:90px">Rate</th><th class="r" style="width:90px">Amount</th><th style="width:30px"></th></tr></thead><tbody>${FM.charges.map((c,i)=>`<tr>
        <td><input class="inp sm" data-cf="name" data-ci="${i}" value="${esc(c.name)}"/></td>
        <td><select class="inp sm" data-cf="basis" data-ci="${i}">${optList([['flat','Flat'],['per unit','Per unit'],['per lb','Per lb'],['%','% of lines']], c.basis)}</select></td>
        <td class="r"><input class="inp sm num r" type="number" step="0.01" data-cf="rate" data-ci="${i}" value="${c.rate}"/></td>
        <td class="r num" data-ct="${i}">${money(fmTotals().chg[i])}</td>
        <td><button class="icon-btn sm" data-cmd="fm-rm-charge" data-ci="${i}" aria-label="Remove charge">${ic('close')}</button></td></tr>`).join('')}</tbody></table>` : `<div class="faint" style="font-size:12.5px">No charges. Add freight, handling, duty, fuel or a discount.</div>`}</div>`;
    body += `<div class="totals" id="fmTot">${fmTotHTML()}</div>`;
  }
  el.innerHTML = `<div class="fields" style="margin-bottom:20px">${head}</div>${body}<div class="fld" style="margin-top:16px"><label>Comments</label><textarea class="inp" rows="2" data-ff="comments">${esc(d.comments||'')}</textarea></div>`;
}
function fmField(t){
  const k = FM.kind, M = KIND_META[k];
  if(t.dataset.ff){ const f = t.dataset.ff; FM.d[f] = t.type==='number' ? +t.value : t.value;
    if(f==='party' && M.price){ const c = CUSTOMERS.find(x=>x.name===t.value); if(c) FM.d.channel = c.channel; FM.lines.forEach(l=>l.price = priceFor(prod(l.pid), FM.d.party, l.qty).price); }
    if(f==='sup'){ FM.d.party = mfr(t.value).name; }
    if(f==='wh' && M.take){ FM.d.aisles = [WAREHOUSES.find(w=>w.id===t.value).aisles[0]]; }
    return f!=='comments'; }
  if(t.dataset.lf){ const i = +t.dataset.li, f = t.dataset.lf, l = FM.lines[i];
    if(f==='pid'){ l.pid = t.value; const p = prod(t.value); if(M.price) l.price = priceFor(p, FM.d.party, l.qty).price; if(M.cost) l.cost = p.cost; if(k==='Supplier Return') l.loc = p.locs[0]?.s;
      if(k==='Transfer'){ FM.d.from = p.locs[0]?.s || FM.d.from; } if(k==='Assembly'||k==='Disassembly'){ FM.d.loc = p.locs[0]?.s || bestBin(p,'CDC'); } return true; }
    if(f==='loc'){ l.loc = t.value; return false; }
    l[f] = +t.value || 0;
    if(f==='qty' && M.price){ const np = priceFor(prod(l.pid), FM.d.party, l.qty).price; if(np!==l.price){ l.price = np; return 'soft'; } }
    if(M.single) return 'soft';
    return 'soft'; }
  if(t.dataset.cf){ const i = +t.dataset.ci, f = t.dataset.cf; FM.charges[i][f] = f==='rate' ? (+t.value||0) : t.value; return f==='basis' ? true : 'soft'; }
  return false;
}
function fmSoft(){
  FM.lines.forEach((l,i)=>{ const c = $(`[data-lt="${i}"]`); if(c) c.textContent = money(fmLineTotal(l)); const pi = $(`[data-lf="price"][data-li="${i}"]`); if(pi && document.activeElement!==pi && +pi.value!==l.price) pi.value = l.price; });
  const t = fmTotals(); t.chg.forEach((a,i)=>{ const c = $(`[data-ct="${i}"]`); if(c) c.textContent = money(a); });
  const tot = $('#fmTot'); if(tot) tot.innerHTML = fmTotHTML();
  if(KIND_META[FM.kind].single==='bom'){ const sec = $('#fmBody .dsec'); if(sec){ const l = FM.lines[0]; sec.innerHTML = `<div class="dsec-h"><h4>Bill of Materials</h4><button class="btn xs ghost" data-cmd="bom-edit" data-id="${l.pid}">${ic('edit')}Edit BOM</button></div>${bomNeedHTML(prod(l.pid), l.qty, FM.kind==='Assembly'?1:-1)}`; } }
}
document.addEventListener('input', e=>{ const t = e.target; if(!t.closest || !t.closest('#fmBody')) return; if(t.tagName==='SELECT') return; const r = fmField(t); if(r) fmSoft(); });
document.addEventListener('change', e=>{ const t = e.target; if(!t.closest || !t.closest('#fmBody')) return; if(t.tagName!=='SELECT') return; const r = fmField(t); if(r===true) fmRender(); else if(r) fmSoft(); });

function fmSave(goAct){
  const k = FM.kind, M = KIND_META[k], d = FM.d;
  if(!M.take && !FM.lines.length) return toast('Add at least one line');
  if(FM.lines.some(l=>!(l.qty>0))) return toast('Every line needs a quantity');
  let u;
  if(M.take){
    const bins = allShelves().filter(s=>s.w.id===d.wh && d.aisles.includes(s.a));
    if(!d.aisles.length) return toast('Pick at least one aisle');
    u = newDoc('Stock Take', { status:'Counting', wh:d.wh, aisles:[...d.aisles], comments:d.comments, lines:[] });
    bins.forEach(s=>s.items.forEach(x=>u.lines.push({ pid:x.p.id, loc:s.id, sys:x.q, qty:x.q, cnt:null })));
    u.loc = `${d.aisles.join(', ')} · ${WAREHOUSES.find(w=>w.id===d.wh).name}`;
  } else {
    const o = { party:d.party, sup:d.sup, channel:d.channel, wh:d.wh, eta:d.eta || (k==='Purchase Order'?iso(new Date(TODAY.getTime()+mfr(d.sup).lead*864e5)):''), expires:d.expires, due:d.due, loc:d.loc||'—', from:d.from, to:d.to, ref:d.ref, reason:d.reason, comments:d.comments, lines:FM.lines.map(l=>({...l})), charges:FM.charges.map(c=>({...c})) };
    if(M.single) o.party = '';
    if(k==='Purchase Order') o.lines.forEach(l=>{ l.rcv = l.rcv||0; });
    if(k==='Transfer'){ if(d.from===d.to) return toast('Pick two different shelves'); o.loc = `${d.from}→${d.to}`; }
    if(k==='Supplier Return') o.loc = [...new Set(o.lines.map(l=>l.loc))].join(', ');
    if(FM.edit){ u = docById(FM.edit); Object.assign(u, o); logDoc(u, 'Edited'); }
    else u = newDoc(k, Object.assign(o, { status: k==='Sales Order' ? 'Open' : k==='Assembly' ? 'Planned' : 'Draft' }));
  }
  setUnitCost(u); syncPO();
  if(goAct && actsFor(u).some(a=>a.a===goAct)){ runAct(u, goAct); if(!$('#modalWrap').classList.contains('open')) docDrawer(u.id); }
  else { toast(`${u.no} saved · ${u.status}`); render(); docDrawer(u.id); }
}
Object.assign(CMD, {
  'new-doc': el => { closeMenu(); closeModal(); closePalette && closePalette(); const pre = {}; if(el.dataset.id){ const p = prod(el.dataset.id); if(['Purchase Order','Supplier Return'].includes(el.dataset.k)) { pre.sup = p.mfr; pre.party = mfr(p.mfr).name; pre.lines = [{ pid:p.id, qty: el.dataset.k==='Purchase Order' ? (stitchPlan(p)?.qty || suggestQty(p)) : 1, cost:p.cost, loc:p.locs[0]?.s }]; } else if(['Sales Quote','Sales Order'].includes(el.dataset.k)) pre.lines = [{ pid:p.id, qty:1 }]; else { pre.pid = p.id; pre.qty = +el.dataset.q || (el.dataset.k==='Assembly' ? (stitchPlan(p)?.qty||p.rq||1) : 1); } }
    if(el.dataset.sup){ pre.sup = el.dataset.sup; pre.party = mfr(el.dataset.sup).name; }
    if(el.dataset.cust){ pre.party = el.dataset.cust; const c = CUSTOMERS.find(x=>x.name===el.dataset.cust); if(c) pre.channel = c.channel; }
    if(el.dataset.from){ pre.from = el.dataset.from; }
    if(el.dataset.wh){ pre.wh = el.dataset.wh; }
    docForm(el.dataset.k, pre); },
  'fm-save': el => fmSave(el.dataset.go),
  'fm-add-line': () => { fmAddLine(); fmRender(); },
  'fm-rm-line': el => { FM.lines.splice(+el.dataset.li, 1); fmRender(); },
  'fm-add-charge': el => { const side = KIND_META[FM.kind].charges; const pre = CHARGE_PRESETS.filter(c=>c.side===side||c.side==='Both');
    openMenu(el, `<div class="mh2">Freight & charges</div>${pre.map((c,i)=>`<button class="mi" data-cmd="fm-charge-pick" data-i="${CHARGE_PRESETS.indexOf(c)}">${ic(c.rate<0?'percent':'local_shipping')}${esc(c.name)}<span class="k">${c.basis==='%'?c.rate+'%':money(c.rate)+(c.basis==='flat'?'':' '+c.basis)}</span></button>`).join('')}<div class="msep"></div><button class="mi" data-cmd="fm-charge-pick" data-i="-1">${ic('add')}Custom charge</button>`); },
  'fm-charge-pick': el => { closeMenu(); const c = CHARGE_PRESETS[+el.dataset.i] || { name:'Custom charge', basis:'flat', rate:0 }; FM.charges.push({ name:c.name, basis:c.basis, rate:c.rate }); fmRender(); },
  'fm-rm-charge': el => { FM.charges.splice(+el.dataset.ci, 1); fmRender(); },
  'fm-aisle': el => { const a = el.dataset.a, s = FM.d.aisles; const i = s.indexOf(a); i<0 ? s.push(a) : s.splice(i,1); fmRender(); },
  'fm-short-po': () => { const l = FM.lines[0], p = prod(l.pid); const short = p.bom.comps.filter(c=>onHand(prod(c.pid)) < c.qty*l.qty).map(c=>({ p:prod(c.pid), q:c.qty*l.qty - onHand(prod(c.pid)) })); const made = draftCompPOs(short); toast(`Drafted ${made.join(', ')} for component shortfall`); fmRender(); }
});
function draftCompPOs(items){
  const by = {}; items.forEach(x=>{ (by[x.p.mfr] = by[x.p.mfr] || []).push(x); });
  const made = []; Object.entries(by).forEach(([m, xs])=>{ const u = newDoc('Purchase Order', { status:'Draft', party:mfr(m).name, sup:m, wh:'CDC', comments:'Drafted by Stitch', lines:xs.map(x=>({ pid:x.p.id, qty:Math.max(x.q, x.p.rq||0), cost:x.p.cost, rcv:0 })) }); setUnitCost(u); made.push(u.no); });
  syncPO(); return made;
}
