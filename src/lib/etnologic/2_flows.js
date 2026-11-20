/* ================= Seed documents ================= */
(function seedDocs(){
  const L = (pid, qty, extra={}) => Object.assign({ pid, qty, price:null, cost:null }, extra);
  // Purchase orders (from the products' existing open orders)
  const byPO = {}; PRODUCTS.forEach(p=>{ if(p.po){ (byPO[p.po.id] = byPO[p.po.id] || { po:p.po, ps:[] }).ps.push(p); } });
  Object.values(byPO).forEach(({po, ps})=>{ const u = newDoc('Purchase Order', { no:po.id, date:'2026-11-'+(po.status==='Draft'?'18':'12'), status:po.status, party:mfr(ps[0].mfr).name, sup:ps[0].mfr, eta:po.eta, wh:'CDC',
    lines: ps.map(p=>L(p.id, Math.round(po.qty/ps.length), { cost:p.cost, rcv:0 })), charges: po.status==='Draft'?[]:[{ name:'Inbound freight', basis:'flat', rate:po.id==='PO-2026-0418'?142:46.5 }] }); u.log = [{d:u.date, t:'Purchase Order created'}]; setUnitCost(u); });
  const rcv = newDoc('Purchase Order', { no:'PO-2026-0402', date:'2026-11-04', status:'Received', party:'Cotton Source Co.', sup:'cotton', eta:'2026-11-18', wh:'TUP', lines:[L('p01',120,{cost:6.4, rcv:120})], charges:[{ name:'Inbound freight', basis:'flat', rate:96 }], qty:120, loc:'E-02', comments:'Received complete. 5 cartons.' });
  rcv.log = [{d:'2026-11-18', t:'Received 120 into E-02'},{d:'2026-11-04', t:'Purchase Order created'}]; setUnitCost(rcv);
  const rv = newDoc('Purchase Order', { no:'PO-2026-0415', date:'2026-10-20', status:'Received', party:'Riverbend Leather', sup:'riverbend', eta:'2026-11-01', wh:'CDC', lines:[L('p20',36,{cost:16, rcv:36})], qty:36, loc:'B-04' }); setUnitCost(rv);
  newDoc('Purchase Order', { status:'Draft', party:'Gulf Coast Ink Supply', sup:'gulf', wh:'CDC', lines:[L('p31',640,{cost:0.35, rcv:0})], comments:'Drafted by Stitch — ink demand from planned hoodie runs.' });
  // Sales quotes
  newDoc('Sales Quote', { status:'Sent', party:'Oxford Gift House', channel:'Wholesale B2B', expires:'2026-12-03', lines:[L('p11',48,{price:10.25}),L('p12',48,{price:10.25}),L('p17',12,{price:14})], charges:[{ name:'LTL freight', basis:'per lb', rate:0.38 }], date:'2026-11-16' });
  newDoc('Sales Quote', { status:'Accepted', party:'Delta Hotel Group', channel:'Wholesale B2B', expires:'2026-12-10', lines:[L('p17',20,{price:18}),L('p21',20,{price:10.92})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], date:'2026-11-17' });
  newDoc('Sales Quote', { status:'Draft', party:'Magnolia Market Co-op', channel:'Wholesale B2B', expires:'2026-12-15', lines:[L('p16',60,{price:10})], date:'2026-11-19' });
  // Sales orders at every stage
  const so1 = newDoc('Sales Order', { status:'Invoiced', party:'Tupelo Outfitters', channel:'Wholesale B2B', date:'2026-11-12', lines:[L('p04',12,{price:27})], qty:-12, loc:'B-01', pay:'Paid', comments:'Shipped SHP-7778' });
  const so2 = newDoc('Sales Order', { status:'Open', party:'Oxford Gift House', channel:'Wholesale B2B', date:'2026-11-17', lines:[L('p13',24,{price:11}),L('p12',12,{price:11})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }] });
  const so3 = newDoc('Sales Order', { status:'Allocated', party:'Ava Thompson', channel:'Shopify', date:'2026-11-18', lines:[L('p01',2,{price:24}),L('p11',1,{price:22})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], pay:'Paid' });
  const so4 = newDoc('Sales Order', { status:'Picking', party:'Kim Nguyen', channel:'TikTok Shop', date:'2026-11-18', lines:[L('p26',1,{price:24}),L('p08',1,{price:24})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], pay:'Paid' });
  const so5 = newDoc('Sales Order', { status:'Packed', party:'Amazon FBA', channel:'Amazon', wh:'MEM', date:'2026-11-18', lines:[L('p25',6,{price:58})], pay:'Paid', box:'BOX-SHP-1210', weight:9.6 });
  const so6 = newDoc('Sales Order', { status:'Picked', party:'Tupelo Outfitters', channel:'Wholesale B2B', date:'2026-11-19', lines:[L('p39',2,{price:60}),L('p16',10,{price:10})], charges:[{ name:'Handling fee', basis:'flat', rate:4 }] });
  [so3, so4, so5, so6].forEach(u=>{ u.lines.forEach(l=>{ l.alloc = l.qty; l.picks = stockLines(l).flatMap(x=>planPicks(prod(x.pid), x.qty, u.wh)); if(['Picked','Packed'].includes(u.status)) l.picks.forEach(k=>k.done=true); }); });
  so4.lines[0].picks.forEach(k=>k.done=true);
  // Production
  newDoc('Assembly', { status:'Planned', date:'2026-11-19', due:'2026-11-24', wh:'CDC', loc:'B-01', lines:[L('p04',24)], comments:'Holiday hoodie run' });
  newDoc('Assembly', { status:'In progress', date:'2026-11-18', due:'2026-11-21', wh:'CDC', loc:'C-02', lines:[L('p17',12)], comments:'CNC batch 11-18' });
  newDoc('Assembly', { status:'Planned', date:'2026-11-19', due:'2026-11-27', wh:'CDC', loc:'B-03', lines:[L('p28',8)], comments:'Run #2, numbered tags' });
  newDoc('Disassembly', { status:'Draft', date:'2026-11-19', wh:'CDC', loc:'C-06', lines:[L('p38',2)], comments:'Unsold gift boxes — return coffee and coasters to stock' });
  // Returns, transfers, counts, recosting
  newDoc('Supplier Return', { status:'Draft', party:'Riverbend Leather', sup:'riverbend', ref:'PO-2026-0415', date:'2026-11-19', lines:[L('p20',2,{cost:16, loc:'B-04'})], reason:'Stitching defect', comments:'Stitching defect on 2 aprons' });
  newDoc('Transfer', { status:'In transit', date:'2026-11-18', from:'E-03', to:'M-01', lines:[L('p16',60)], comments:'Restock Memphis 3PL for Amazon' });
  newDoc('Transfer', { status:'Draft', date:'2026-11-19', from:'E-02', to:'A-01', lines:[L('p01',30)], comments:'Replenish fast pick face from overflow' });
  const st = newDoc('Stock Take', { status:'Counting', date:'2026-11-19', wh:'CDC', aisles:['C'], lines:[] });
  PRODUCTS.forEach(p=>p.locs.filter(l=>aisleOf(l.s)==='C').forEach(l=>st.lines.push({ pid:p.id, loc:l.s, sys:l.q, qty:l.q, cnt:null })));
  newDoc('Recost', { status:'Draft', date:'2026-11-19', ref:'PO-2026-0402', party:'Cotton Source Co.', method:'value', costs:[{ name:'Inbound freight', amt:96 },{ name:'Duty & tariffs', amt:38.4 }], lines:[L('p01',120,{cost:6.4})] });
  STOCK_UPDATES.filter(isDoc).forEach(setUnitCost);
  STOCK_UPDATES.sort((a,b)=> a.date<b.date?1:a.date>b.date?-1:0);
  syncPO();
})();

/* ================= Status flows and actions ================= */
const FLOW = {
  'Sales Quote':['Draft','Sent','Accepted','Converted'], 'Sales Order':['Open','Allocated','Picking','Picked','Packed','Dispatched','Invoiced'],
  'Purchase Order':['Draft','Sent','Confirmed','Partially received','Received'], 'Supplier Return':['Draft','Shipped','Credited'],
  'Assembly':['Planned','In progress','Completed'], 'Disassembly':['Draft','Completed'], 'Transfer':['Draft','In transit','Received'],
  'Stock Take':['Counting','Posted'], 'Recost':['Draft','Posted']
};
const ACTS = {
  'Sales Quote':[ {a:'send', t:'Send quote', i:'send', from:['Draft'], to:'Sent'}, {a:'accept', t:'Mark accepted', i:'check', from:['Sent'], to:'Accepted'}, {a:'convert', t:'Convert to sales order', i:'shopping_bag', from:['Sent','Accepted'], to:'Converted'}, {a:'decline', t:'Declined', i:'close', from:['Draft','Sent'], to:'Declined', ghost:1} ],
  'Sales Order':[ {a:'allocate', t:'Allocate stock', i:'inventory_2', from:['Open','Backordered'], to:'Allocated'}, {a:'pick', t:'Release to pick', i:'pan_tool_alt', from:['Allocated'], to:'Picking'}, {a:'pickall', t:'Confirm picked', i:'task_alt', from:['Picking'], to:'Picked'}, {a:'pack', t:'Pack', i:'package_2', from:['Picked'], to:'Packed'}, {a:'dispatch', t:'Dispatch', i:'local_shipping', from:['Packed'], to:'Dispatched'}, {a:'invoice', t:'Invoice', i:'receipt_long', from:['Dispatched'], to:'Invoiced'}, {a:'cancel', t:'Cancel order', i:'block', from:['Open','Backordered','Allocated'], to:'Cancelled', ghost:1} ],
  'Purchase Order':[ {a:'send', t:'Send to supplier', i:'send', from:['Draft'], to:'Sent'}, {a:'confirm', t:'Supplier confirmed', i:'check', from:['Sent'], to:'Confirmed'}, {a:'receive', t:'Receive', i:'move_to_inbox', from:['Sent','Confirmed','Partially received'], to:'Received'}, {a:'recost', t:'Recost', i:'price_change', from:['Partially received','Received'], to:null}, {a:'rtv', t:'Return to supplier', i:'keyboard_return', from:['Partially received','Received'], to:null, ghost:1}, {a:'cancel', t:'Cancel', i:'block', from:['Draft','Sent'], to:'Cancelled', ghost:1} ],
  'Supplier Return':[ {a:'ship', t:'Ship to supplier', i:'local_shipping', from:['Draft'], to:'Shipped'}, {a:'credit', t:'Credit received', i:'payments', from:['Shipped'], to:'Credited'} ],
  'Assembly':[ {a:'start', t:'Start', i:'play_arrow', from:['Planned'], to:'In progress'}, {a:'complete', t:'Complete', i:'task_alt', from:['Planned','In progress'], to:'Completed'}, {a:'cancel', t:'Cancel', i:'block', from:['Planned'], to:'Cancelled', ghost:1} ],
  'Disassembly':[ {a:'complete', t:'Complete disassembly', i:'call_split', from:['Draft'], to:'Completed'} ],
  'Transfer':[ {a:'dispatch', t:'Dispatch', i:'local_shipping', from:['Draft'], to:'In transit'}, {a:'receive', t:'Receive', i:'move_to_inbox', from:['In transit'], to:'Received'} ],
  'Stock Take':[ {a:'post', t:'Post counts', i:'task_alt', from:['Counting'], to:'Posted'} ],
  'Recost':[ {a:'post', t:'Post recost', i:'task_alt', from:['Draft'], to:'Posted'} ]
};
const actsFor = u => (ACTS[u.kind]||[]).filter(x=>x.from.includes(u.status));
const STATUS_C = { Draft:'gray', Open:'blue', Backordered:'amber', Sent:'blue', Accepted:'green', Converted:'gray', Declined:'gray', Allocated:'blue', Picking:'ai', Picked:'ai', Packed:'ai', Dispatched:'green', Invoiced:'green', Cancelled:'gray', Confirmed:'blue', 'Partially received':'amber', Received:'green', Shipped:'blue', Credited:'green', Planned:'gray', 'In progress':'ai', Completed:'green', 'In transit':'ai', Counting:'amber', Posted:'green', Logged:'gray' };

function after(u, msg){ logDoc(u, msg); setUnitCost(u); syncPO(); render(); if($('#drawer').classList.contains('open') && $('#drawer').dataset.doc===u.id) docDrawer(u.id); toast(msg); }
function runAct(u, a){
  const k = u.kind, R = RUN[k] && RUN[k][a]; if(!R) return;
  R(u);
}
const RUN = {
  'Sales Quote':{
    send:u=>{ u.status='Sent'; after(u, `${u.no} sent to ${u.party}`); },
    accept:u=>{ u.status='Accepted'; after(u, `${u.no} accepted`); },
    decline:u=>{ u.status='Declined'; after(u, `${u.no} declined`); },
    convert:u=>{ const so = newDoc('Sales Order', { status:'Open', party:u.party, channel:u.channel, ref:u.no, lines:u.lines.map(l=>({ pid:l.pid, qty:l.qty, price:l.price })), charges:(u.charges||[]).map(c=>({...c})) }); setUnitCost(so); u.status='Converted'; u.ref = so.no; logDoc(so, `Converted from ${u.no}`); after(u, `${u.no} converted to ${so.no}`); docDrawer(so.id); }
  },
  'Sales Order':{
    allocate:u=>{ let short = [];
      u.lines.forEach(l=>{ const need = stockLines(l); const ok = need.every(x=>{ const p = prod(x.pid); return !isStocked(p) || availableQty(p) >= x.qty; });
        if(ok){ l.alloc = l.qty; l.picks = need.filter(x=>isStocked(prod(x.pid))).flatMap(x=>planPicks(prod(x.pid), x.qty, u.wh)); } else { l.alloc = 0; l.picks = []; short.push(prod(l.pid).sku); } });
      if(short.length){ u.status='Backordered'; after(u, `${u.no} backordered — short ${short.join(', ')}. Stitch added it to replenishment.`); }
      else { u.status='Allocated'; after(u, `${u.no} allocated — stock reserved`); } },
    pick:u=>{ u.status='Picking'; after(u, `${u.no} released to pick — see Pick on Warehouse Management`); },
    pickall:u=>{ u.lines.forEach(l=>(l.picks||[]).forEach(k=>k.done=true)); u.status='Picked'; after(u, `${u.no} picked`); },
    pack:u=>packModal(u),
    dispatch:u=>dispatchModal(u),
    invoice:u=>{ u.status='Invoiced'; u.pay = u.pay||'Unpaid'; after(u, `${u.no} invoiced · ${money(docTotal(u))}`); },
    cancel:u=>{ u.status='Cancelled'; u.lines.forEach(l=>{ l.alloc=0; l.picks=[]; }); after(u, `${u.no} cancelled — allocation released`); }
  },
  'Purchase Order':{
    send:u=>{ u.status='Sent'; u.eta = u.eta || iso(new Date(TODAY.getTime() + mfr(u.sup).lead*864e5)); after(u, `${u.no} sent to ${mfr(u.sup).email}`); },
    confirm:u=>{ u.status='Confirmed'; after(u, `${u.no} confirmed by ${u.party}`); },
    receive:u=>receiveModal(u),
    recost:u=>recostModal(u),
    rtv:u=>docForm('Supplier Return', { party:u.party, sup:u.sup, ref:u.no, lines:u.lines.filter(l=>l.rcv).map(l=>({ pid:l.pid, qty:1, cost:l.cost, loc:prod(l.pid).locs[0]?.s })) }),
    cancel:u=>{ u.status='Cancelled'; after(u, `${u.no} cancelled`); }
  },
  'Supplier Return':{
    ship:u=>{ const moved = []; u.lines.forEach(l=>{ const p = prod(l.pid); takeFrom(p, l.qty, l.loc).forEach(t=>moved.push(t.s)); if(p.track==='Serial') u.serials = shipSerials(p, l.qty, u.no).join(', '); if(p.track==='Batch') u.lots = consumeLots(p, l.qty); });
      u.qty = -u.lines.reduce((a,l)=>a+l.qty,0); u.loc = [...new Set(moved)].join(', '); u.status='Shipped'; after(u, `${u.no} shipped to ${u.party} · stock reduced ${-u.qty}`); },
    credit:u=>{ u.status='Credited'; u.credit = lineSub(u); after(u, `${u.no} credited ${money(u.credit)}`); }
  },
  'Assembly':{
    start:u=>{ u.status='In progress'; after(u, `${u.no} started — components reserved`); },
    complete:u=>{ const l = u.lines[0], p = prod(l.pid); const short = p.bom.comps.filter(c=>onHand(prod(c.pid)) < c.qty*l.qty);
      if(short.length) return toast(`Can't complete — short ${short.map(c=>prod(c.pid).sku).join(', ')}`, null) || shortModal(u, short);
      u.used = p.bom.comps.map(c=>{ const cp = prod(c.pid); const lots = cp.track==='Batch' ? consumeLots(cp, c.qty*l.qty) : ''; takeFrom(cp, c.qty*l.qty); return { pid:c.pid, qty:c.qty*l.qty, cost:cp.cost, lots }; });
      const unit = +(u.used.reduce((a,x)=>a+x.qty*x.cost,0)/l.qty + (+p.bom.labor||0)).toFixed(2);
      avgIn(p, l.qty, unit); applyDelta(p, u.loc, l.qty); p.updated = todayISO; l.cost = unit;
      if(p.track==='Serial') u.serials = newSerials(p, l.qty, u.loc, u.no).join(', ');
      if(p.track==='Batch'){ const lot = 'LOT-'+u.no.split('-')[1]; BATCHES.push({ lot, pid:p.id, qty:l.qty, exp:iso(new Date(TODAY.getTime()+365*864e5)), loc:u.loc }); u.lots = lot; }
      u.qty = l.qty; u.status='Completed'; after(u, `${u.no} completed · +${l.qty} ${p.sku} into ${u.loc} at ${money(unit)}/unit`); },
    cancel:u=>{ u.status='Cancelled'; after(u, `${u.no} cancelled`); }
  },
  'Disassembly':{
    complete:u=>{ const l = u.lines[0], p = prod(l.pid); if(onHand(p) < l.qty) return toast(`Only ${onHand(p)} ${p.sku} on hand`);
      takeFrom(p, l.qty, u.loc); p.bom.comps.forEach(c=>{ const cp = prod(c.pid); applyDelta(cp, bestBin(cp, u.wh), c.qty*l.qty); cp.updated = todayISO; });
      u.qty = -l.qty; u.status='Completed'; after(u, `${u.no} completed · ${l.qty} ${p.sku} broken into components`); }
  },
  'Transfer':{
    dispatch:u=>{ const l = u.lines[0], p = prod(l.pid); if(qtyAt(p, u.from) < l.qty) return toast(`Only ${qtyAt(p,u.from)} at ${u.from}`); takeFrom(p, l.qty, u.from); u.loc = `${u.from}→${u.to}`; u.status='In transit'; after(u, `${u.no} dispatched · ${l.qty} ${p.sku} in transit to ${u.to}`); },
    receive:u=>{ const l = u.lines[0], p = prod(l.pid); applyDelta(p, u.to, l.qty); p.updated = todayISO; u.loc = `${u.from}→${u.to}`; u.status='Received'; after(u, `${u.no} received · ${l.qty} ${p.sku} at ${u.to}`); }
  },
  'Stock Take':{
    post:u=>{ let net = 0; u.lines.forEach(l=>{ if(l.cnt==null) return; const p = prod(l.pid); const d = l.cnt - qtyAt(p, l.loc); if(d) applyDelta(p, l.loc, d); p.locs = p.locs.filter(x=>x.q>0); p.lastCount = todayISO; net += d; l.var = d; });
      u.qty = net; u.status='Posted'; after(u, `${u.no} posted · net variance ${net>0?'+':''}${net}`); }
  },
  'Recost':{
    post:u=>{ const alloc = recostAlloc(u); alloc.forEach(x=>{ const p = prod(x.pid); x.before = p.cost; p.cost = +(p.cost + x.perUnit).toFixed(2); x.after = p.cost; p.updated = todayISO; });
      u.alloc = alloc; u.status='Posted'; const po = docByNo(u.ref); if(po) logDoc(po, `Recost ${u.no} posted`); after(u, `${u.no} posted · landed cost added to ${alloc.length} product${alloc.length>1?'s':''}`); }
  }
};
function recostAlloc(u){
  const add = (u.costs||[]).reduce((a,c)=>a+(+c.amt||0),0);
  const w = l => u.method==='qty' ? l.qty : u.method==='volume' ? l.qty*(prod(l.pid).vol||0) : l.qty*(l.cost||0);
  const tot = u.lines.reduce((a,l)=>a+w(l),0) || 1;
  return u.lines.map(l=>{ const share = add*w(l)/tot; return { pid:l.pid, qty:l.qty, share, perUnit: l.qty ? share/l.qty : 0 }; });
}
