/* ================= CAPABILITIES — create actions on the same four tables =================
   Products carry Supplier, Purchase Cost, Customer Pricing, Bill of Materials and Tracking as columns.
   Every create action (quote, order, PO, assembly, return, transfer, stock take) is a row in Stock Updates
   and moves real stock when its status advances. Pick, Pack and Dispatch are columns on Warehouse Management. */

Object.assign(TX_ICON, { 'Sales Quote':'request_quote', 'Sales Order':'shopping_bag', 'Purchase Order':'shopping_cart', 'Assembly':'precision_manufacturing', 'Disassembly':'call_split', 'Supplier Return':'keyboard_return', 'Stock Take':'inventory', 'Recost':'price_change', 'Consume':'package_2' });

/* --- Suppliers (same records as Manufacturer) --- */
MANUFACTURERS.push(
  { id:'gulf', name:'Gulf Coast Ink Supply', type:'Wholesale', email:'orders@gulfcoastink.example', lead:6, contact:'Rhonda Lee' },
  { id:'natchez', name:'Natchez Trace Hardwoods', type:'Wholesale', email:'sales@natchezhardwoods.example', lead:9, contact:'Eli Brooks' }
);
const SUP_META = { cotton:{terms:'Net 30', ontime:92, phone:'(662) 555-0141'}, magnolia:{terms:'Net 30', ontime:88, phone:'(601) 555-0177'}, riverbend:{terms:'Net 45', ontime:95, phone:'(615) 555-0112'}, packship:{terms:'Net 15', ontime:98, phone:'(901) 555-0190'}, delta:{terms:'Prepaid', ontime:90, phone:'(662) 555-0133'}, corinth:{terms:'Internal', ontime:97, phone:'(662) 555-0100'}, gulf:{terms:'Net 30', ontime:93, phone:'(228) 555-0155'}, natchez:{terms:'Net 30', ontime:86, phone:'(601) 555-0168'} };
MANUFACTURERS.forEach(m=>Object.assign(m, { terms:'Net 30', ontime:95, phone:'' }, SUP_META[m.id]||{}));

/* --- Components are products too (they live in the Product Catalog) --- */
const MAT = o => P(Object.assign({ area:'Materials', ftype:'Wholesale', status:'Internal', channels:[], labels:[], added:'2025-09-01', lastCount:'2026-11-05', updated:'2026-11-12', price:0, img:'box', desc:'Component — consumed by a Bill of Materials.' }, o));
PRODUCTS.push(
  MAT({ id:'p29', sku:'RM-HD-FLC-L', name:'Blank Fleece Hoodie — Heather / L', category:'Blanks', mfr:'cotton', cost:9.8, min:30, rq:60, vol:0.1, vel:2.2, img:'hoodie', locs:[{s:'B-05',q:40}] }),
  MAT({ id:'p30', sku:'RM-HD-FLC-M', name:'Blank Fleece Hoodie — Heather / M', category:'Blanks', mfr:'cotton', cost:9.8, min:30, rq:60, vol:0.1, vel:1.8, img:'hoodie', locs:[{s:'B-06',q:26}] }),
  MAT({ id:'p31', sku:'RM-INK-PLS-WHT', name:'Plastisol Ink — White (oz)', category:'Inks', mfr:'gulf', cost:0.35, min:200, rq:640, vol:0.002, vel:14, locs:[{s:'A-05',q:520}] }),
  MAT({ id:'p32', sku:'RM-WAL-BLK-4', name:'Walnut Blank 4×4', category:'Wood', mfr:'natchez', cost:1.1, min:48, rq:192, vol:0.008, vel:3.2, img:'coaster', locs:[{s:'C-05',q:96}] }),
  MAT({ id:'p33', sku:'RM-CORK-4', name:'Cork Pad 4in', category:'Wood', mfr:'packship', cost:0.12, min:100, rq:500, vol:0.001, vel:3.2, locs:[{s:'C-05',q:300}] }),
  MAT({ id:'p34', sku:'RM-OAK-FRM-1824', name:'Reclaimed Oak Frame Kit 18×24', category:'Frames', mfr:'natchez', cost:14, min:6, rq:24, vol:0.5, vel:0.4, img:'poster', locs:[{s:'D-06',q:9}] }),
  MAT({ id:'p35', sku:'RM-PAP-1824', name:'Archival Print Paper 18×24', category:'Paper', mfr:'packship', cost:3.2, min:20, rq:100, vol:0.02, vel:0.4, img:'poster', locs:[{s:'D-06',q:40}] }),
  MAT({ id:'p36', sku:'RM-JRN-CVR', name:'Linen Cover + Text Block', category:'Paper', mfr:'packship', cost:3.9, min:20, rq:100, vol:0.02, vel:0.25, img:'journal', locs:[{s:'C-06',q:30}] }),
  MAT({ id:'p37', sku:'RM-HD-ZIP-L', name:'Blank Zip Hoodie — Black / L', category:'Blanks', mfr:'cotton', cost:12.5, min:12, rq:36, vol:0.13, vel:1.1, img:'hoodie', locs:[{s:'E-04',q:10}] }),
  P({ id:'p38', sku:'KIT-COF-CST', name:'Coffee & Coaster Gift Box', area:'Home & Living', category:'Gift Sets', mfr:'corinth', ftype:'In-House', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'beans', price:46, cost:14.3, min:6, rq:12, vol:0.1, added:'2026-10-25', lastCount:'2026-11-05', updated:'2026-11-12', vel:0.5, desc:'Kit: House Blend 12oz + Walnut Coaster Set, packed in an 8×6×4 box.', locs:[{s:'C-06',q:4}] }),
  P({ id:'p39', sku:'BND-TEE-3PK-M', name:'Classic Tee 3-Pack — Black / M', area:'Apparel', category:'Bundles', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Amazon'], img:'tee_black', price:60, cost:19.2, min:0, rq:0, vol:0.15, added:'2026-06-01', lastCount:null, updated:'2026-11-12', vel:0.9, desc:'Bundle: three Classic Tees, picked from stock at order time.' }),
  P({ id:'p40', sku:'BND-CND-DUO', name:'Candle Duo — Lavender + Cedar', area:'Home & Living', category:'Bundles', mfr:'magnolia', ftype:'Wholesale', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'candle_lav', price:40, cost:16.5, min:0, rq:0, vol:0.12, added:'2026-09-15', lastCount:null, updated:'2026-11-12', vel:0.7, desc:'Bundle: one Lavender and one Cedar soy candle.' })
);
const BOM_SEED = {
  p04:{type:'Assembly', comps:[['p29',1],['p31',3]], labor:4.5}, p05:{type:'Assembly', comps:[['p30',1],['p31',3]], labor:4.5},
  p17:{type:'Assembly', comps:[['p32',4],['p33',4]], labor:1.5}, p15:{type:'Assembly', comps:[['p34',1],['p35',1]], labor:9},
  p21:{type:'Assembly', comps:[['p36',1]], labor:2}, p28:{type:'Assembly', comps:[['p37',1],['p31',4]], labor:5},
  p38:{type:'Kit', comps:[['p18',1],['p17',1],['p24',1]], labor:0.5},
  p39:{type:'Bundle', comps:[['p01',3]], labor:0}, p40:{type:'Bundle', comps:[['p11',1],['p12',1]], labor:0}
};
Object.entries(BOM_SEED).forEach(([id,b])=>{ prod(id).bom = { type:b.type, comps:b.comps.map(([pid,qty])=>({pid,qty})), labor:b.labor }; });
const TRACK_SEED = { p28:'Serial', p15:'Serial', p18:'Batch', p11:'Batch', p12:'Batch', p13:'Batch' };
PRODUCTS.forEach(p=>{ p.track = TRACK_SEED[p.id] || 'None'; });

const isBundle = p => !!(p && p.bom && p.bom.type==='Bundle');
const bundleAvail = p => Math.min(...p.bom.comps.map(c=>{ const cp = prod(c.pid); return Math.floor(Math.max(0, availableQty(cp))/c.qty); }));
const _stockStatus = stockStatus;
stockStatus = p => isBundle(p) ? (bundleAvail(p)>0 ? {k:'ok', t:'Bundle · '+bundleAvail(p)+' available', c:'blue'} : {k:'out', t:'Bundle · components out', c:'red'}) : _stockStatus(p);
const bomCost = p => p.bom ? p.bom.comps.reduce((a,c)=>a + c.qty*(prod(c.pid)?.cost||0), 0) + (+p.bom.labor||0) : null;

/* --- Customer pricing lives on the product --- */
const TIERS = ['Retail','Wholesale','Distributor'];
const tierDefault = (p, t) => t==='Retail' ? p.price : t==='Wholesale' ? +(p.price*0.5).toFixed(2) : +(p.price*0.42).toFixed(2);
function pricing(p){ if(!p.pricing) p.pricing = { tiers:Object.fromEntries(TIERS.map(t=>[t, tierDefault(p,t)])), breaks:[], customers:[] }; return p.pricing; }
PRODUCTS.forEach(pricing);
prod('p11').pricing.breaks.push({ tier:'Wholesale', min:48, price:10.25 }); prod('p12').pricing.breaks.push({ tier:'Wholesale', min:48, price:10.25 });
prod('p04').pricing.customers.push({ name:'Tupelo Outfitters', price:27 }); prod('p17').pricing.customers.push({ name:'Delta Hotel Group', price:18 });
function priceFor(p, custName, qty){
  const c = CUSTOMERS.find(x=>x.name===custName); const tier = c ? c.tier : 'Retail'; const pr = pricing(p);
  let price = pr.tiers[tier] ?? p.price, why = tier+' tier';
  pr.breaks.filter(b=>b.tier===tier && qty>=b.min && b.price<price).forEach(b=>{ price=b.price; why=`${tier} break ${b.min}+`; });
  const cs = pr.customers.find(x=>x.name===custName); if(cs && cs.price<price){ price = cs.price; why = 'Customer price'; }
  return { price, why };
}
const CUSTOMERS = [
  { name:'Tupelo Outfitters', tier:'Wholesale', email:'buyer@tupelooutfitters.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Oxford Gift House', tier:'Wholesale', email:'orders@oxfordgift.example', terms:'Net 15', channel:'Wholesale B2B' },
  { name:'Delta Hotel Group', tier:'Distributor', email:'procurement@deltahotels.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Magnolia Market Co-op', tier:'Wholesale', email:'buying@magnoliamarket.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Ava Thompson', tier:'Retail', email:'ava.t@example.com', terms:'Prepaid', channel:'Shopify' },
  { name:'Kim Nguyen', tier:'Retail', email:'kim.n@example.com', terms:'Prepaid', channel:'TikTok Shop' },
  { name:'Amazon FBA', tier:'Retail', email:'fba@amazon.example', terms:'Marketplace', channel:'Amazon' }
];

/* --- Freight & Charges presets (applied inside orders) --- */
const CHARGE_PRESETS = [
  { name:'Standard freight', basis:'flat', rate:9.95, side:'Sales' }, { name:'LTL freight', basis:'per lb', rate:0.38, side:'Both' },
  { name:'Handling fee', basis:'flat', rate:4, side:'Sales' }, { name:'Gift wrap', basis:'per unit', rate:2.5, side:'Sales' },
  { name:'Fuel surcharge', basis:'%', rate:2, side:'Both' }, { name:'Inbound freight', basis:'flat', rate:85, side:'Purchases' },
  { name:'Duty & tariffs', basis:'%', rate:6.5, side:'Purchases' }, { name:'Discount', basis:'%', rate:-5, side:'Sales' }
];

/* --- Serial & batch registers --- */
const SERIALS = [];
for(let i=1;i<=14;i++) SERIALS.push({ no:'ZH-'+String(i).padStart(4,'0'), pid:'p28', loc:'B-03', status:'In stock', doc:'Run #1' });
['DLT-041','DLT-042','DLT-043','DLT-044','DLT-045','DLT-046'].forEach(no=>SERIALS.push({ no, pid:'p15', loc:'D-02', status:'In stock', doc:'SU-10492' }));
const BATCHES = [
  { lot:'LOT-2234', pid:'p18', qty:onHand(prod('p18')), exp:'2027-02-15', loc:'C-03' },
  { lot:'LOT-C1109', pid:'p11', qty:onHand(prod('p11')), exp:'2028-11-01', loc:'C-01' },
  { lot:'LOT-C1110', pid:'p12', qty:onHand(prod('p12')), exp:'2028-11-01', loc:'C-01' }
];
const serialsIn = p => SERIALS.filter(s=>s.pid===p.id && s.status==='In stock');
const lotsOf = p => BATCHES.filter(b=>b.pid===p.id && b.qty>0).sort((a,b)=>a.exp<b.exp?-1:1);

/* --- Documents: every create action is a row in Stock Updates --- */
const DOC_PREFIX = { 'Sales Quote':'QT', 'Sales Order':'SO', 'Purchase Order':'PO', 'Assembly':'AS', 'Disassembly':'DA', 'Supplier Return':'SR', 'Transfer':'TR', 'Stock Take':'ST', 'Recost':'RC' };
const DOC_SEQ = { 'Sales Quote':1008, 'Sales Order':1046, 'Purchase Order':423, 'Assembly':52, 'Disassembly':3, 'Supplier Return':4, 'Transfer':10, 'Stock Take':12, 'Recost':7 };
const docNo = k => k==='Purchase Order' ? 'PO-2026-0'+(++DOC_SEQ[k]) : DOC_PREFIX[k]+'-'+String(++DOC_SEQ[k]).padStart(4,'0');
STOCK_UPDATES.forEach(u=>{ if(!u.status) u.status = 'Logged'; });
const isDoc = u => !!u.kind;
function newDoc(kind, o={}){
  const lines = o.lines || [];
  const u = su(Object.assign({ date:todayISO, type:kind, kind, pid:lines[0]?.pid || o.pid || 'p01', loc:'—', qty:0, unitCost:0, owner:'Etnologic Inc', status:'Draft', party:'', wh:'CDC', lines, charges:[], log:[], lots:'', comments:'' }, o));
  u.no = o.no || docNo(kind); u.log = u.log.length ? u.log : [{ d:todayISO, t:`${kind} created` }];
  STOCK_UPDATES.unshift(u); return u;
}
const docByNo = no => STOCK_UPDATES.find(u=>u.no===no);
const docById = id => STOCK_UPDATES.find(u=>u.id===id);
const docs = (kind, sts) => STOCK_UPDATES.filter(u=>u.kind===kind && (!sts || sts.includes(u.status)));
function logDoc(u, t){ u.log.unshift({ d:todayISO, t }); }
const lineSub = u => u.lines.reduce((a,l)=>a + l.qty*(l.price ?? l.cost ?? prod(l.pid)?.cost ?? 0), 0);
function chargeAmt(u, c){ const units = u.lines.reduce((a,l)=>a+l.qty,0); const lbs = u.lines.reduce((a,l)=>a+l.qty*(prod(l.pid)?.vol||0)*8,0); const sub = lineSub(u);
  return c.basis==='flat' ? c.rate : c.basis==='per unit' ? c.rate*units : c.basis==='per lb' ? c.rate*lbs : sub*c.rate/100; }
const chargesTotal = u => (u.charges||[]).reduce((a,c)=>a+chargeAmt(u,c),0);
const docTotal = u => lineSub(u) + chargesTotal(u);
function setUnitCost(u){ const units = u.lines.reduce((a,l)=>a+l.qty,0); u.unitCost = units ? +(u.lines.reduce((a,l)=>a+l.qty*(l.cost ?? prod(l.pid)?.cost ?? 0),0)/units).toFixed(2) : 0; u.pid = u.lines[0]?.pid || u.pid; }

/* explode bundles into components for stock purposes */
const stockLines = l => { const p = prod(l.pid); return isBundle(p) ? p.bom.comps.map(c=>({ pid:c.pid, qty:c.qty*l.qty, of:p.id })) : [{ pid:l.pid, qty:l.qty }]; };

/* --- Derived positions (real time) --- */
const ALLOC_STS = ['Allocated','Picking','Picked','Packed'];
const committedQty = p => docs('Sales Order', ALLOC_STS).reduce((a,u)=>a + u.lines.flatMap(stockLines).filter(x=>x.pid===p.id).reduce((s,x)=>s+x.qty,0), 0);
const onOrderQty = p => docs('Purchase Order', ['Sent','Confirmed','Partially received']).reduce((a,u)=>a + u.lines.filter(l=>l.pid===p.id).reduce((s,l)=>s+l.qty-(l.rcv||0),0), 0);
const inProdQty = p => docs('Assembly', ['Planned','In progress']).filter(u=>u.lines[0]?.pid===p.id).reduce((a,u)=>a+u.lines[0].qty,0);
const compDemand = p => docs('Assembly', ['Planned','In progress']).reduce((a,u)=>{ const fp = prod(u.lines[0].pid); return a + (fp.bom?.comps||[]).filter(c=>c.pid===p.id).reduce((s,c)=>s+c.qty*u.lines[0].qty,0); }, 0);
function availableQty(p){ if(!p) return 0; if(isBundle(p)) return bundleAvail(p); if(!isStocked(p)) return Infinity; return onHand(p) - committedQty(p) - compDemand(p); }
const backorderQty = p => docs('Sales Order', ['Open','Backordered']).reduce((a,u)=>a + u.lines.flatMap(stockLines).filter(x=>x.pid===p.id).reduce((s,x)=>s+x.qty,0), 0);

/* --- Stitch: forecasts + sales orders + production plans → purchasing decisions --- */
function stitchPlan(p){
  if(!isStocked(p)) return null;
  const lead = p.ftype==='In-House' ? Math.max(3, mfr(p.mfr).lead) : mfr(p.mfr).lead;
  const vel = p.vel || 0, fc = forecast30(p);
  const projected = onHand(p) - committedQty(p) - compDemand(p) - backorderQty(p) + onOrderQty(p) + inProdQty(p);
  const safety = Math.ceil(vel*7), rop = Math.ceil(vel*lead) + safety;
  const target = Math.ceil(vel*(lead+21)) + safety;
  const over = vel>0 ? projected > Math.max(vel*90, p.rq*2) : projected > p.rq*2 && projected>0;
  let flag = 'Healthy', qty = 0;
  if(projected < rop || projected < p.min){ flag = 'Understock'; qty = Math.max(p.rq||0, target - projected); }
  else if(over) flag = 'Overstock';
  const parts = [`forecast ${fc}/30d`]; if(committedQty(p)) parts.push(`${committedQty(p)} on sales orders`); if(backorderQty(p)) parts.push(`${backorderQty(p)} backordered`); if(compDemand(p)) parts.push(`${compDemand(p)} for production`); if(onOrderQty(p)) parts.push(`${onOrderQty(p)} on order`); if(inProdQty(p)) parts.push(`${inProdQty(p)} in production`);
  const cover = vel ? Math.round(projected/vel) : null;
  return { flag, qty, projected, rop, cover, make: p.ftype==='In-House' && p.bom && p.bom.type!=='Bundle', why: parts.join(' · ') + (cover!=null?(cover<0?' · short now':` · ${cover} days of cover`):'') };
}

/* keep the inventory 'Order ID' / 'Order Status' columns tied to real purchase orders */
function syncPO(){
  PRODUCTS.forEach(p=>{ p.po = null; });
  docs('Purchase Order', ['Draft','Sent','Confirmed','Partially received']).slice().reverse().forEach(u=>u.lines.forEach(l=>{ const p = prod(l.pid); if(p && !p.po) p.po = { id:u.no, status:u.status, qty:l.qty-(l.rcv||0), eta:u.eta, doc:u.id }; }));
}

/* --- Stock movement helpers --- */
function takeFrom(p, qty, prefer){
  const out = []; let need = qty;
  const bins = p.locs.filter(l=>l.q>0).sort((a,b)=> (b.s===prefer) - (a.s===prefer) || b.q - a.q);
  for(const l of bins){ if(need<=0) break; const t = Math.min(l.q, need); l.q -= t; need -= t; out.push({ s:l.s, q:t }); }
  p.locs = p.locs.filter(l=>l.q>0); p.updated = todayISO; return out;
}
function planPicks(p, qty, wh){
  const out = []; let need = qty;
  const bins = p.locs.filter(l=>l.q>0).sort((a,b)=> ((whOfAisle(aisleOf(b.s))?.id===wh) - (whOfAisle(aisleOf(a.s))?.id===wh)) || b.q - a.q);
  for(const l of bins){ if(need<=0) break; const t = Math.min(l.q, need); need -= t; out.push({ s:l.s, q:t, pid:p.id, done:false }); }
  return out;
}
function bestBin(p, wh){ const own = p.locs.find(l=>whOfAisle(aisleOf(l.s))?.id===wh); if(own) return own.s; const sh = allShelves().filter(s=>s.w.id===wh).sort((a,b)=>b.avail-a.avail)[0]; return sh ? sh.id : (p.locs[0]?.s || 'A-01'); }
function avgIn(p, q, cost){ const oh = onHand(p) || 0; p.cost = +(((oh*p.cost) + q*cost)/Math.max(1, oh+q)).toFixed(2); }
function consumeLots(p, qty){ const used = []; let need = qty; lotsOf(p).forEach(b=>{ if(need<=0) return; const t = Math.min(b.qty, need); b.qty -= t; need -= t; used.push(`${b.lot}×${t}`); }); return used.join(', '); }
function shipSerials(p, qty, ref){ const s = serialsIn(p).slice(0, qty); s.forEach(x=>{ x.status='Shipped'; x.doc=ref; }); return s.map(x=>x.no); }
function newSerials(p, qty, loc, ref){ const pre = p.sku.split('-').slice(0,2).map(x=>x[0]).join('') + '-'; const n0 = SERIALS.filter(s=>s.pid===p.id).length; const out = []; for(let i=1;i<=qty;i++){ const no = pre+String(n0+i).padStart(4,'0'); SERIALS.push({ no, pid:p.id, loc, status:'In stock', doc:ref }); out.push(no); } return out; }
