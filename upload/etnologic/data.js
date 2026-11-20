/* Seed data — single source of truth. Every view (catalog, inventory, stock, warehouse, shipping) reads these same records. */
const TODAY = new Date('2026-11-19T10:00:00');

const MANUFACTURERS = [
  { id:'printify', name:'Printify', type:'POD', email:'merchant-support@printify.example', lead:4, contact:'Merchant Support' },
  { id:'printful', name:'Printful', type:'POD', email:'ops@printful.example', lead:3, contact:'Ops Desk' },
  { id:'gelato', name:'Gelato', type:'POD', email:'partners@gelato.example', lead:5, contact:'Partner Team' },
  { id:'delta', name:'Delta Ceramics', type:'Dropship', email:'orders@deltaceramics.example', lead:6, contact:'Renee Holt' },
  { id:'magnolia', name:'Magnolia Candle Co.', type:'Wholesale', email:'wholesale@magnoliacandle.example', lead:10, contact:'Jim Parker' },
  { id:'cotton', name:'Cotton Source Co.', type:'Wholesale', email:'sales@cottonsource.example', lead:14, contact:'Ana Ruiz' },
  { id:'corinth', name:'Corinth Works', type:'In-House', email:'production@etnologic.example', lead:5, contact:'Shop Floor' },
  { id:'riverbend', name:'Riverbend Leather', type:'Wholesale', email:'trade@riverbend.example', lead:12, contact:'Cole Danner' },
  { id:'packship', name:'Pack&Ship Supply', type:'Wholesale', email:'reorder@packship.example', lead:4, contact:'Order Desk' }
];

const WAREHOUSES = [
  { id:'CDC', name:'Corinth DC', kind:'Owned', city:'Corinth, MS', aisles:['A','B','C','D'], shelvesPerAisle:6, cap:{A:5,B:6.5,C:4,D:12.5}, minLevel:{A:1,B:1,C:1,D:2} },
  { id:'TUP', name:'Tupelo Overflow', kind:'Owned', city:'Tupelo, MS', aisles:['E'], shelvesPerAisle:6, cap:{E:9}, minLevel:{E:0} },
  { id:'MEM', name:'Memphis 3PL · ShipBob', kind:'3PL', city:'Memphis, TN', aisles:['M'], shelvesPerAisle:4, cap:{M:18}, minLevel:{M:2}, sla:'Same-day before 2pm', fee:'$0.45 / unit / mo' }
];

const OWNERS = ['Marcus Bell','Tasha Reed','Devon Cho','Leah Ortiz','Etnologic Inc'];
const CHANNELS_ALL = ['Shopify','TikTok Shop','Etsy','Amazon','Wholesale B2B']; // user-defined; the system treats these as plain values
const LABELS_ALL = []; // Labels = POD / Dropship / Wholesale / In House manufactured (product.ftype)

function P(o){ return Object.assign({ status:'Published', labels:[], channels:[], locs:[], po:null, supplierQty:null, serialized:false }, o); }

const PRODUCTS = [
  P({ id:'p01', sku:'TEE-001-BLK-M', name:'Classic Tee — Black / M', area:'Apparel', category:'T-Shirts', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Etsy','TikTok Shop'], img:'tee_black', price:24, cost:6.4, min:40, rq:120, vol:0.05, added:'2025-03-02', lastCount:'2026-10-28', updated:'2026-11-18', vel:3.8, desc:'Heavyweight 6.1oz ringspun cotton crew. Pre-shrunk, side-seamed, tagless neck label.', locs:[{s:'A-01',q:46},{s:'E-02',q:120}] }),
  P({ id:'p02', sku:'TEE-001-BLK-L', name:'Classic Tee — Black / L', area:'Apparel', category:'T-Shirts', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Etsy','TikTok Shop'], img:'tee_black', price:24, cost:6.4, min:40, rq:120, vol:0.05, added:'2025-03-02', lastCount:'2026-10-28', updated:'2026-11-17', vel:3.1, desc:'Heavyweight 6.1oz ringspun cotton crew. Pre-shrunk, side-seamed, tagless neck label.', locs:[{s:'A-01',q:22}], po:{id:'PO-2026-0418', status:'Confirmed', qty:240, eta:'2026-11-26'} }),
  P({ id:'p03', sku:'TEE-002-WHT-M', name:'Heavyweight Tee — White / M', area:'Apparel', category:'T-Shirts', mfr:'cotton', ftype:'Wholesale', labels:[], channels:['Shopify','Etsy'], img:'tee_white', price:26, cost:6.9, min:30, rq:96, vol:0.05, added:'2025-04-11', lastCount:'2026-10-28', updated:'2026-11-12', vel:1.9, desc:'7.1oz boxy-fit tee in optic white. Double-needle hems.', locs:[{s:'A-02',q:64}] }),
  P({ id:'p04', sku:'HD-211-GRY-L', name:'Pullover Hoodie — Heather / L', area:'Apparel', category:'Hoodies', mfr:'corinth', ftype:'In-House', labels:['Seasonal'], channels:['Shopify','Wholesale B2B'], img:'hoodie', price:58, cost:17.5, min:20, rq:60, vol:0.12, added:'2025-09-14', lastCount:'2026-09-30', updated:'2026-11-16', vel:2.2, desc:'Screen printed in Corinth on 10oz fleece. Kangaroo pocket, ribbed cuffs.', locs:[{s:'B-01',q:18},{s:'B-02',q:9}] }),
  P({ id:'p05', sku:'HD-211-GRY-M', name:'Pullover Hoodie — Heather / M', area:'Apparel', category:'Hoodies', mfr:'corinth', ftype:'In-House', labels:['Seasonal'], channels:['Shopify','Wholesale B2B'], img:'hoodie', price:58, cost:17.5, min:20, rq:60, vol:0.12, added:'2025-09-14', lastCount:'2026-09-30', updated:'2026-11-15', vel:1.8, desc:'Screen printed in Corinth on 10oz fleece. Kangaroo pocket, ribbed cuffs.', locs:[{s:'B-02',q:41}] }),
  P({ id:'p06', sku:'POLO-W-01-GRN', name:'Women\u2019s Heather Polo — Sage', area:'Apparel', category:'Polos', mfr:'printify', ftype:'POD', labels:['New'], channels:['Shopify'], img:'polo', price:34, cost:14.2, min:0, rq:0, vol:0.06, added:'2026-10-02', lastCount:null, updated:'2026-11-10', vel:0.6, desc:'Printed on demand. Pique knit, 3-button placket.', status:'Draft' }),
  P({ id:'p07', sku:'TEE-AOP-WAVE', name:'All-Over Print Tee — Wave', area:'Apparel', category:'T-Shirts', mfr:'printful', ftype:'POD', labels:[], channels:['Shopify','TikTok Shop'], img:'tee_white', price:32, cost:13.1, min:0, rq:0, vol:0.05, added:'2026-05-21', lastCount:null, updated:'2026-11-14', vel:1.2, desc:'Sublimated all-over print, polyester blend, printed and shipped by Printful.' }),
  P({ id:'p08', sku:'CAP-DAD-NVY', name:'Washed Dad Cap — Navy', area:'Accessories', category:'Headwear', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Etsy','Amazon'], img:'cap', price:24, cost:5.8, min:25, rq:72, vol:0.1, added:'2025-02-18', lastCount:'2026-11-02', updated:'2026-11-18', vel:1.4, desc:'Garment-washed chino twill, brass buckle, unstructured 6-panel.', locs:[{s:'A-03',q:12}] }),
  P({ id:'p09', sku:'MUG-003-SPK', name:'Speckled Wayland Mug 12oz', area:'Drinkware', category:'Mugs', mfr:'delta', ftype:'Dropship', labels:['Fragile','Gift-ready'], channels:['Shopify','Etsy','TikTok Shop'], img:'mug', price:18, cost:6.1, min:30, rq:0, vol:0.08, added:'2025-01-09', lastCount:null, updated:'2026-11-18', vel:2.6, desc:'Hand-dipped speckled glaze stoneware. Dropshipped from Delta Ceramics, Memphis.', supplierQty:340 }),
  P({ id:'p10', sku:'MUG-004-MTE', name:'Matte Stoneware Mug 16oz', area:'Drinkware', category:'Mugs', mfr:'delta', ftype:'Dropship', labels:['Fragile'], channels:['Shopify'], img:'mug', price:22, cost:7.4, min:30, rq:0, vol:0.09, added:'2026-02-12', lastCount:null, updated:'2026-11-11', vel:0.9, desc:'Wide-mouth matte stoneware. Dropshipped.', supplierQty:18 }),
  P({ id:'p11', sku:'CND-SOY-LAV', name:'Soy Candle — Lavender 8oz', area:'Home & Living', category:'Candles', mfr:'magnolia', ftype:'Wholesale', labels:['Gift-ready','Bestseller'], channels:['Shopify','Etsy','Wholesale B2B'], img:'candle_lav', price:22, cost:8.25, min:24, rq:96, vol:0.06, added:'2025-05-30', lastCount:'2026-11-05', updated:'2026-11-18', vel:2.0, desc:'Hand-poured soy wax, cotton wick, 45-hour burn. Amber glass vessel.', locs:[{s:'C-01',q:42},{s:'M-01',q:60}] }),
  P({ id:'p12', sku:'CND-SOY-CED', name:'Soy Candle — Cedar 8oz', area:'Home & Living', category:'Candles', mfr:'magnolia', ftype:'Wholesale', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'candle_cedar', price:22, cost:8.25, min:24, rq:96, vol:0.06, added:'2025-05-30', lastCount:'2026-11-05', updated:'2026-11-18', vel:1.7, desc:'Hand-poured soy wax with cedarwood and vetiver.', locs:[{s:'C-01',q:4}], po:{id:'PO-2026-0421', status:'Sent', qty:96, eta:'2026-11-29'} }),
  P({ id:'p13', sku:'CND-SOY-VAN', name:'Soy Candle — Vanilla 8oz', area:'Home & Living', category:'Candles', mfr:'magnolia', ftype:'Wholesale', labels:['Seasonal'], channels:['Shopify'], img:'candle_lav', price:22, cost:8.25, min:24, rq:96, vol:0.06, added:'2025-10-01', lastCount:'2026-11-05', updated:'2026-11-17', vel:1.5, desc:'Madagascar vanilla and tonka.', locs:[] }),
  P({ id:'p14', sku:'PRT-FP-1218', name:'Framed Print 12×18 — Dunes', area:'Wall Art', category:'Framed Prints', mfr:'gelato', ftype:'POD', labels:['Fragile'], channels:['Shopify','Etsy'], img:'poster', price:64, cost:27.0, min:0, rq:0, vol:0.4, added:'2025-07-07', lastCount:null, updated:'2026-11-09', vel:0.5, desc:'Museum matte paper in a 0.8" black ash frame. Printed locally by Gelato.' }),
  P({ id:'p15', sku:'PRT-FP-1824', name:'Framed Print 18×24 — Delta', area:'Wall Art', category:'Framed Prints', mfr:'corinth', ftype:'In-House', labels:['Fragile','New'], channels:['Shopify','Wholesale B2B'], img:'poster', price:98, cost:31.0, min:8, rq:24, vol:0.7, added:'2026-08-15', lastCount:'2026-10-15', updated:'2026-11-13', vel:0.4, desc:'Framed in-house on reclaimed oak. Signed and numbered.', serialized:true, locs:[{s:'D-01',q:11},{s:'D-02',q:6}] }),
  P({ id:'p16', sku:'TOTE-CNV-NAT', name:'Canvas Tote — Natural', area:'Accessories', category:'Bags', mfr:'cotton', ftype:'Wholesale', labels:[], channels:['Shopify','Etsy','Wholesale B2B'], img:'tote', price:20, cost:4.1, min:30, rq:150, vol:0.04, added:'2025-03-19', lastCount:'2026-10-28', updated:'2026-11-08', vel:1.1, desc:'12oz natural canvas, 22" handles, interior pocket.', locs:[{s:'A-04',q:88},{s:'E-03',q:200}] }),
  P({ id:'p17', sku:'CST-WAL-4PK', name:'Walnut Coaster Set (4)', area:'Home & Living', category:'Coasters', mfr:'corinth', ftype:'In-House', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'coaster', price:28, cost:7.2, min:20, rq:60, vol:0.02, added:'2025-11-01', lastCount:'2026-11-05', updated:'2026-11-14', vel:0.8, desc:'CNC-cut walnut with cork base. Made in Corinth.', locs:[{s:'C-02',q:31}] }),
  P({ id:'p18', sku:'BNS-HOUSE-12', name:'House Blend Coffee 12oz', area:'Home & Living', category:'Pantry', mfr:'magnolia', ftype:'Wholesale', labels:['Seasonal'], channels:['Shopify'], img:'beans', price:16, cost:6.0, min:30, rq:120, vol:0.07, added:'2026-01-10', lastCount:'2026-11-05', updated:'2026-11-18', vel:2.4, desc:'Medium roast, whole bean. Best-by tracked by lot.', locs:[{s:'C-03',q:19}] }),
  P({ id:'p19', sku:'STK-PCK-PAS', name:'Sticker Pack — Pastel', area:'Stationery', category:'Stickers', mfr:'printify', ftype:'POD', labels:[], channels:['Shopify','TikTok Shop','Etsy'], img:'sticker', price:8, cost:2.1, min:0, rq:0, vol:0.005, added:'2025-06-06', lastCount:null, updated:'2026-11-12', vel:3.3, desc:'Kiss-cut vinyl sheet, printed on demand.' }),
  P({ id:'p20', sku:'APR-DNM-01', name:'Denim Work Apron', area:'Accessories', category:'Aprons', mfr:'riverbend', ftype:'Wholesale', labels:['New'], channels:['Shopify','Wholesale B2B'], img:'apron', price:48, cost:16.0, min:12, rq:36, vol:0.06, added:'2026-09-01', lastCount:'2026-10-15', updated:'2026-11-06', vel:0.3, desc:'12oz raw denim, leather cross-back straps, brass rivets.', locs:[{s:'B-04',q:27}] }),
  P({ id:'p21', sku:'JRN-LIN-SGE', name:'Linen Journal — Sage', area:'Stationery', category:'Notebooks', mfr:'corinth', ftype:'In-House', labels:[], channels:['Shopify','Etsy'], img:'journal', price:26, cost:6.8, min:15, rq:50, vol:0.03, added:'2026-03-03', lastCount:'2026-11-05', updated:'2026-11-03', vel:0.2, desc:'Lay-flat linen hardcover, 160 pages dot grid.', locs:[{s:'C-04',q:63}] }),
  P({ id:'p22', sku:'JRN-LIN-SND', name:'Linen Journal — Sand', area:'Stationery', category:'Notebooks', mfr:'corinth', ftype:'In-House', labels:['Clearance'], channels:['Shopify'], img:'journal', price:18, cost:6.8, min:15, rq:50, vol:0.03, added:'2025-08-03', lastCount:'2026-08-02', updated:'2026-09-21', vel:0.05, desc:'Lay-flat linen hardcover, 160 pages dot grid.', locs:[{s:'D-05',q:94}] }),
  P({ id:'p23', sku:'BOX-SHP-1210', name:'Shipping Box 12×10×4', area:'Packaging', category:'Boxes', mfr:'packship', ftype:'Wholesale', labels:[], channels:[], img:'box', price:0.9, cost:0.62, min:200, rq:500, vol:0.04, added:'2024-12-01', lastCount:'2026-11-12', updated:'2026-11-18', vel:22, desc:'32ECT kraft, flat-packed. Internal supply — not sold.', status:'Internal', locs:[{s:'D-03',q:260},{s:'D-04',q:180}] }),
  P({ id:'p24', sku:'BOX-SHP-0806', name:'Shipping Box 8×6×4', area:'Packaging', category:'Boxes', mfr:'packship', ftype:'Wholesale', labels:[], channels:[], img:'box', price:0.7, cost:0.48, min:200, rq:500, vol:0.03, added:'2024-12-01', lastCount:'2026-11-12', updated:'2026-11-18', vel:18, desc:'32ECT kraft, flat-packed. Internal supply — not sold.', status:'Internal', locs:[{s:'D-04',q:140}], po:{id:'PO-2026-0423', status:'Draft', qty:500, eta:null} }),
  P({ id:'p25', sku:'CND-SOY-LAV-3PL', name:'Soy Candle Gift Set (3)', area:'Home & Living', category:'Gift Sets', mfr:'magnolia', ftype:'Wholesale', labels:['Gift-ready','Seasonal'], channels:['Amazon','Shopify'], img:'candle_cedar', price:58, cost:22.0, min:20, rq:60, vol:0.2, added:'2026-10-20', lastCount:'2026-11-10', updated:'2026-11-18', vel:1.6, desc:'Lavender, Cedar, Vanilla 4oz trio. Fulfilled from Memphis 3PL for Amazon Prime.', locs:[{s:'M-02',q:74}] }),
  P({ id:'p26', sku:'TEE-001-BLK-XL', name:'Classic Tee — Black / XL', area:'Apparel', category:'T-Shirts', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Etsy','TikTok Shop','Amazon'], img:'tee_black', price:24, cost:6.4, min:30, rq:96, vol:0.05, added:'2025-03-02', lastCount:'2026-10-28', updated:'2026-11-18', vel:2.4, desc:'Heavyweight 6.1oz ringspun cotton crew.', locs:[{s:'A-02',q:30},{s:'M-03',q:40}] }),
  P({ id:'p27', sku:'MUG-CMP-ENM', name:'Enamel Camp Mug', area:'Drinkware', category:'Mugs', mfr:'printful', ftype:'POD', labels:[], channels:['Shopify'], img:'mug', price:21, cost:9.9, min:0, rq:0, vol:0.06, added:'2026-04-01', lastCount:null, updated:'2026-10-30', vel:0.4, desc:'Printed enamel steel, rolled rim.' }),
  P({ id:'p28', sku:'HD-ZIP-BLK-L', name:'Zip Hoodie — Black / L', area:'Apparel', category:'Hoodies', mfr:'corinth', ftype:'In-House', labels:['New','Serialized'], channels:['Shopify'], img:'hoodie', price:72, cost:22.0, min:12, rq:36, vol:0.13, added:'2026-11-01', lastCount:null, updated:'2026-11-18', vel:1.1, desc:'Limited run, numbered hang tags.', serialized:true, locs:[{s:'B-03',q:14}] })
];

const SHELF_NOTES = { 'A-01':'Fast pick face', 'A-02':'Fast pick face', 'D-03':'Bulk packaging', 'M-01':'Amazon FBA prep', 'E-02':'Overstock pallets' };

let SU_SEQ = 10480;
function su(o){ SU_SEQ++; return Object.assign({ id:'SU-'+SU_SEQ, auto:SU_SEQ-10000, usable:0, unusable:0, serials:'', comments:'', report:false }, o); }
const STOCK_UPDATES = [
  su({ date:'2026-11-18', type:'Receive', pid:'p01', loc:'E-02', qty:120, unitCost:6.4, owner:'Marcus Bell', comments:'PO-2026-0402 received complete. 5 cartons.' }),
  su({ date:'2026-11-18', type:'Ship', pid:'p23', loc:'D-03', qty:-38, unitCost:0.62, owner:'Tasha Reed', comments:'Daily packaging consumption' }),
  su({ date:'2026-11-18', type:'Return', pid:'p11', loc:'C-01', qty:3, usable:2, unusable:1, unitCost:8.25, owner:'Devon Cho', comments:'RMA-3312 — 1 cracked vessel, discarded.' }),
  su({ date:'2026-11-17', type:'Adjust', pid:'p12', loc:'C-01', qty:-2, unitCost:8.25, owner:'Leah Ortiz', comments:'Damaged in pick — wax melt.' }),
  su({ date:'2026-11-17', type:'Produce', pid:'p28', loc:'B-03', qty:14, unitCost:22, owner:'Etnologic Inc', serials:'ZH-0001, ZH-0002, ZH-0003, ZH-0004, ZH-0005, ZH-0006, ZH-0007, ZH-0008, ZH-0009, ZH-0010, ZH-0011, ZH-0012, ZH-0013, ZH-0014', comments:'Run #1 from Corinth Works.' }),
  su({ date:'2026-11-16', type:'Transfer', pid:'p26', loc:'M-03', qty:40, unitCost:6.4, owner:'Marcus Bell', comments:'Moved from A-02 to Memphis 3PL for Amazon.' }),
  su({ date:'2026-11-16', type:'Count', pid:'p08', loc:'A-03', qty:-3, unitCost:5.8, owner:'Tasha Reed', comments:'Cycle count variance −3. Investigate.' }),
  su({ date:'2026-11-15', type:'Ship', pid:'p04', loc:'B-01', qty:-12, unitCost:17.5, owner:'Devon Cho', comments:'Wholesale order WO-1182 · Tupelo Outfitters' }),
  su({ date:'2026-11-15', type:'Receive', pid:'p25', loc:'M-02', qty:80, unitCost:22, owner:'Leah Ortiz', comments:'Inbound to ShipBob, ASN 88213' }),
  su({ date:'2026-11-14', type:'Return', pid:'p01', loc:'A-01', qty:4, usable:4, unusable:0, unitCost:6.4, owner:'Devon Cho', comments:'Size exchange returns' }),
  su({ date:'2026-11-14', type:'Produce', pid:'p17', loc:'C-02', qty:24, unitCost:7.2, owner:'Etnologic Inc', comments:'CNC batch 11-14' }),
  su({ date:'2026-11-13', type:'Receive', pid:'p15', loc:'D-02', qty:6, unitCost:31, owner:'Marcus Bell', serials:'DLT-041, DLT-042, DLT-043, DLT-044, DLT-045, DLT-046', comments:'Framed in-house' }),
  su({ date:'2026-11-12', type:'Count', pid:'p23', loc:'D-03', qty:0, unitCost:0.62, owner:'Tasha Reed', comments:'Count matched system.' }),
  su({ date:'2026-11-11', type:'Adjust', pid:'p18', loc:'C-03', qty:-6, unitCost:6.0, owner:'Leah Ortiz', comments:'Lot 2210 past best-by. Written off.' }),
  su({ date:'2026-11-10', type:'Return', pid:'p04', loc:'B-02', qty:2, usable:1, unusable:1, unitCost:17.5, owner:'Devon Cho', comments:'1 print defect' }),
  su({ date:'2026-11-08', type:'Receive', pid:'p16', loc:'E-03', qty:200, unitCost:4.1, owner:'Marcus Bell', comments:'Bulk tote order' }),
  su({ date:'2026-11-05', type:'Count', pid:'p11', loc:'C-01', qty:1, unitCost:8.25, owner:'Tasha Reed', comments:'Found 1 behind shelf.' })
].reverse();

const SHIPMENTS = [
  { id:'SHP-7781', dir:'Outbound', ref:'#1042 · Shopify', party:'Ava Thompson · Oxford, MS', carrier:'USPS Ground Advantage', items:3, wh:'CDC', status:'Label created', eta:'2026-11-22', cost:7.85, weight:1.4 },
  { id:'SHP-7780', dir:'Outbound', ref:'#1041 · Etsy', party:'Ben Carter · Austin, TX', carrier:'UPS Ground', items:1, wh:'CDC', status:'In transit', eta:'2026-11-21', cost:9.12, weight:0.8 },
  { id:'SHP-7779', dir:'Outbound', ref:'AMZ-114-882 · Amazon', party:'Amazon customer · Nashville, TN', carrier:'ShipBob · UPS', items:1, wh:'MEM', status:'Delivered', eta:'2026-11-18', cost:6.40, weight:1.1 },
  { id:'SHP-7778', dir:'Outbound', ref:'WO-1182 · Wholesale', party:'Tupelo Outfitters · Tupelo, MS', carrier:'Local freight', items:12, wh:'CDC', status:'Delivered', eta:'2026-11-16', cost:38.00, weight:18 },
  { id:'SHP-7777', dir:'Outbound', ref:'#1039 · TikTok Shop', party:'Kim Nguyen · Atlanta, GA', carrier:'USPS Priority', items:2, wh:'CDC', status:'Exception', eta:'2026-11-19', cost:11.20, weight:1.2, note:'Address not found — carrier hold' },
  { id:'SHP-7776', dir:'Outbound', ref:'#1038 · Shopify', party:'Jordan Ellis · Memphis, TN', carrier:'Delta Ceramics (dropship)', items:2, wh:'Dropship', status:'In transit', eta:'2026-11-23', cost:0, weight:2.0 },
  { id:'INB-2214', dir:'Inbound', ref:'PO-2026-0418', party:'Cotton Source Co.', carrier:'FedEx Freight', items:240, wh:'CDC', status:'In transit', eta:'2026-11-26', cost:142.00, weight:28 },
  { id:'INB-2215', dir:'Inbound', ref:'PO-2026-0421', party:'Magnolia Candle Co.', carrier:'UPS Ground', items:96, wh:'CDC', status:'Awaiting pickup', eta:'2026-11-29', cost:46.50, weight:36 },
  { id:'INB-2216', dir:'Inbound', ref:'ASN 88240', party:'Corinth DC → ShipBob Memphis', carrier:'Own truck', items:60, wh:'MEM', status:'Scheduled', eta:'2026-11-24', cost:0, weight:22 }
];

const REPORTS = [
  { id:'AR-0031', title:'Weekly shrink & write-offs', date:'2026-11-17', owner:'Leah Ortiz', updates:['SU-10484','SU-10494'], body:'Two write-off events this week totaling $57.75 at cost. Candle damage in pick (Cedar, −2) and expired coffee lot 2210 (−6). Recommend: add wax-safe dividers on C-01 and switch coffee to FEFO picking.' },
  { id:'AR-0030', title:'Returns quality review', date:'2026-11-10', owner:'Devon Cho', updates:['SU-10483','SU-10495'], body:'5 units returned, 3 usable restocked, 2 unusable. Defect rate on hoodies 50% of returns — flagged print curing on press #2.' }
];

const RULES = [
  { id:'R1', on:true, name:'Reorder when below minimum', when:'Stock < Reorder level', cond:'Fulfillment is Wholesale or In-House', then:'Draft PO to manufacturer · Email owner', runs:14 },
  { id:'R2', on:true, name:'Dropship supplier low', when:'Supplier stock < 25', cond:'Fulfillment is Dropship', then:'Pause on TikTok Shop · Notify', runs:3 },
  { id:'R3', on:false, name:'Count overdue', when:'Last stock check > 30 days', cond:'Area is any', then:'Add to next cycle count', runs:0 },
  { id:'R4', on:true, name:'Shelf nearly full', when:'Shelf used > 90%', cond:'Warehouse is Corinth DC', then:'Suggest overflow move to Tupelo', runs:6 }
];

const BUNDLES = [
  { id:'b1', name:'Starter Kit', contains:['p01','p16','p19'], price:45, status:'Active' },
  { id:'b2', name:'Morning Coffee Set', contains:['p09','p17','p18'], price:52, status:'Draft' },
  { id:'b3', name:'Cozy Night In', contains:['p11','p21','p04'], price:96, status:'Active' }
];
const COLLECTIONS = [
  { id:'c1', name:'Holiday 2026', handle:'/collections/holiday-2026', type:'Automated', rule:'Label is Gift-ready', status:'Published' },
  { id:'c2', name:'Best Sellers', handle:'/collections/best-sellers', type:'Automated', rule:'Label is Bestseller', status:'Published' },
  { id:'c3', name:'Made in Corinth', handle:'/collections/made-in-corinth', type:'Automated', rule:'Fulfillment is In-House', status:'Published' },
  { id:'c4', name:'Fall Preview', handle:'/collections/fall-preview', type:'Manual', rule:'Hand-picked', status:'Draft', items:['p04','p05','p13'] }
];
const BRANDS = [
  { id:'br1', name:'Etnologic', domain:'etnologic.example', font:'Inter', color:'#111114', status:'Active' },
  { id:'br2', name:'Unsaid Goods', domain:'unsaidgoods.example', font:'Geist', color:'#3f6212', status:'Active' },
  { id:'br3', name:'Lakeside Studio', domain:'—', font:'Inter', color:'#1e3a8a', status:'Draft' }
];
const CHANNELS = [
  { id:'Shopify', kind:'Storefront', account:'etnologic.myshopify.com', status:'Connected', last:'2 min ago', issues:0 },
  { id:'TikTok Shop', kind:'Marketplace', account:'Etnologic US', status:'Needs sync', last:'45 min ago', issues:4 },
  { id:'Etsy', kind:'Marketplace', account:'EtnologicMade', status:'Failed', last:'2 hours ago', issues:2 },
  { id:'Amazon', kind:'Marketplace', account:'Etnologic · FBA via ShipBob', status:'Connected', last:'6 min ago', issues:0 },
  { id:'Wholesale B2B', kind:'Portal', account:'b2b.etnologic.example', status:'Connected', last:'1 hour ago', issues:0 }
];
const ROUTES = {
  'T-Shirts':[ {s:'Printful', b:'P', base:9.12, ship:3.50, lead:3}, {s:'Gelato', b:'G', base:8.80, ship:4.50, lead:5}, {s:'Printify', b:'Y', base:8.45, ship:4.75, lead:4}, {s:'Cotton Source Co. (blank, print in-house)', b:'C', base:6.40, ship:0.85, lead:14} ],
  'default':[ {s:'Printful', b:'P', base:11.2, ship:3.9, lead:3}, {s:'Gelato', b:'G', base:10.6, ship:4.6, lead:5}, {s:'Corinth Works (in-house)', b:'C', base:8.9, ship:0, lead:5} ]
};
