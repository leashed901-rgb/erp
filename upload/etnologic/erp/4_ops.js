/* ================= Operation modals (receive, pack, dispatch, recost) ================= */
function receiveModal(u){
  const open = u.lines.map((l,i)=>({ l, i, rem:l.qty-(l.rcv||0) })).filter(x=>x.rem>0);
  if(!open.length) return toast('Nothing left to receive');
  const lc = chargesTotal(u), sub = lineSub(u) || 1;
  openModal(`<div class="mh">${ic('move_to_inbox')}<div class="t">Receive ${u.no}</div>${pill(u.status, STATUS_C[u.status], false)}<button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 12px">From ${esc(u.party)}. Freight on this PO (${money(lc)}) is added to the landed unit cost.</p>
    <table class="t mini"><thead><tr><th>Product</th><th class="r" style="width:80px">Receive</th><th style="width:118px">Into bin</th><th>Tracking</th></tr></thead><tbody>
    ${open.map(({l,i,rem})=>{ const p = prod(l.pid); const land = l.cost + (lc*(l.cost/ sub)); return `<tr><td><div class="prod-name">${esc(p.name)}</div><div class="muted mono" style="font-size:11.5px">${p.sku} · ${rem} of ${l.qty} open · landed ${money(land)}</div></td>
      <td class="r"><input class="inp sm num r" type="number" min="0" max="${rem}" id="rq${i}" value="${rem}"/></td>
      <td><select class="inp sm" id="rb${i}">${shelfOpts(bestBin(p, u.wh))}</select></td>
      <td>${p.track==='Batch' ? `<div style="display:flex;gap:4px"><input class="inp sm mono" id="rl${i}" value="LOT-${u.no.slice(-4)}${i}" aria-label="Lot"/><input class="inp sm" type="date" id="re${i}" value="${iso(new Date(TODAY.getTime()+365*864e5))}" aria-label="Expiry"/></div>` : p.track==='Serial' ? `<input class="inp sm mono" id="rs${i}" placeholder="Auto-assign or paste, comma separated"/>` : '<span class="faint">None</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-receive" data-id="${u.id}">${ic('move_to_inbox')}Receive into stock</button></div>`, true);
}
function doReceive(u){
  const lc = chargesTotal(u), sub = lineSub(u) || 1; let tot = 0; const bins = new Set(), lots = [], sers = [];
  u.lines.forEach((l,i)=>{ const q = Math.min(+($('#rq'+i)?.value||0), l.qty-(l.rcv||0)); if(!(q>0)) return; const p = prod(l.pid), bin = $('#rb'+i).value;
    const land = +(l.cost + lc*(l.cost/sub)).toFixed(2);
    avgIn(p, q, land); applyDelta(p, bin, q); p.updated = todayISO; l.rcv = (l.rcv||0) + q; tot += q; bins.add(bin);
    if(p.track==='Batch'){ const lot = $('#rl'+i).value || ('LOT-'+u.no.slice(-4)); BATCHES.push({ lot, pid:p.id, qty:q, exp:$('#re'+i).value, loc:bin }); lots.push(lot); }
    if(p.track==='Serial'){ const typed = ($('#rs'+i).value||'').split(',').map(s=>s.trim()).filter(Boolean); const s = typed.length ? typed : newSerials(p, q, bin, u.no); if(typed.length) typed.forEach(no=>SERIALS.push({ no, pid:p.id, loc:bin, status:'In stock', doc:u.no })); sers.push(...s); } });
  if(!tot) return toast('Enter a quantity to receive');
  u.qty += tot; u.loc = [...bins].join(', '); if(lots.length) u.lots = [u.lots, ...lots].filter(Boolean).join(', '); if(sers.length) u.serials = [u.serials, ...sers].filter(Boolean).join(', ');
  u.status = u.lines.every(l=>(l.rcv||0)>=l.qty) ? 'Received' : 'Partially received'; closeModal();
  after(u, `${u.no} · received ${tot} into ${u.loc}. Purchase cost updated (weighted average, landed).`);
}
const boxes = () => PRODUCTS.filter(p=>p.area==='Packaging' && onHand(p)>0);
function packModal(u){
  const units = u.lines.reduce((a,l)=>a+l.qty,0); const wt = +u.lines.reduce((a,l)=>a+l.qty*(prod(l.pid).vol||0)*8, 0.4).toFixed(1);
  const bx = boxes(); const pick = units>4 ? bx.find(p=>p.sku.includes('1210')) : bx.find(p=>p.sku.includes('0806')) || bx[0];
  openModal(`<div class="mh">${ic('package_2')}<div class="t">Pack ${u.no}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields">
      <div class="fld"><label>Box <span class="opt">· consumed from stock</span></label><select class="inp" id="pkBox">${bx.map(p=>`<option value="${p.id}" ${p===pick?'selected':''}>${p.sku} · ${onHand(p)} left</option>`).join('')}</select></div>
      <div class="fld"><label>Cartons</label><input class="inp num" id="pkN" type="number" min="1" value="${Math.max(1, Math.ceil(units/24))}"/></div>
      <div class="fld"><label>Weight (lb)</label><input class="inp num" id="pkW" type="number" step="0.1" value="${wt}"/></div>
      <div class="fld"><label>Packed by</label><select class="inp" id="pkBy">${OWNERS.map(o=>`<option>${o}</option>`).join('')}</select></div>
    </div><div class="stitch-hint" style="margin-top:12px">${ic('auto_awesome')}Stitch picked ${pick?pick.sku:'a box'} for ${units} unit${units>1?'s':''}.</div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-pack" data-id="${u.id}">${ic('package_2')}Mark packed</button></div>`);
}
function doPack(u){ const b = prod($('#pkBox').value), n = +$('#pkN').value||1; if(b) takeFrom(b, n); u.box = b?.sku; u.cartons = n; u.weight = +$('#pkW').value||1; u.packer = $('#pkBy').value; u.status = 'Packed'; closeModal(); after(u, `${u.no} packed · ${n} × ${u.box} · ${u.weight} lb`); }
const CARRIERS = [['USPS Ground Advantage', 0.9, 4.2],['UPS Ground', 1.1, 5.4],['FedEx Home Delivery', 1.05, 5.9],['LTL · Estes', 0.32, 68]];
function dispatchModal(u){
  const w = u.weight || 2; const rates = CARRIERS.map(([c,per,base])=>({ c, p:+(base + per*w).toFixed(2) })); if(u.wh==='MEM') rates.unshift({ c:'ShipBob · UPS', p:+(3.9+0.7*w).toFixed(2) });
  const best = rates.slice().sort((a,b)=>a.p-b.p)[0];
  openModal(`<div class="mh">${ic('local_shipping')}<div class="t">Dispatch ${u.no}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 10px">${esc(u.party)} · ${u.cartons||1} carton · ${w} lb. Dispatching deducts stock from the picked bins${u.lines.some(l=>['Serial','Batch'].includes(prod(l.pid).track))?' and records serials / lots':''}.</p>
    <div class="list">${rates.map(r=>`<label class="li" style="cursor:pointer"><input type="radio" name="dRate" value="${esc(r.c)}" data-p="${r.p}" ${r===best?'checked':''}/><div class="li-main"><div class="li-t">${esc(r.c)}</div><div class="li-s">${r===best?'Cheapest · Stitch pick':'&nbsp;'}</div></div><div class="li-r num">${money(r.p)}</div></label>`).join('')}</div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-dispatch" data-id="${u.id}">${ic('local_shipping')}Buy label & dispatch</button></div>`);
}
function doDispatch(u){
  const r = document.querySelector('input[name="dRate"]:checked'); const carrier = r.value, cost = +r.dataset.p;
  let units = 0; const bins = new Set(), sers = [], lots = [];
  u.lines.forEach(l=>{ stockLines(l).forEach(x=>{ const p = prod(x.pid); if(!isStocked(p)) return; const picks = (l.picks||[]).filter(k=>k.pid===x.pid);
      let need = x.qty; picks.forEach(k=>{ const t = Math.min(k.q, qtyAt(p,k.s), need); if(t>0){ applyDelta(p, k.s, -t); need -= t; bins.add(k.s); } }); if(need>0) takeFrom(p, need).forEach(t=>bins.add(t.s));
      p.locs = p.locs.filter(z=>z.q>0); p.updated = todayISO; units += x.qty;
      if(p.track==='Serial') sers.push(...shipSerials(p, x.qty, u.no)); if(p.track==='Batch') lots.push(consumeLots(p, x.qty)); }); });
  const id = 'SHP-' + (S.shpSeq++);
  SHIPMENTS.unshift({ id, dir:'Outbound', ref:`${u.no} · ${u.channel||'Direct'}`, party:u.party, carrier, items:units, wh:u.wh, status:'Label created', eta:iso(new Date(TODAY.getTime()+3*864e5)), cost, weight:u.weight||1 });
  u.ship = id; u.carrier = carrier; u.qty = -units; u.loc = [...bins].join(', ') || u.loc; if(sers.length) u.serials = sers.join(', '); if(lots.length) u.lots = lots.filter(Boolean).join(', ');
  u.status = 'Dispatched'; closeModal(); after(u, `${u.no} dispatched · ${id} · ${carrier} ${money(cost)} · −${units} from stock`);
}
function recostModal(po){
  const rc = newDoc('Recost', { status:'Draft', ref:po.no, party:po.party, method:'value', costs:[{ name:'Duty & tariffs', amt:+(lineSub(po)*0.065).toFixed(2) }, { name:'Customs broker', amt:35 }], lines:po.lines.filter(l=>l.rcv).map(l=>({ pid:l.pid, qty:l.rcv, cost:l.cost })) });
  setUnitCost(rc); logDoc(po, `Recost ${rc.no} drafted`); toast(`${rc.no} drafted from ${po.no}`); render(); docDrawer(rc.id);
}
function shortModal(u, short){
  const l = u.lines[0];
  openModal(`<div class="mh">${ic('warning')}<div class="t">Short on components</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><table class="t mini"><thead><tr><th>Component</th><th class="r">Need</th><th class="r">On hand</th><th class="r">Short</th></tr></thead><tbody>${short.map(c=>{ const cp = prod(c.pid); return `<tr><td>${esc(cp.name)}</td><td class="r num">${c.qty*l.qty}</td><td class="r num">${onHand(cp)}</td><td class="r num var-neg">${c.qty*l.qty-onHand(cp)}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="short-po" data-id="${u.id}">${ic('shopping_cart')}Draft purchase orders</button></div>`);
}

/* ================= Document drawer ================= */
const partyLabel = u => ['Purchase Order','Supplier Return'].includes(u.kind) ? 'Supplier' : ['Sales Quote','Sales Order'].includes(u.kind) ? 'Customer' : '';
function stepper(u){ const f = FLOW[u.kind] || []; let i = f.indexOf(u.status); if(u.status==='Backordered') i = 0;
  const off = ['Cancelled','Declined'].includes(u.status);
  return `<div class="stepper">${f.map((s,j)=>`<div class="st ${!off && j<i?'done':''} ${!off && j===i?'cur':''}"><i></i><span>${s==='Open'&&u.status==='Backordered'?'Backordered':s}</span></div>`).join('')}${off?`<div class="st cur off"><i></i><span>${u.status}</span></div>`:''}</div>`; }
function docLinesHTML(u){
  const k = u.kind, sale = ['Sales Quote','Sales Order'].includes(k), po = k==='Purchase Order';
  if(k==='Stock Take'){ const can = u.status==='Counting';
    return `<table class="t mini"><thead><tr><th>Shelf</th><th>Product</th><th class="r">System</th><th class="r" style="width:90px">Counted</th><th class="r">Variance</th></tr></thead><tbody>${u.lines.map((l,i)=>{ const p = prod(l.pid); const v = l.cnt==null ? null : l.cnt - (can ? qtyAt(p,l.loc) : l.sys); return `<tr><td class="mono">${l.loc}</td><td><div class="prod-name">${esc(p.name)}</div><div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td class="r num">${can?qtyAt(p,l.loc):l.sys}</td><td class="r">${can?`<input class="inp sm num r" type="number" min="0" data-stc="${u.id}" data-i="${i}" value="${l.cnt??''}" placeholder="${l.sys}"/>`:num(l.cnt)}</td><td class="r num ${v>0?'var-pos':v<0?'var-neg':''}" data-stv="${i}">${v==null?'—':(v>0?'+':'')+v}</td></tr>`; }).join('')}</tbody></table>${can?`<div style="margin-top:8px;display:flex;gap:6px"><button class="btn xs" data-cmd="st-fill" data-id="${u.id}">Counted = system for blanks</button></div>`:''}`; }
  if(k==='Recost'){ const al = u.status==='Posted' ? u.alloc : recostAlloc(u); const can = u.status==='Draft';
    return `<div class="dsec"><div class="dsec-h"><h4>Additional costs</h4>${can?`<button class="btn xs" data-cmd="rc-add" data-id="${u.id}">${ic('add')}Add cost</button>`:''}</div>
      <table class="t mini"><tbody>${u.costs.map((c,i)=>`<tr><td>${can?`<input class="inp sm" data-rc="${u.id}" data-i="${i}" data-f="name" value="${esc(c.name)}"/>`:esc(c.name)}</td><td class="r" style="width:120px">${can?`<input class="inp sm num r" type="number" step="0.01" data-rc="${u.id}" data-i="${i}" data-f="amt" value="${c.amt}"/>`:money(c.amt)}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12px">Allocate by</span><div class="seg">${[['value','Value'],['qty','Quantity'],['volume','Volume']].map(([m,t])=>`<button class="${u.method===m?'on':''}" ${can?'':'disabled'} data-cmd="rc-method" data-id="${u.id}" data-m="${m}">${t}</button>`).join('')}</div></div></div>
      <table class="t mini"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Share</th><th class="r">+ per unit</th><th class="r">Purchase cost</th></tr></thead><tbody>${al.map(x=>{ const p = prod(x.pid); return `<tr><td>${esc(p.name)}<div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td class="r num">${x.qty}</td><td class="r num">${money(x.share)}</td><td class="r num">${money(x.perUnit)}</td><td class="r num">${u.status==='Posted'?`${money(x.before)} → <b>${money(x.after)}</b>`:`${money(p.cost)} → <b>${money(p.cost+x.perUnit)}</b>`}</td></tr>`; }).join('')}</tbody></table>`; }
  const rows = u.lines.map(l=>{ const p = prod(l.pid); const pk = (l.picks||[]);
    return `<tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button><div class="muted mono" style="font-size:11.5px">${p.sku}${isBundle(p)?' · bundle of '+p.bom.comps.map(c=>c.qty+'× '+prod(c.pid).sku).join(' + '):''}${pk.length?` · pick ${pk.map(k=>`${k.s}×${k.q}${k.done?' ✓':''}`).join(', ')}`:''}</div></td>
      <td class="r num">${l.qty}</td>${po?`<td class="r num">${l.rcv||0}</td>`:''}${k==='Sales Order'?`<td class="r num">${l.alloc||0}</td>`:''}<td class="r num">${money(sale?l.price:(l.cost??p.cost))}</td><td class="r num">${money(l.qty*(sale?l.price:(l.cost??p.cost)))}</td></tr>`; }).join('');
  const ch = (u.charges||[]).map(c=>`<tr class="sub"><td colspan="${2+(po?1:0)+(k==='Sales Order'?1:0)}">${esc(c.name)} <span class="muted">· ${c.basis==='%'?c.rate+'%':money(c.rate)+(c.basis==='flat'?'':' '+c.basis)}</span></td><td></td><td class="r num">${money(chargeAmt(u,c))}</td></tr>`).join('');
  return `<table class="t mini"><thead><tr><th>Product</th><th class="r">Qty</th>${po?'<th class="r">Received</th>':''}${k==='Sales Order'?'<th class="r">Allocated</th>':''}<th class="r">${sale?'Price':'Cost'}</th><th class="r">Line</th></tr></thead><tbody>${rows}${ch}</tbody>
    <tfoot><tr><td colspan="${3+(po?1:0)+(k==='Sales Order'?1:0)}"><b>Total</b></td><td class="r num"><b>${money(docTotal(u))}</b></td></tr></tfoot></table>`;
}
function docDrawer(id){
  const u = docById(id); if(!u) return; const k = u.kind;
  if(!isDoc(u)) return openUpdateLegacy(id);
  const acts = actsFor(u); const p = prod(u.pid);
  const meta = [];
  if(partyLabel(u)) meta.push([partyLabel(u), u.sup ? `<button class="link" data-cmd="open-supplier" data-id="${u.sup}">${esc(u.party)}</button>` : esc(u.party)]);
  if(u.channel) meta.push(['Distribution Channel', esc(u.channel)]);
  if(['Sales Order','Purchase Order','Stock Take'].includes(k)) meta.push([k==='Purchase Order'?'Deliver to':'Warehouse', esc(WAREHOUSES.find(w=>w.id===u.wh)?.name||u.wh)]);
  if(u.eta && k==='Purchase Order') meta.push(['Expected', fmtD(u.eta)]);
  if(u.expires) meta.push(['Valid until', fmtD(u.expires)]);
  if(u.due) meta.push(['Due', fmtD(u.due)]);
  if(k==='Transfer') meta.push(['Route', `<span class="mono">${u.from} → ${u.to}</span>`]);
  if(['Assembly','Disassembly'].includes(k)) meta.push([k==='Assembly'?'Output shelf':'From shelf', `<span class="mono">${u.loc}</span>`]);
  if(u.ref) meta.push(['Reference', docByNo(u.ref) ? `<button class="link mono" data-cmd="open-doc" data-id="${docByNo(u.ref).id}">${u.ref}</button>` : esc(u.ref)]);
  if(u.ship) meta.push(['Shipment', `<button class="link mono" data-cmd="open-shipment" data-id="${u.ship}">${u.ship}</button> · ${esc(u.carrier)}`]);
  if(u.box) meta.push(['Packed', `${u.cartons||1} × ${esc(u.box)} · ${u.weight} lb`]);
  if(u.reason) meta.push(['Reason', esc(u.reason)]);
  if(u.credit) meta.push(['Credit', money(u.credit)]);
  meta.push(['Quantity moved', `<span class="${u.qty<0?'var-neg':''}">${u.qty>0?'+':''}${u.qty}</span>`]);
  const bom = ['Assembly','Disassembly'].includes(k) && p.bom ? `<div class="dsec"><div class="dsec-h"><h4>${u.status==='Completed'&&u.used?'Components consumed':'Bill of Materials'}</h4></div>${u.status==='Completed'&&u.used ? `<table class="t mini"><tbody>${u.used.map(x=>`<tr><td>${esc(prod(x.pid).name)}${x.lots?` <span class="muted mono">${x.lots}</span>`:''}</td><td class="r num">−${x.qty}</td><td class="r num">${money(x.cost)}</td></tr>`).join('')}</tbody></table>` : bomNeedHTML(p, u.lines[0].qty, k==='Assembly'?1:-1)}</div>` : '';
  const trk = (u.serials || u.lots) ? `<div class="dsec"><div class="dsec-h"><h4>Serial & batch</h4></div>${u.serials?`<div class="serials">${u.serials.split(',').map(s=>`<span class="tag mono">${esc(s.trim())}</span>`).join('')}</div>`:''}${u.lots?`<div class="muted mono" style="margin-top:6px">${esc(u.lots)}</div>`:''}</div>` : '';
  const prim = acts.filter(a=>!a.ghost), sec = acts.filter(a=>a.ghost);
  const editable = ['Draft','Open','Planned','Counting','Backordered'].includes(u.status) && !['Stock Take','Recost'].includes(k);
  openDrawer(`<div class="dh"><div class="li-ic">${ic(TX_ICON[k])}</div><div><div class="dh-t">${k} · <span class="mono">${u.no}</span></div><div class="dh-s">${u.id} · Auto #${u.auto} · ${fmtD(u.date)} · ${esc(u.owner)}</div></div><div class="dh-x">${pill(u.status, STATUS_C[u.status]||'gray')}<button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db">${stepper(u)}
      <div class="kv" style="margin:16px 0 20px">${meta.map(([a,b])=>`<div><div class="k">${a}</div><div class="v">${b}</div></div>`).join('')}${'<div></div>'.repeat((3-meta.length%3)%3)}</div>
      ${k==='Stock Take' ? '' : ''}<div class="dsec"><div class="dsec-h"><h4>${k==='Stock Take'?'Counts':k==='Recost'?'Landed cost':'Lines'}</h4></div>${['Assembly','Disassembly','Transfer'].includes(k) ? `<table class="t mini"><tbody><tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button><div class="muted mono" style="font-size:11.5px">${p.sku} · ${num(onHand(p))} on hand</div></td><td class="r num">${u.lines[0].qty}</td><td class="r num">${money(u.lines[0].cost ?? (k==='Assembly'?bomCost(p):p.cost))}</td></tr></tbody></table>` : docLinesHTML(u)}</div>
      ${bom}${trk}
      ${u.comments?`<div class="dsec"><div class="dsec-h"><h4>Comments</h4></div><p style="margin:0">${esc(u.comments)}</p></div>`:''}
      <div class="dsec"><div class="dsec-h"><h4>Activity</h4></div><div class="log">${u.log.map(x=>`<div><span class="muted">${fmtD(x.d)}</span> ${esc(x.t)}</div>`).join('')}</div></div>
    </div>
    <div class="df">${sec.map(a=>`<button class="btn ghost" data-cmd="doc-act" data-id="${u.id}" data-a="${a.a}">${ic(a.i)}${a.t}</button>`).join('')}${editable?`<button class="btn ghost" data-cmd="doc-edit" data-id="${u.id}">${ic('edit')}Edit</button>`:''}<span class="sp"></span>${!acts.length?`<button class="btn" data-cmd="report-one" data-id="${u.id}">${ic('summarize')}Create Action Reports</button>`:''}${prim.map((a,i)=>`<button class="btn ${i===prim.length-1?'primary':''}" data-cmd="doc-act" data-id="${u.id}" data-a="${a.a}">${ic(a.i)}${a.t}</button>`).join('')}</div>`);
  $('#drawer').dataset.doc = u.id;
}
const openUpdateLegacy = openUpdate;
openUpdate = id => { const u = docById(id); if(u && isDoc(u)) return docDrawer(id); openUpdateLegacy(id); };
TABLES.updates.open = r => openUpdate(r.u.id);

document.addEventListener('input', e=>{ const t = e.target;
  if(t.dataset && t.dataset.stc){ const u = docById(t.dataset.stc), i = +t.dataset.i, l = u.lines[i]; l.cnt = t.value==='' ? null : +t.value; const v = l.cnt==null ? null : l.cnt - qtyAt(prod(l.pid), l.loc); const c = $(`[data-stv="${i}"]`); if(c){ c.textContent = v==null?'—':(v>0?'+':'')+v; c.className = 'r num '+(v>0?'var-pos':v<0?'var-neg':''); } }
  if(t.dataset && t.dataset.rc){ const u = docById(t.dataset.rc); const c = u.costs[+t.dataset.i]; c[t.dataset.f] = t.dataset.f==='amt' ? (+t.value||0) : t.value; }
});
document.addEventListener('change', e=>{ const t = e.target; if(t.dataset && t.dataset.rc && t.dataset.f==='amt') docDrawer(t.dataset.rc); });

Object.assign(CMD, {
  'open-doc': el => { closeMenu(); closeModal(); docDrawer(el.dataset.id); },
  'doc-act': el => { closeMenu(); const u = docById(el.dataset.id); runAct(u, el.dataset.a); },
  'doc-edit': el => { const u = docById(el.dataset.id); docForm(u.kind, {}, u.id); },
  'do-receive': el => doReceive(docById(el.dataset.id)),
  'do-pack': el => doPack(docById(el.dataset.id)),
  'do-dispatch': el => doDispatch(docById(el.dataset.id)),
  'short-po': el => { const u = docById(el.dataset.id), l = u.lines[0], p = prod(l.pid); const made = draftCompPOs(p.bom.comps.filter(c=>onHand(prod(c.pid))<c.qty*l.qty).map(c=>({ p:prod(c.pid), q:c.qty*l.qty-onHand(prod(c.pid)) }))); closeModal(); toast(`Drafted ${made.join(', ')}`); render(); },
  'st-fill': el => { const u = docById(el.dataset.id); u.lines.forEach(l=>{ if(l.cnt==null) l.cnt = qtyAt(prod(l.pid), l.loc); }); docDrawer(u.id); },
  'rc-add': el => { const u = docById(el.dataset.id); u.costs.push({ name:'Duty & tariffs', amt:0 }); docDrawer(u.id); },
  'rc-method': el => { const u = docById(el.dataset.id); u.method = el.dataset.m; docDrawer(u.id); },
  'open-shipment': el => { closeDrawer(); typeof openShipment==='function' ? openShipment(el.dataset.id) : go('shipping'); }
});

/* Old single-product PO functions now create real Purchase Order documents */
createPO = p => { const pl = stitchPlan(p); const u = newDoc('Purchase Order', { status:'Draft', party:mfr(p.mfr).name, sup:p.mfr, wh:'CDC', lines:[{ pid:p.id, qty:Math.max(pl?.qty||0, suggestQty(p)), cost:p.cost, rcv:0 }], comments:'Drafted by Stitch' }); setUnitCost(u); syncPO(); toast(`${u.no} drafted · ${u.lines[0].qty} × ${p.sku}`, ()=>{ STOCK_UPDATES.splice(STOCK_UPDATES.indexOf(u),1); syncPO(); }); render(); return u; };
draftPOs = list => { const made = draftCompPOs(list.map(p=>({ p, q:Math.max(stitchPlan(p)?.qty||0, suggestQty(p)) }))); toast(`Drafted ${made.length} PO${made.length>1?'s':''}: ${made.join(', ')}`); render(); };
poModal = p => { if(p && p.po) docDrawer(p.po.doc); };
sendPO = p => { const u = p && p.po && docById(p.po.doc); if(u) runAct(u, 'send'); };
CMD['open-po'] = el => { const p = prod(el.dataset.id); if(p && p.po) docDrawer(p.po.doc); };
CMD['create-po'] = el => { closeMenu(); const p = prod(el.dataset.id); docForm('Purchase Order', { sup:p.mfr, party:mfr(p.mfr).name, lines:[{ pid:p.id, qty:Math.max(stitchPlan(p)?.qty||0, suggestQty(p)), cost:p.cost }] }); };
CMD['send-po'] = el => sendPO(prod(el.dataset.id));
CMD['receive-po'] = el => { closeModal(); const p = prod(el.dataset.id); if(p.po) receiveModal(docById(p.po.doc)); };

/* Create menu (header split button) and command palette */
const CREATE_ITEMS = [
  ['Sales','Sales Quote','request_quote','Sales quote'], ['Sales','Sales Order','shopping_bag','Sales order'],
  ['Purchasing','Purchase Order','shopping_cart','Purchase order'], ['Purchasing','Supplier Return','keyboard_return','Supplier return'],
  ['Production','Assembly','precision_manufacturing','Assembly / kit build'], ['Production','Disassembly','call_split','Disassembly'],
  ['Stock','Transfer','drive_file_move','Transfer'], ['Stock','Stock Take','inventory','Stock take']
];
createMenu = anchor => {
  let g0 = ''; const items = CREATE_ITEMS.map(([g,k,i,t])=>{ const h = g!==g0 ? `${g0?'<div class="msep"></div>':''}<div class="mh2">${g}</div>` : ''; g0 = g; return h + `<button class="mi" data-cmd="new-doc" data-k="${k}">${ic(i)}${t}</button>`; }).join('');
  openMenu(anchor, `${items}<div class="msep"></div><div class="mh2">Ledger</div><button class="mi" data-cmd="new-stock-update">${ic('swap_vert')}Stock update<span class="k">U</span></button><button class="mi" data-cmd="new-stock-update" data-a="Return">${ic('assignment_return')}Customer return</button><button class="mi" data-cmd="new-product">${ic('add_box')}Product</button><button class="mi" data-cmd="stitch-plan">${ic('auto_awesome')}Plan with Stitch</button>`);
};
CREATE_ITEMS.forEach(([g,k,i,t])=>PAL_ACT.push(['New '+t.toLowerCase(), i, 'new-doc:'+k]));
PAL_ACT.push(['Plan with Stitch', 'auto_awesome', 'stitch-plan']);
const _palAct = CMD['pal-act'];
CMD['pal-act'] = el => { const a = el.dataset.a || ''; if(a.startsWith('new-doc:')){ closePalette(); return docForm(a.slice(8)); } if(a==='stitch-plan'){ closePalette(); return CMD['stitch-plan'](); } return _palAct(el); };
