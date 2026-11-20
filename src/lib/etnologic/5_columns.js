/* ================= New columns on the existing four tables ================= */
const colIns = (key, beforeK, defs) => { const cs = TABLES[key].cols; const i = beforeK ? cs.findIndex(c=>c.k===beforeK) : -1; i<0 ? cs.push(...defs) : cs.splice(i, 0, ...defs); };
const faint = '<span class="faint">—</span>';
const sub = t => `<div class="muted" style="font-size:11.5px">${t}</div>`;
const FLAG_C = { Understock:'amber', Overstock:'blue', Healthy:'green' };

/* --- Product Catalog --- */
const qtyCol = TABLES.products.cols.find(c=>c.k==='qty');
const _qtyR = qtyCol.r; qtyCol.r = r => isBundle(r.p) ? `<span class="num">${num(bundleAvail(r.p))}</span>${sub('buildable from components')}` : _qtyR(r);
qtyCol.get = r => isBundle(r.p) ? bundleAvail(r.p) : onHand(r.p);
colIns('products', null, [
  {k:'supplier', t:'Supplier', type:'text', get:r=>mfr(r.p.mfr).name, r:r=>{ const m = mfr(r.p.mfr); return `<button class="link" data-cmd="open-supplier" data-id="${m.id}" style="white-space:nowrap">${esc(m.name)}</button>${sub(`${m.lead}-day lead · ${m.terms}`)}`; }},
  {k:'pcost', t:'Purchase Cost', type:'money', get:r=>r.p.cost, r:r=>`<button class="cc-cell" data-cmd="open-cost" data-id="${r.p.id}" title="Purchase cost and history">${money(r.p.cost)}</button>${r.p.bom&&r.p.bom.type!=='Bundle'?sub('BOM '+money(bomCost(r.p))):r.p.price?sub(Math.round((1-r.p.cost/r.p.price)*100)+'% margin'):''}`},
  {k:'cprice', t:'Customer Pricing', type:'text', get:r=>{ const pr = pricing(r.p); return TIERS.map(t=>t+' '+pr.tiers[t]).join(' / '); }, r:r=>{ if(r.p.status==='Internal') return faint; const pr = pricing(r.p); const ex = pr.breaks.length + pr.customers.length; return `<button class="cc-cell" data-cmd="open-pricing" data-id="${r.p.id}" title="Edit customer pricing"><span class="num">${money(pr.tiers.Wholesale)}</span> <span class="muted">wholesale</span></button>${sub(`${money(pr.tiers.Distributor)} distributor${ex?` · ${ex} rule${ex>1?'s':''}`:''}`)}`; }},
  {k:'bom', t:'Bill of Materials', type:'text', get:r=>r.p.bom ? r.p.bom.type+' · '+r.p.bom.comps.length : '', r:r=> r.p.bom ? `<button class="cc-cell" data-cmd="open-bom" data-id="${r.p.id}">${pill(r.p.bom.type, r.p.bom.type==='Bundle'?'blue':'ai', false)} <span class="muted">${r.p.bom.comps.length} part${r.p.bom.comps.length>1?'s':''}</span></button>${sub(r.p.bom.comps.map(c=>c.qty+'× '+prod(c.pid).sku).slice(0,2).join(', '))}` : (r.p.ftype==='In-House' || r.p.status==='Internal' ? `<button class="btn xs ghost" data-cmd="open-bom" data-id="${r.p.id}">${ic('add')}Add</button>` : faint)},
  {k:'track', t:'Tracking', type:'text', get:r=>r.p.track, r:r=>{ const t = r.p.track; if(!isStocked(r.p)) return faint; return `<button class="cc-cell" data-cmd="open-track" data-id="${r.p.id}">${t==='None'?'<span class="muted">None</span>':pill(t, 'gray', false)}</button>${t==='Serial'?sub(serialsIn(r.p).length+' serials in stock'):t==='Batch'?sub(lotsOf(r.p).map(b=>b.lot).slice(0,2).join(', ')||'no lots'):''}`; }}
]);

/* --- Inventory Management --- */
colIns('inventory', 'mfr', [
  {k:'alloc', t:'Allocated', type:'num', agg:'sum', get:r=>isStocked(r.p)?committedQty(r.p)+compDemand(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const a = committedQty(r.p), c = compDemand(r.p); return a+c ? `<button class="cc-cell num" data-cmd="open-alloc" data-id="${r.p.id}">${num(a+c)}</button>${sub([a?a+' orders':'', c?c+' production':''].filter(Boolean).join(' · '))}` : '<span class="muted">0</span>'; }},
  {k:'onorder', t:'On Order', type:'num', agg:'sum', get:r=>isStocked(r.p)?onOrderQty(r.p)+inProdQty(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const o = onOrderQty(r.p), m = inProdQty(r.p); return o+m ? `<span class="num">${num(o+m)}</span>${sub([o?o+' purchasing':'', m?m+' in production':''].filter(Boolean).join(' · '))}` : '<span class="muted">0</span>'; }},
  {k:'avail', t:'Available', type:'num', get:r=>isStocked(r.p)?availableQty(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const a = availableQty(r.p); return `<span class="num strong ${a<0?'var-neg':''}">${num(a)}</span>${backorderQty(r.p)?sub(`<span class="var-neg">${backorderQty(r.p)} backordered</span>`):''}`; }},
  {k:'fc30', t:'Forecast (30 days)', type:'num', get:r=>isStocked(r.p)?forecast30(r.p):null, r:r=> isStocked(r.p) ? `<span class="num">${num(forecast30(r.p))}</span>${sub(r.p.vel+'/day'+(r.p.labels.includes('Seasonal')?' · seasonal':''))}` : faint},
  {k:'stitch', t:'Stitch', type:'text', get:r=>stitchPlan(r.p)?.flag||'', r:r=>{ const s = stitchPlan(r.p); if(!s) return faint; return `<button class="cc-cell" data-cmd="open-plan" data-id="${r.p.id}" title="${esc(s.why)}">${pill(s.flag, FLAG_C[s.flag])}</button>${s.flag==='Understock'?sub(`${ic('auto_awesome')} ${s.make?'Make':'Buy'} ${num(s.qty)}`):s.flag==='Overstock'?sub(`${s.cover} days cover`):''}`; }}
]);
TABLES.inventory.bulk.push(['b-plan','auto_awesome','Plan with Stitch'],['b-so','shopping_bag','Sales order'],['b-take','inventory','Stock take']);
TABLES.inventory.primary = `<button class="btn ai-solid" data-cmd="stitch-plan">${ic('auto_awesome')}Plan with Stitch</button><button class="btn primary" data-cmd="new-stock-update">${ic('add')}Update Stock</button>`;
TABLES.inventory.bulkRun = { 'b-plan':ps=>stitchPlanModal(ps), 'b-so':ps=>docForm('Sales Order', { lines:ps.filter(p=>p.status!=='Internal').map(p=>({ pid:p.id, qty:1 })) }), 'b-take':ps=>{ const sh = [...new Set(ps.flatMap(p=>p.locs.map(l=>aisleOf(l.s))))]; docForm('Stock Take', { wh:'CDC', aisles:sh.filter(a=>WAREHOUSES[0].aisles.includes(a)) }); } };
TABLES.products.bulk.push(['b-quote','request_quote','Sales quote'],['b-po2','shopping_cart','Purchase order']);
TABLES.products.bulkRun = { 'b-quote':ps=>docForm('Sales Quote', { lines:ps.filter(p=>p.status!=='Internal').map(p=>({ pid:p.id, qty:1 })) }), 'b-po2':ps=>{ const st = ps.filter(isStocked); if(!st.length) return toast('Pick stocked products'); docForm('Purchase Order', { sup:st[0].mfr, party:mfr(st[0].mfr).name, lines:st.map(p=>({ pid:p.id, qty:Math.max(p.rq||1, stitchPlan(p)?.qty||0), cost:p.cost })) }); } };

/* --- Stock Updates --- */
const actCol = TABLES.updates.cols.find(c=>c.k==='activity');
actCol.get = r => isDoc(r.u) ? `${r.u.kind} ${r.u.no}` : r.u.type;
actCol.r = r => { const u = r.u; if(!isDoc(u)) return `<span class="act">${ic(TX_ICON[u.type])}${u.type}</span><div class="muted mono" style="font-size:11.5px">${esc(r.p.sku)} · ${u.loc}</div>`;
  return `<span class="act">${ic(TX_ICON[u.kind])}${u.kind}</span><div class="muted" style="font-size:11.5px"><span class="mono">${u.no}</span>${u.party?' · '+esc(u.party):''}${u.lines.length>1?` · ${u.lines.length} lines`:u.lines[0]?' · <span class="mono">'+esc(prod(u.lines[0].pid).sku)+'</span>':''}</div>`; };
const qCol = TABLES.updates.cols.find(c=>c.k==='qty'); const _qR = qCol.r; qCol.r = r => isDoc(r.u) && !r.u.qty && r.u.lines.length ? `<span class="muted">${r.u.lines.reduce((a,l)=>a+l.qty,0)} ordered</span>` : _qR(r);
const newCol = TABLES.updates.cols.find(c=>c.k==='new'); newCol.get = r => ['Receive','Produce'].includes(r.u.type) || (['Purchase Order','Assembly'].includes(r.u.kind) && r.u.qty>0) ? r.u.qty : null; newCol.r = r => newCol.get(r)!=null ? '+'+newCol.get(r) : faint;
colIns('updates', 'auto', [
  {k:'status', t:'Status', type:'text', get:r=>r.u.status, r:r=> isDoc(r.u) ? `<button class="cc-cell" data-cmd="status-menu" data-id="${r.u.id}">${pill(r.u.status, STATUS_C[r.u.status]||'gray')}${actsFor(r.u).length?ic('expand_more','caret'):''}</button>` : `<span class="muted">Logged</span>`},
  {k:'party', t:'Customer / Supplier', type:'text', get:r=>r.u.party||'', r:r=> r.u.party ? (r.u.sup ? `<button class="link" data-cmd="open-supplier" data-id="${r.u.sup}" style="white-space:nowrap">${esc(r.u.party)}</button>` : `<span style="white-space:nowrap">${esc(r.u.party)}</span>`) + (r.u.channel?sub(esc(r.u.channel)):'') : faint},
  {k:'total', t:'Value', type:'money', agg:'sum', get:r=>isDoc(r.u) && r.u.lines.length ? +docTotal(r.u).toFixed(2) : +(r.u.qty*r.u.unitCost).toFixed(2), r:r=>{ const v = isDoc(r.u)&&r.u.lines.length ? docTotal(r.u) : r.u.qty*r.u.unitCost; return money(v); }}
]);
colIns('updates', 'comments', [
  {k:'lots', t:'Batch / Lot', type:'text', get:r=>r.u.lots||'', r:r=> r.u.lots ? `<span class="mono muted" style="font-size:12px">${esc(r.u.lots)}</span>` : faint}
]);
TABLES.updates.primary = `<button class="btn" data-cmd="create-menu">${ic('add')}Create</button><button class="btn primary" data-cmd="new-stock-update">${ic('add')}New Stock Update</button>`;
TABLES.updates.bulk.unshift(['b-advance','fast_forward','Advance status']);
TABLES.updates.bulkRun = { 'b-advance':(ps, rows)=>{ let n = 0; rows.forEach(r=>{ const a = actsFor(r.u).find(x=>!x.ghost && !['receive','pack','dispatch','recost','rtv','convert'].includes(x.a)); if(a){ runAct(r.u, a.a); n++; } }); toast(`${n} document${n===1?'':'s'} advanced`); } };

/* --- Warehouse Management: pick, pack, dispatch --- */
const pickTasks = shelf => docs('Sales Order', ['Allocated','Picking']).flatMap(u=>u.lines.flatMap((l,li)=>(l.picks||[]).map((k,ki)=>({ u, l, li, k, ki })))).filter(x=>!x.k.done && (!shelf || x.k.s===shelf));
const packQ = wh => docs('Sales Order', ['Picked']).filter(u=>!wh || u.wh===wh);
const dispQ = wh => docs('Sales Order', ['Packed']).filter(u=>!wh || u.wh===wh);
colIns('warehouse', 'ship', [
  {k:'pick', t:'Pick', type:'num', agg:'sum', get:r=>pickTasks(r.s.id).length, r:r=>{ const t = pickTasks(r.s.id); return t.length ? `<button class="btn xs" data-cmd="pick-q" data-id="${r.s.id}">${ic('pan_tool_alt')}${t.length} to pick</button>${sub(t.reduce((a,x)=>a+x.k.q,0)+' units')}` : '<span class="muted">0</span>'; }},
  {k:'pack', t:'Pack', type:'num', get:r=>packQ(r.s.w.id).length, r:r=>{ const n = packQ(r.s.w.id).length; return n ? `<button class="btn xs" data-cmd="pack-q" data-id="${r.s.w.id}">${ic('package_2')}${n} to pack</button>` : '<span class="muted">0</span>'; }},
  {k:'dispatch', t:'Dispatch', type:'num', get:r=>dispQ(r.s.w.id).length, r:r=>{ const n = dispQ(r.s.w.id).length; return n ? `<button class="btn xs" data-cmd="disp-q" data-id="${r.s.w.id}">${ic('local_shipping')}${n} to dispatch</button>` : '<span class="muted">0</span>'; }}
]);
TABLES.warehouse.bulk.push(['b-pick','pan_tool_alt','Pick list'],['b-take','inventory','Stock take']);
TABLES.warehouse.bulkRun = { 'b-pick':(ps, rows)=>pickQueue(rows.map(r=>r.s.id)), 'b-take':(ps, rows)=>{ const s0 = rows[0].s; docForm('Stock Take', { wh:s0.w.id, aisles:[...new Set(rows.filter(r=>r.s.w.id===s0.w.id).map(r=>r.s.a))] }); } };
function pickQueue(shelves){
  const list = shelves ? shelves.flatMap(s=>pickTasks(s)) : pickTasks();
  openModal(`<div class="mh">${ic('pan_tool_alt')}<div class="t">Pick list${shelves&&shelves.length===1?' · '+shelves[0]:''}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb">${list.length ? `<table class="t mini"><thead><tr><th>Shelf</th><th>Product</th><th>Order</th><th class="r">Qty</th><th></th></tr></thead><tbody>${list.sort((a,b)=>a.k.s<b.k.s?-1:1).map(x=>{ const p = prod(x.k.pid); return `<tr><td class="mono strong">${x.k.s}</td><td>${esc(p.name)}<div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td><button class="link mono" data-cmd="open-doc" data-id="${x.u.id}">${x.u.no}</button>${sub(esc(x.u.party))}</td><td class="r num">${x.k.q}</td><td class="r"><button class="btn xs" data-cmd="pick-one" data-id="${x.u.id}" data-li="${x.li}" data-ki="${x.ki}" data-sh="${shelves?shelves.join(','):''}">${ic('check')}Picked</button></td></tr>`; }).join('')}</tbody></table>` : `<div class="empty" style="padding:24px">${ic('task_alt')}Nothing to pick here.</div>`}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button>${list.length?`<button class="btn primary" data-cmd="pick-all" data-sh="${shelves?shelves.join(','):''}">${ic('done_all')}Confirm all ${list.length}</button>`:''}</div>`, true);
}
function confirmPick(u, li, ki){ const k = u.lines[li].picks[ki]; k.done = true; if(u.status==='Allocated'){ u.status='Picking'; logDoc(u, 'Picking started'); }
  logDoc(u, `Picked ${k.q} × ${prod(k.pid).sku} from ${k.s}`);
  if(u.lines.every(l=>(l.picks||[]).every(z=>z.done))){ u.status = 'Picked'; logDoc(u, 'All lines picked — ready to pack'); } }
function docQueue(title, icon, list, act){
  openModal(`<div class="mh">${ic(icon)}<div class="t">${title}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb">${list.length ? `<div class="list">${list.map(u=>`<div class="li"><div class="li-main"><div class="li-t"><button class="link mono" data-cmd="open-doc" data-id="${u.id}">${u.no}</button> · ${esc(u.party)}</div><div class="li-s">${u.lines.map(l=>l.qty+'× '+prod(l.pid).sku).join(', ')}${u.box?` · ${u.cartons||1}× ${u.box} · ${u.weight} lb`:''}</div></div><div class="li-r"><button class="btn sm primary" data-cmd="doc-act" data-id="${u.id}" data-a="${act}">${ic(icon)}${act==='pack'?'Pack':'Dispatch'}</button></div></div>`).join('')}</div>` : `<div class="empty" style="padding:24px">${ic('task_alt')}Queue is clear.</div>`}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button></div>`, true);
}
Object.assign(CMD, {
  'pick-q': el => pickQueue([el.dataset.id]),
  'pick-one': el => { const u = docById(el.dataset.id); confirmPick(u, +el.dataset.li, +el.dataset.ki); toast(`${u.no} · pick confirmed${u.status==='Picked'?' · ready to pack':''}`); render(); pickQueue(el.dataset.sh ? el.dataset.sh.split(',') : null); },
  'pick-all': el => { const sh = el.dataset.sh ? el.dataset.sh.split(',') : null; const list = sh ? sh.flatMap(s=>pickTasks(s)) : pickTasks(); list.forEach(x=>confirmPick(x.u, x.li, x.ki)); toast(`${list.length} picks confirmed`); closeModal(); render(); },
  'pack-q': el => docQueue(`Pack · ${WAREHOUSES.find(w=>w.id===el.dataset.id).name}`, 'package_2', packQ(el.dataset.id), 'pack'),
  'disp-q': el => docQueue(`Dispatch · ${WAREHOUSES.find(w=>w.id===el.dataset.id).name}`, 'local_shipping', dispQ(el.dataset.id), 'dispatch'),
  'status-menu': el => { const u = docById(el.dataset.id); const a = actsFor(u); if(!a.length) return docDrawer(u.id);
    openMenu(el, `<div class="mh2">${u.no} · ${u.status}</div>${a.map(x=>`<button class="mi" data-cmd="doc-act" data-id="${u.id}" data-a="${x.a}">${ic(x.i)}${x.t}${x.to?`<span class="k">→ ${x.to}</span>`:''}</button>`).join('')}<div class="msep"></div><button class="mi" data-cmd="open-doc" data-id="${u.id}">${ic('open_in_new')}Open</button>`); },
  'open-alloc': el => { const p = prod(el.dataset.id); const so = docs('Sales Order', ALLOC_STS).filter(u=>u.lines.flatMap(stockLines).some(x=>x.pid===p.id)); const asm = docs('Assembly',['Planned','In progress']).filter(u=>prod(u.lines[0].pid).bom?.comps.some(c=>c.pid===p.id));
    openModal(`<div class="mh">${ic('inventory_2')}<div class="t">Allocated · ${esc(p.sku)}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div><div class="mb"><div class="list">${[...so, ...asm].map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-ic">${ic(TX_ICON[u.kind])}</div><div class="li-main"><div class="li-t">${u.no} · ${esc(u.party||prod(u.lines[0].pid).name)}</div><div class="li-s">${u.kind} · ${u.status}</div></div></button>`).join('')}</div></div>`); }
});

/* --- Side panels opened from the columns --- */
function openSupplier(id){
  const m = mfr(id); const ps = PRODUCTS.filter(p=>p.mfr===id); const pos = docs('Purchase Order').filter(u=>u.sup===id);
  const spend = pos.filter(u=>!['Draft','Cancelled'].includes(u.status)).reduce((a,u)=>a+docTotal(u),0);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('factory')}</div><div><div class="dh-t">${esc(m.name)}</div><div class="dh-s">${m.type||'Supplier'} · ${esc(m.contact||'')}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="kv" style="margin-bottom:20px"><div><div class="k">Lead time</div><div class="v">${m.lead} days</div></div><div><div class="k">Terms</div><div class="v">${esc(m.terms)}</div></div><div><div class="k">On time</div><div class="v">${m.ontime}%</div></div><div><div class="k">Email</div><div class="v" style="font-size:12.5px">${esc(m.email)}</div></div><div><div class="k">Phone</div><div class="v">${esc(m.phone||'—')}</div></div><div><div class="k">Spend (open + received)</div><div class="v">${money(spend,0)}</div></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Products (${ps.length})</h4></div><table class="t mini"><thead><tr><th>Product</th><th class="r">On hand</th><th class="r">Purchase cost</th><th>Stitch</th></tr></thead><tbody>${ps.map(p=>{ const s = stitchPlan(p); return `<tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button>${sub(`<span class="mono">${p.sku}</span>`)}</td><td class="r num">${isStocked(p)?num(onHand(p)):'—'}</td><td class="r num">${money(p.cost)}</td><td>${s?pill(s.flag, FLAG_C[s.flag], false):faint}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="dsec"><div class="dsec-h"><h4>Purchase orders</h4></div>${pos.length?`<div class="list">${pos.map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-main"><div class="li-t mono">${u.no}</div><div class="li-s">${fmtD(u.date)} · ${u.lines.length} line${u.lines.length>1?'s':''} · ${money(docTotal(u))}</div></div><div class="li-r">${pill(u.status, STATUS_C[u.status], false)}</div></button>`).join('')}</div>`:'<span class="faint">None yet</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Supplier Return" data-sup="${id}">${ic('keyboard_return')}Return to supplier</button><span class="sp"></span><button class="btn primary" data-cmd="new-doc" data-k="Purchase Order" data-sup="${id}">${ic('shopping_cart')}Create PO</button></div>`);
}
function costPanel(id){
  const p = prod(id); const hist = STOCK_UPDATES.filter(u=>(u.kind==='Purchase Order' && u.lines.some(l=>l.pid===id) && u.status!=='Draft') || (u.kind==='Recost' && u.status==='Posted' && u.lines.some(l=>l.pid===id)) || (!u.kind && u.type==='Receive' && u.pid===id)).slice(0,10);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('payments')}</div><div><div class="dh-t">Purchase Cost · ${esc(p.sku)}</div><div class="dh-s">${esc(p.name)} · weighted average, landed</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fields" style="margin-bottom:18px"><div class="fld"><label>Purchase cost</label><input class="inp num" id="pcIn" type="number" step="0.01" value="${p.cost}"/></div><div class="fld"><label>Supplier</label><input class="inp" readonly value="${esc(mfr(p.mfr).name)}"/></div>
      ${p.bom&&p.bom.type!=='Bundle'?`<div class="fld full"><div class="stitch-hint">${ic('auto_awesome')}Bill of Materials rolls up to ${money(bomCost(p))}. <button class="btn xs" data-cmd="cost-from-bom" data-id="${id}">Use BOM cost</button></div></div>`:''}</div>
    <div class="dsec"><div class="dsec-h"><h4>History</h4></div>${hist.length?`<table class="t mini"><thead><tr><th>Document</th><th>Date</th><th class="r">Qty</th><th class="r">Cost</th></tr></thead><tbody>${hist.map(u=>{ const l = (u.lines||[]).find(x=>x.pid===id); const a = u.alloc && u.alloc.find(x=>x.pid===id); return `<tr><td><button class="link mono" data-cmd="open-update" data-id="${u.id}">${u.no||u.id}</button>${sub(u.kind||u.type)}</td><td>${fmtD(u.date)}</td><td class="r num">${l?l.rcv??l.qty:u.qty}</td><td class="r num">${a?`${money(a.before)} → ${money(a.after)}`:money(l?l.cost:u.unitCost)}</td></tr>`; }).join('')}</tbody></table>`:'<span class="faint">No purchases yet</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Purchase Order" data-id="${id}">${ic('shopping_cart')}Create PO</button><span class="sp"></span><button class="btn primary" data-cmd="cost-save" data-id="${id}">Save cost</button></div>`);
}
function pricingPanel(id){
  const p = prod(id), pr = pricing(p);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('sell')}</div><div><div class="dh-t">Customer Pricing · ${esc(p.sku)}</div><div class="dh-s">Quotes and orders price from here: customer price, then quantity break, then tier.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="dsec"><div class="dsec-h"><h4>Price tiers</h4><span class="muted" style="font-size:12px">Cost ${money(p.cost)}</span></div><div class="fields">${TIERS.map(t=>`<div class="fld"><label>${t} <span class="opt">· ${pr.tiers[t]?Math.round((1-p.cost/pr.tiers[t])*100):0}% margin</span></label><input class="inp num" type="number" step="0.01" data-pt="${t}" value="${pr.tiers[t]}"/></div>`).join('')}</div></div>
    <div class="dsec"><div class="dsec-h"><h4>Quantity breaks</h4><button class="btn xs" data-cmd="pr-add-break" data-id="${id}">${ic('add')}Add break</button></div>${pr.breaks.length?`<table class="t mini"><tbody>${pr.breaks.map((b,i)=>`<tr><td><select class="inp sm" data-pb="${i}" data-f="tier">${optList(TIERS.map(t=>[t,t]), b.tier)}</select></td><td><input class="inp sm num" type="number" data-pb="${i}" data-f="min" value="${b.min}" aria-label="Minimum quantity"/></td><td><input class="inp sm num" type="number" step="0.01" data-pb="${i}" data-f="price" value="${b.price}" aria-label="Price"/></td><td><button class="icon-btn sm" data-cmd="pr-rm-break" data-id="${id}" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`).join('')}</tbody></table>`:'<span class="faint">None</span>'}</div>
    <div class="dsec"><div class="dsec-h"><h4>Customer prices</h4><button class="btn xs" data-cmd="pr-add-cust" data-id="${id}">${ic('add')}Add customer</button></div>${pr.customers.length?`<table class="t mini"><tbody>${pr.customers.map((c,i)=>`<tr><td><select class="inp sm" data-pc="${i}" data-f="name">${optList(CUSTOMERS.map(x=>[x.name,x.name]), c.name)}</select></td><td><input class="inp sm num" type="number" step="0.01" data-pc="${i}" data-f="price" value="${c.price}" aria-label="Price"/></td><td><button class="icon-btn sm" data-cmd="pr-rm-cust" data-id="${id}" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`).join('')}</tbody></table>`:'<span class="faint">None</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Sales Quote" data-id="${id}">${ic('request_quote')}Quote this</button><span class="sp"></span><button class="btn primary" data-cmd="pr-save" data-id="${id}">Save pricing</button></div>`);
}
function readPricing(p){ const pr = pricing(p); $$('[data-pt]').forEach(i=>pr.tiers[i.dataset.pt] = +i.value||0); $$('[data-pb]').forEach(i=>{ const b = pr.breaks[+i.dataset.pb]; b[i.dataset.f] = i.dataset.f==='tier' ? i.value : +i.value||0; }); $$('[data-pc]').forEach(i=>{ const c = pr.customers[+i.dataset.pc]; c[i.dataset.f] = i.dataset.f==='name' ? i.value : +i.value||0; }); if(pr.tiers.Retail) p.price = pr.tiers.Retail; }
let BOMD = null;
function bomPanel(id){
  const p = prod(id); if(!BOMD || BOMD.id!==id) BOMD = { id, type:p.bom?.type||'Assembly', labor:p.bom?.labor||0, comps:(p.bom?.comps||[]).map(c=>({...c})) };
  const pool = PRODUCTS.filter(x=>x.id!==id && isStocked(x));
  const cost = BOMD.comps.reduce((a,c)=>a+c.qty*(prod(c.pid)?.cost||0),0) + (+BOMD.labor||0);
  const build = BOMD.comps.length ? Math.min(...BOMD.comps.map(c=>Math.floor(Math.max(0,availableQty(prod(c.pid)))/(c.qty||1)))) : 0;
  openDrawer(`<div class="dh"><div class="li-ic">${ic('account_tree')}</div><div><div class="dh-t">Bill of Materials · ${esc(p.sku)}</div><div class="dh-s">Assembly builds stock, Kit is packed from stock, Bundle sells components together without its own stock.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fields" style="margin-bottom:18px"><div class="fld"><label>Type</label><div class="seg">${['Assembly','Kit','Bundle'].map(t=>`<button class="${BOMD.type===t?'on':''}" data-cmd="bom-type" data-t="${t}">${t}</button>`).join('')}</div></div><div class="fld"><label>Labor & overhead per unit</label><input class="inp num" type="number" step="0.01" data-bl="1" value="${BOMD.labor}"/></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Components</h4><button class="btn xs" data-cmd="bom-add">${ic('add')}Add component</button></div>
    ${BOMD.comps.length?`<table class="t mini"><thead><tr><th>Component</th><th class="r" style="width:80px">Qty</th><th class="r">Cost</th><th class="r">Available</th><th></th></tr></thead><tbody>${BOMD.comps.map((c,i)=>{ const cp = prod(c.pid); return `<tr><td><select class="inp sm" data-bc="${i}" data-f="pid">${optList(pool.map(x=>[x.id, x.sku+' — '+x.name]), c.pid)}</select></td><td class="r"><input class="inp sm num r" type="number" min="1" step="any" data-bc="${i}" data-f="qty" value="${c.qty}"/></td><td class="r num">${money(c.qty*cp.cost)}</td><td class="r num">${num(availableQty(cp))}</td><td><button class="icon-btn sm" data-cmd="bom-rm" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`; }).join('')}</tbody></table>`:'<span class="faint">No components yet</span>'}
    <div class="kv" style="margin-top:14px"><div><div class="k">Rolled-up cost</div><div class="v">${money(cost)}</div></div><div><div class="k">Buildable now</div><div class="v">${num(build)}</div></div><div><div class="k">In production</div><div class="v">${num(inProdQty(p))}</div></div></div></div>
    ${p.bom?`<div class="dsec"><div class="dsec-h"><h4>Production history</h4></div>${docs('Assembly').concat(docs('Disassembly')).filter(u=>u.lines[0]?.pid===id).map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-main"><div class="li-t mono">${u.no}</div><div class="li-s">${u.kind} · ${u.lines[0].qty} units · ${fmtD(u.date)}</div></div><div class="li-r">${pill(u.status, STATUS_C[u.status], false)}</div></button>`).join('') || '<span class="faint">None</span>'}</div>`:''}</div>
    <div class="df">${p.bom && p.bom.type!=='Bundle'?`<button class="btn" data-cmd="new-doc" data-k="Disassembly" data-id="${id}">${ic('call_split')}Disassemble</button><button class="btn" data-cmd="new-doc" data-k="Assembly" data-id="${id}">${ic('precision_manufacturing')}Assemble</button>`:''}${p.bom?`<button class="btn ghost" data-cmd="bom-del" data-id="${id}">Remove BOM</button>`:''}<span class="sp"></span><button class="btn primary" data-cmd="bom-save" data-id="${id}">Save BOM</button></div>`);
}
function trackPanel(id){
  const p = prod(id); const ss = SERIALS.filter(s=>s.pid===id), ls = BATCHES.filter(b=>b.pid===id);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('qr_code_2')}</div><div><div class="dh-t">Tracking · ${esc(p.sku)}</div><div class="dh-s">Serial numbers are recorded on receive, build and dispatch. Lots are consumed first-expiry-first-out.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fld" style="margin-bottom:18px"><label>Track by</label><div class="seg">${['None','Serial','Batch'].map(t=>`<button class="${p.track===t?'on':''}" data-cmd="track-set" data-id="${id}" data-t="${t}">${t==='Batch'?'Batch / lot':t}</button>`).join('')}</div></div>
    ${p.track==='Serial'?`<div class="dsec"><div class="dsec-h"><h4>Serial numbers (${ss.length})</h4></div><table class="t mini"><thead><tr><th>Serial</th><th>Status</th><th>Shelf</th><th>Document</th></tr></thead><tbody>${ss.map(s=>`<tr><td class="mono">${s.no}</td><td>${pill(s.status, s.status==='In stock'?'green':'gray', false)}</td><td class="mono">${s.loc}</td><td class="mono muted">${esc(s.doc)}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${p.track==='Batch'?`<div class="dsec"><div class="dsec-h"><h4>Lots</h4></div><table class="t mini"><thead><tr><th>Lot</th><th class="r">Qty</th><th>Expiry</th><th>Shelf</th></tr></thead><tbody>${ls.map(b=>`<tr><td class="mono">${b.lot}</td><td class="r num">${b.qty}</td><td class="${daysUntil(b.exp)<90?'var-neg':''}">${fmtD(b.exp)}</td><td class="mono">${b.loc}</td></tr>`).join('') || '<tr><td colspan="4" class="faint">No lots</td></tr>'}</tbody></table></div>`:''}
    ${p.track==='None'?'<span class="faint">Quantity only. Switch to Serial or Batch to record identities.</span>':''}</div>`);
}
function stitchPlanModal(only){
  const ps = (only || PRODUCTS).filter(isStocked).map(p=>({ p, s:stitchPlan(p) })).filter(x=>x.s && x.s.flag!=='Healthy' && !(x.s.flag==='Understock' && (x.p.po || inProdQty(x.p)>=x.s.qty)));
  const under = ps.filter(x=>x.s.flag==='Understock'), over = ps.filter(x=>x.s.flag==='Overstock');
  const buy = {}; under.filter(x=>!x.s.make).forEach(x=>{ (buy[x.p.mfr] = buy[x.p.mfr] || []).push(x); }); const make = under.filter(x=>x.s.make);
  const cost = under.reduce((a,x)=>a + x.s.qty*(x.s.make?bomCost(x.p):x.p.cost),0);
  S._plan = { buy, make };
  openModal(`<div class="mh">${ic('auto_awesome','ai-ic')}<div class="t">Plan with Stitch</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 14px">Stitch reads the 30-day forecast, open sales orders, backorders, production plans and open purchase orders, then covers lead time plus three weeks.</p>
    ${under.length?`${Object.entries(buy).map(([m,xs])=>`<div class="dsec"><div class="dsec-h"><h4>${ic('shopping_cart')} Purchase order · ${esc(mfr(m).name)}</h4><span class="muted num">${money(xs.reduce((a,x)=>a+x.s.qty*x.p.cost,0))}</span></div><table class="t mini"><tbody>${xs.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r num" style="white-space:nowrap">${num(x.s.qty)} × ${money(x.p.cost)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${make.length?`<div class="dsec"><div class="dsec-h"><h4>${ic('precision_manufacturing')} Assemblies</h4></div><table class="t mini"><tbody>${make.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r num">${num(x.s.qty)} units</td></tr>`).join('')}</tbody></table></div>`:''}`:`<div class="empty" style="padding:20px">${ic('task_alt')}Nothing is understocked once open orders and production are counted.</div>`}
    ${over.length?`<div class="dsec"><div class="dsec-h"><h4>${ic('inventory')} Overstocked</h4></div><table class="t mini"><tbody>${over.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r"><button class="btn xs" data-cmd="new-doc" data-k="Transfer" data-id="${x.p.id}">Move to overflow</button></td></tr>`).join('')}</tbody></table></div>`:''}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button>${under.length?`<button class="btn primary" data-cmd="plan-go">${ic('auto_awesome')}Create ${Object.keys(buy).length} PO${Object.keys(buy).length===1?'':'s'}${make.length?` + ${make.length} assembl${make.length===1?'y':'ies'}`:''} · ${money(cost,0)}</button>`:''}</div>`, true);
}
Object.assign(CMD, {
  'open-supplier': el => { closeMenu(); closeModal(); openSupplier(el.dataset.id); },
  'open-cost': el => costPanel(el.dataset.id),
  'cost-save': el => { const p = prod(el.dataset.id); const v = +$('#pcIn').value; if(!(v>=0)) return toast('Enter a cost'); const was = p.cost; p.cost = v; p.updated = todayISO; toast(`${p.sku} purchase cost ${money(was)} → ${money(v)}`, ()=>{ p.cost = was; }); render(); costPanel(p.id); },
  'cost-from-bom': el => { const p = prod(el.dataset.id); $('#pcIn').value = bomCost(p).toFixed(2); },
  'open-pricing': el => pricingPanel(el.dataset.id),
  'pr-save': el => { const p = prod(el.dataset.id); readPricing(p); toast(`${p.sku} pricing saved`); render(); pricingPanel(p.id); },
  'pr-add-break': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).breaks.push({ tier:'Wholesale', min:24, price:+(pricing(p).tiers.Wholesale*0.95).toFixed(2) }); pricingPanel(p.id); },
  'pr-rm-break': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).breaks.splice(+el.dataset.i,1); pricingPanel(p.id); },
  'pr-add-cust': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).customers.push({ name:CUSTOMERS[0].name, price:pricing(p).tiers.Wholesale }); pricingPanel(p.id); },
  'pr-rm-cust': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).customers.splice(+el.dataset.i,1); pricingPanel(p.id); },
  'open-bom': el => { BOMD = null; bomPanel(el.dataset.id); },
  'bom-edit': el => { BOMD = null; bomPanel(el.dataset.id); },
  'bom-type': el => { BOMD.type = el.dataset.t; bomPanel(BOMD.id); },
  'bom-add': () => { const p = PRODUCTS.find(x=>isStocked(x) && x.id!==BOMD.id && !BOMD.comps.some(c=>c.pid===x.id) && x.status==='Internal') || PRODUCTS.find(isStocked); BOMD.comps.push({ pid:p.id, qty:1 }); bomPanel(BOMD.id); },
  'bom-rm': el => { BOMD.comps.splice(+el.dataset.i,1); bomPanel(BOMD.id); },
  'bom-save': el => { const p = prod(el.dataset.id); if(!BOMD.comps.length) return toast('Add at least one component'); p.bom = { type:BOMD.type, labor:+BOMD.labor||0, comps:BOMD.comps.map(c=>({...c})) }; if(p.bom.type==='Bundle') p.locs = p.locs; toast(`${p.sku} Bill of Materials saved · ${money(bomCost(p))}/unit`); render(); BOMD = null; bomPanel(p.id); },
  'bom-del': el => { const p = prod(el.dataset.id); const was = p.bom; delete p.bom; BOMD = null; toast(`${p.sku} BOM removed`, ()=>{ p.bom = was; }); closeDrawer(); render(); },
  'open-track': el => trackPanel(el.dataset.id),
  'track-set': el => { const p = prod(el.dataset.id); p.track = el.dataset.t; if(p.track==='Batch' && !lotsOf(p).length && onHand(p)) BATCHES.push({ lot:'LOT-OPEN-'+p.id.slice(1), pid:p.id, qty:onHand(p), exp:iso(new Date(TODAY.getTime()+365*864e5)), loc:p.locs[0]?.s||'—' }); toast(`${p.sku} tracked by ${p.track}`); render(); trackPanel(p.id); },
  'open-plan': el => stitchPlanModal([prod(el.dataset.id)]),
  'stitch-plan': () => { closeMenu(); stitchPlanModal(); },
  'plan-go': () => { const { buy, make } = S._plan; const made = [];
    Object.entries(buy).forEach(([m, xs])=>{ const u = newDoc('Purchase Order', { status:'Draft', party:mfr(m).name, sup:m, wh:'CDC', comments:'Drafted by Stitch from forecast, orders and production plan', lines:xs.map(x=>({ pid:x.p.id, qty:x.s.qty, cost:x.p.cost, rcv:0 })) }); setUnitCost(u); made.push(u.no); });
    make.forEach(x=>{ const u = newDoc('Assembly', { status:'Planned', wh:'CDC', loc:x.p.locs[0]?.s || bestBin(x.p,'CDC'), due:iso(new Date(TODAY.getTime()+5*864e5)), lines:[{ pid:x.p.id, qty:x.s.qty }], comments:'Planned by Stitch' }); setUnitCost(u); made.push(u.no); });
    syncPO(); closeModal(); toast(`Stitch created ${made.join(', ')}`); render(); }
});
document.addEventListener('input', e=>{ const t = e.target; if(!BOMD || !t.dataset) return; if(t.dataset.bl) BOMD.labor = +t.value||0; if(t.dataset.bc && t.dataset.f==='qty') BOMD.comps[+t.dataset.bc].qty = +t.value||1; });
document.addEventListener('change', e=>{ const t = e.target; if(!BOMD || !t.dataset) return; if(t.dataset.bc && t.dataset.f==='pid'){ BOMD.comps[+t.dataset.bc].pid = t.value; bomPanel(BOMD.id); } if(t.dataset.bc && t.dataset.f==='qty' || t.dataset.bl) bomPanel(BOMD.id); });
