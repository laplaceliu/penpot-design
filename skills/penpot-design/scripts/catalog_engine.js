// catalog_engine.js — the standard 01–09 design-system contract.
//
// The user requirement this file enforces: pages 01–09 are the SAME design system across projects.
//   · 01–02: fixed token CAPACITY (counts per category) so the Foundations/Color boards keep one layout;
//     brand values (colors/fonts/radii/shadow values) still come from DESIGN.md.
//   · 03–09: one BLOCK PAGE per canonical family — `NN.MM · Chapter · Family·Spec` (CAT.BLOCKS). The family set,
//     canonical order and row/state baseline are the contract; the page is addressable by the board it contains.
//   · 10–17: free; source adaptation/profiles continue to work there. A profile MAY still change 03–09 geometry
//     (the project chose to keep profile behaviour), so board heights vary inside a block page.
//
// Seed:  load after component_factory + native_layout; call CAT.seed() once PageRoots exist.
// Build: scaffold_structure.js derives its page rows from CAT.BLOCKS, then CAT.buildPage({page:'03.01 · …'}) per page.
// Audit: CAT.audit() / CAT.pageIssues() / CAT.auditFor({page, root}); rule 62 `catalog_drift` calls auditFor, and
//        designCoverage calls pageIssues so a missing block page is a delivery failure.
return (function (storage, penpot, penpotUtils) {
  const CAT = storage.CATALOG = storage.CATALOG || {};
  CAT.VERSION = '1.2.0';
  CAT.PAGE_NAMES = {"03": "03 · Actions", "04": "04 · Text fields", "05": "05 · Selection & pickers", "06": "06 · Data & lists", "07": "07 · Display & metrics", "08": "08 · Navigation", "09": "09 · Overlays & feedback"};
  CAT.CAPACITY = { colors: 57, types: 12, spaces: 14, radii: 9, shadows: 13, dims: 2, strokes: 4, tones: 10 };
  CAT.PLAN = {"03":{"families":[{"key":"button","family":"Button","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Primary · XL","props":{"type":"primary","size":"xl","label":"Get started","lead":true}},{"label":"Default · XL","props":{"type":"default","size":"xl","label":"Start Free Trial","lead":true}},{"label":"Ghost · LG","props":{"type":"ghost","size":"lg","label":"Learn more"}}],"w":864,"cellH":64},{"key":"iconButton","family":"IconButton","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Primary · LG","props":{"type":"primary","shape":"circle","size":"lg","glyph":"arrowUp"}},{"label":"Ghost · MD","props":{"type":"ghost","shape":"circle","size":"md","glyph":"settings"}},{"label":"Secondary · SM","props":{"type":"secondary","shape":"circle","size":"sm","glyph":"share"}}],"w":864,"cellH":64},{"key":"buttonGroup","family":"ButtonGroup","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Primary first","props":{"size":"md","items":[{"label":"Day","type":"primary"},{"label":"Week","type":"default"},{"label":"Month","type":"default"}]}},{"label":"Default first","props":{"size":"lg","items":[{"label":"List","type":"default"},{"label":"Board","type":"default"},{"label":"Timeline","type":"default"}]}},{"label":"Ghost first","props":{"size":"md","items":[{"label":"All","type":"ghost"},{"label":"Mine","type":"default"}]}}],"w":1000,"cellH":60},{"key":"splitButton","family":"SplitButton","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Primary","props":{"type":"primary","size":"md","label":"Save"}},{"label":"Outlined","props":{"type":"default","size":"lg","label":"Export"}},{"label":"Ghost","props":{"type":"ghost","size":"sm","label":"More"}}],"w":1000,"cellH":60},{"key":"fab","family":"FAB","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Primary · MD","props":{"tone":"primary","size":"md"}},{"label":"Surface · SM","props":{"tone":"surface","size":"sm"}},{"label":"Branded · Extended","props":{"tone":"branded","size":"lg","extended":true,"label":"Create"}}],"w":864,"cellH":90},{"key":"link","family":"Link","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Inline underline","props":{"underline":true,"label":"Learn more"}},{"label":"Icon start","props":{"lead":true,"label":"Open docs"}},{"label":"Icon end","props":{"trail":true,"label":"All pages"}}],"w":864,"cellH":48},{"key":"segmented","family":"Segmented","cls":"toggle","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Monthly · Yearly","props":{"size":"md","items":["Monthly","Yearly"]}},{"label":"Ink","props":{"size":"lg","dark":true,"items":["Monthly","Yearly"]}},{"label":"Icon start","props":{"size":"md","lead":true,"items":["Grid","List"]}}],"w":1000,"cellH":56}]},"04":{"families":[{"key":"field","family":"Field","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Icon start","props":{"label":"Work email","lead":true,"value":"you@company.com","size":"md"}},{"label":"Icon end","props":{"label":"Work email","trail":true,"value":"you@company.com","size":"md"}},{"label":"Clear","props":{"label":"Work email","clear":true,"value":"you@company.com","size":"md"}}],"w":1000,"cellH":104},{"key":"input","family":"Input","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined · LG","props":{"variant":"outlined","size":"lg","placeholder":"you@company.com"}},{"label":"Filled · LG","props":{"variant":"filled","size":"lg","value":"hello@example.com"}},{"label":"Borderless · LG","props":{"variant":"borderless","size":"lg","value":"Workspace"}}],"w":1000,"cellH":88},{"key":"textarea","family":"Textarea","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","value":"Tell us about the project and the timeline."}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"A short brief."}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"No border, just text."}}],"w":1000,"cellH":136},{"key":"searchField","family":"Search","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","placeholder":"Search workflows"}},{"label":"Filled","props":{"variant":"filled","size":"md","placeholder":"Search workflows"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","placeholder":"Search workflows"}}],"w":1000,"cellH":88},{"key":"passwordField","family":"Password","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","value":"correct horse battery"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"correct horse battery"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"correct horse battery"}}],"w":1000,"cellH":88},{"key":"maskedInput","family":"MaskedInput","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","value":"4242 4242 4242 4242"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"4242 4242 4242 4242"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"4242 4242 4242 4242"}}],"w":1000,"cellH":88},{"key":"otpInput","family":"OTP","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"6 digits · resend","props":{"length":6,"size":"md","resend":true}},{"label":"4 digits","props":{"length":4,"size":"md"}},{"label":"8 digits","props":{"length":8,"size":"md"}}],"w":1000,"cellH":110},{"key":"numberField","family":"NumberField","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","value":"12"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"12"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"12"}}],"w":1000,"cellH":88},{"key":"upload","family":"Upload","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Dropzone idle","props":{"state":"default"}},{"label":"Dropzone dragging","props":{"dragging":true}},{"label":"Dropzone hover","props":{"state":"hover"}}],"w":1000,"cellH":240},{"key":"transfer","family":"Transfer","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"w":1000,"cellH":280,"rows":[{"label":"Search","props":{"withSearch":true}},{"label":"One way","props":{"oneWay":true}},{"label":"Search + one way","props":{"withSearch":true,"oneWay":true}}]},{"key":"tree","family":"Tree","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"w":1000,"cellH":260,"rows":[{"label":"Checkable","props":{"checkable":true}},{"label":"Async","props":{"async":true}},{"label":"Guides","props":{"guides":true}}]}]},"05":{"families":[{"key":"select","family":"Select","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","placeholder":"Select a workspace"}},{"label":"Filled","props":{"variant":"filled","size":"lg","value":"Workspace"}},{"label":"Borderless","props":{"variant":"borderless","size":"md","value":"Workspace"}}],"w":1000,"cellH":88},{"key":"combobox","family":"Combobox","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Default","props":{"size":"md","value":"Nex"}},{"label":"Large","props":{"size":"lg","value":"Nex"}},{"label":"Small","props":{"size":"sm","value":"Nex"}}],"w":1000,"cellH":110},{"key":"multiSelect","family":"MultiSelect","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","value":"Design, Product"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"Design, Product"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"Design, Product"}}],"w":1000,"cellH":104},{"key":"datePicker","family":"DatePicker","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","placeholder":"Pick a date"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"24 Oct 2026"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"24 Oct 2026"}}],"w":1000,"cellH":88},{"key":"timePicker","family":"TimePicker","cls":"field","axes":["default","hover","focus","error","disabled"],"rows":[{"label":"Outlined","props":{"variant":"outlined","size":"md","placeholder":"09:30"}},{"label":"Filled","props":{"variant":"filled","size":"md","value":"09:30"}},{"label":"Borderless","props":{"variant":"borderless","size":"lg","value":"09:30"}}],"w":1000,"cellH":88},{"key":"switch","family":"Switch","cls":"sel","axes":["default","hover","focus","disabled"],"rows":[{"label":"Labels","props":{"size":"md","labels":true}},{"label":"Small","props":{"size":"sm"}},{"label":"Icons","props":{"size":"md","icons":true}}],"w":1000,"cellH":56},{"key":"checkbox","family":"Checkbox","cls":"sel","axes":["default","hover","focus","disabled"],"rows":[{"label":"Checked","props":{"checked":true}},{"label":"Indeterminate","props":{"indeterminate":true}},{"label":"Unchecked","props":{}}],"w":1000,"cellH":52},{"key":"radio","family":"Radio","cls":"sel","axes":["default","hover","focus","disabled"],"rows":[{"label":"Selected","props":{"checked":true}},{"label":"Option","props":{}},{"label":"Card","props":{"card":true}}],"w":1000,"cellH":60},{"key":"slider","family":"Slider","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Continuous","props":{"value":40}},{"label":"Marks","props":{"marks":true,"value":40}},{"label":"Range","props":{"range":true,"value":[20,80]}}],"w":1000,"cellH":72},{"key":"rating","family":"Rating","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Half","props":{"value":3.5}},{"label":"Readonly","props":{"readonly":true,"value":4}},{"label":"Character","props":{"character":true,"value":4}}],"w":1000,"cellH":56},{"key":"colorPicker","family":"ColorPicker","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Hex trigger","props":{"showHex":true,"size":"md"}},{"label":"Swatch trigger","props":{"showHex":false,"size":"md"}},{"label":"Large hex","props":{"showHex":true,"size":"lg"}}],"w":1000,"cellH":160}]},"06":{"families":[{"key":"tableHeader","family":"TableHeader","cls":"display","axes":["default"],"rows":[{"label":"Sorted ascending","props":{"sort":"asc"}},{"label":"Sorted descending","props":{"sort":"desc"}},{"label":"Filter active","props":{"filter":true}}],"w":1760,"cellH":56},{"key":"tableRow","family":"TableRow","cls":"row","axes":["default","hover","selected","focus","disabled"],"rows":[{"label":"Default","props":{"density":"default"}},{"label":"Expandable","props":{"density":"middle","expandable":true}},{"label":"Editing","props":{"density":"dense","editing":true}}],"w":1760,"cellH":96},{"key":"tableState","family":"TableState","cls":"display","axes":["default"],"rows":[{"label":"Loading","props":{"loading":true}},{"label":"Empty","props":{"empty":true}},{"label":"Error","props":{"error":true}}],"w":1760,"cellH":220},{"key":"listItem","family":"ListItem","cls":"row","axes":["default","hover","selected","focus","disabled"],"rows":[{"label":"1 line","props":{"lines":1}},{"label":"2 line · avatar","props":{"lines":2,"trailing":"avatar"}},{"label":"3 line · menu","props":{"lines":3,"trailing":"menu"}}],"w":864,"cellH":120},{"key":"descriptions","family":"Descriptions","cls":"display","axes":["default"],"rows":[{"label":"Bordered · 2 col","props":{"bordered":true,"cols":2}},{"label":"Plain · 3 col","props":{"bordered":false,"cols":3}},{"label":"1 col","props":{"cols":1}}],"w":864,"cellH":240},{"key":"timeline","family":"Timeline","cls":"display","axes":["default"],"rows":[{"label":"Alternate","props":{"alternate":true}},{"label":"Label left","props":{"labelLeft":true}},{"label":"Default","props":{}}],"w":864,"cellH":220},{"key":"accordion","family":"Accordion","cls":"row","axes":["default","hover","selected","focus","disabled"],"rows":[{"label":"Bordered · single","props":{"ghost":false,"accordion":true}},{"label":"Ghost · single","props":{"ghost":true,"accordion":true}},{"label":"Bordered · multi","props":{"ghost":false,"accordion":false}}],"w":864,"cellH":160},{"key":"carousel","family":"Carousel","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Arrows","props":{"arrows":true}},{"label":"Dots","props":{"dots":true}},{"label":"Captions","props":{"captions":true}}],"w":864,"cellH":240},{"key":"miniCalendar","family":"MiniCalendar","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Range","props":{"range":true}},{"label":"No events","props":{"events":false}},{"label":"Default","props":{}}],"w":864,"cellH":280}]},"07":{"families":[{"key":"badge","family":"Badge","cls":"display","axes":["default"],"rows":[{"label":"Count","props":{"type":"count","text":"8","dot":false}},{"label":"Dot","props":{"dot":true}},{"label":"Status","props":{"status":"success","text":"Active","dot":true,"tone":"success"}}],"w":864,"cellH":48},{"key":"statusText","family":"StatusText","cls":"display","axes":["default"],"rows":[{"label":"Success","props":{"tone":"success"}},{"label":"Warning","props":{"tone":"warning"}},{"label":"Error","props":{"tone":"error"}}],"w":864,"cellH":44},{"key":"chip","family":"Chip","cls":"toggle","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Status","props":{"kind":"status","tone":"success","label":"Active"}},{"label":"Filter selected","props":{"kind":"filter","tone":"accent","selected":true,"label":"Design"}},{"label":"Input avatar","props":{"kind":"input","tone":"neutral","avatar":true,"label":"Maya"}}],"w":864,"cellH":56},{"key":"avatar","family":"Avatar","cls":"display","axes":["default"],"rows":[{"label":"Initials","props":{"size":"md","content":"initials"}},{"label":"Image · status","props":{"size":"lg","status":"online"}},{"label":"Editable","props":{"size":"sm","editable":true}}],"w":864,"cellH":100},{"key":"avatarGroup","family":"AvatarGroup","cls":"display","axes":["default"],"rows":[{"label":"Medium","props":{"size":"md","members":["MC","JL","AK","SR","TP"]}},{"label":"Large","props":{"size":"lg","members":["MC","JL","AK","SR","TP"]}},{"label":"Small","props":{"size":"sm","members":["MC","JL","AK","SR","TP"]}}],"w":864,"cellH":72},{"key":"card","family":"Card","cls":"row","axes":["default","hover","selected","focus"],"rows":[{"label":"Outlined","props":{"tone":"outlined"}},{"label":"Elevated · cover","props":{"tone":"elevated","cover":true}},{"label":"Filled · selectable","props":{"tone":"filled","selectable":true}}],"w":864,"cellH":320},{"key":"kpi","family":"KPI","cls":"display","axes":["default"],"rows":[{"label":"Delta","props":{"delta":12,"label":"Monthly revenue","value":"$48,290"}},{"label":"Sparkline","props":{"spark":true,"label":"Active users","value":"12,480"}},{"label":"Compact","props":{"compact":true,"label":"New signups","value":"1,842"}}],"w":864,"cellH":190},{"key":"progress","family":"Progress","cls":"display","axes":["default"],"rows":[{"label":"Line","props":{"type":"line","value":64}},{"label":"Circle","props":{"type":"circle","value":64}},{"label":"Steps","props":{"type":"steps","value":3}}],"w":864,"cellH":110},{"key":"skeleton","family":"Skeleton","cls":"display","axes":["default"],"rows":[{"label":"Text","props":{"variant":"text","w":240,"h":24}},{"label":"Rect","props":{"variant":"rect","w":240,"h":120}},{"label":"Circle","props":{"variant":"circle","w":48,"h":48}}],"w":864,"cellH":120},{"key":"emptyState","family":"EmptyState","cls":"display","axes":["default"],"rows":[{"label":"No data","props":{"kind":"noData"}},{"label":"No results","props":{"kind":"noResults"}},{"label":"Error","props":{"kind":"error"}}],"w":864,"cellH":240}]},"08":{"families":[{"key":"navItem","family":"NavItem","cls":"toggle","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Icon start","props":{"lead":true,"label":"Overview"}},{"label":"Rail","props":{"rail":true,"label":"Home"}},{"label":"Selected · submenu","props":{"selected":true,"submenu":true,"label":"Projects"}}],"w":1000,"cellH":64},{"key":"tabs","family":"Tabs","cls":"toggle","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Line","props":{"type":"line"}},{"label":"Card","props":{"type":"card"}},{"label":"Segmented","props":{"type":"segmented"}}],"w":1000,"cellH":64},{"key":"tabBand","family":"TabBand","cls":"display","axes":["default"],"rows":[{"label":"Line","props":{"type":"line"}},{"label":"Card · add","props":{"type":"card","add":true}},{"label":"Line · scroll","props":{"type":"line","scrollable":true}}],"w":1760,"cellH":64},{"key":"breadcrumb","family":"Breadcrumb","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Back","props":{"back":true}},{"label":"Truncated","props":{"truncated":true}},{"label":"Default","props":{}}],"w":1000,"cellH":48},{"key":"pagination","family":"Pagination","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Simple","props":{"simple":true}},{"label":"Quick jumper","props":{"quickJumper":true}},{"label":"Total","props":{"showTotal":true}}],"w":1000,"cellH":56},{"key":"steps","family":"Steps","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Dot","props":{"type":"dot"}},{"label":"Vertical","props":{"vertical":true}},{"label":"Error","props":{"error":true}}],"w":864,"cellH":140},{"key":"menu","family":"Menu","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Submenu","props":{"variant":"submenu"}},{"label":"Selectable","props":{"selectable":true}},{"label":"Context","props":{}}],"w":864,"cellH":240},{"key":"commandPalette","family":"CommandPalette","cls":"display","axes":["default"],"rows":[{"label":"Preview","props":{"preview":true}},{"label":"Default","props":{}},{"label":"Searching","props":{"state":"default"}}],"w":864,"cellH":320},{"key":"anchor","family":"Anchor","cls":"ctl","axes":["default","hover","focus","pressed","disabled"],"rows":[{"label":"Dots","props":{"dots":true}},{"label":"Counters","props":{"counters":true}},{"label":"Rail","props":{}}],"w":864,"cellH":180}]},"09":{"families":[{"key":"alert","family":"Alert","cls":"display","axes":["default"],"rows":[{"label":"Info","props":{"tone":"info"}},{"label":"Success · description","props":{"tone":"success","desc":true}},{"label":"Warning · banner","props":{"tone":"warning","banner":true}}],"w":1000,"cellH":120},{"key":"notification","family":"Notification","cls":"display","axes":["default"],"rows":[{"label":"Info","props":{"tone":"info"}},{"label":"Error · action","props":{"tone":"error","action":true}},{"label":"Success","props":{"tone":"success"}}],"w":864,"cellH":180},{"key":"toast","family":"Toast","cls":"display","axes":["default"],"rows":[{"label":"Success","props":{"tone":"success"}},{"label":"Error · action","props":{"tone":"error","action":true}},{"label":"Info · timed","props":{"tone":"info","duration":true}}],"w":864,"cellH":80},{"key":"tooltip","family":"Tooltip","cls":"display","axes":["default"],"rows":[{"label":"Top","props":{"placement":"top"}},{"label":"Bottom · title","props":{"placement":"bottom","withTitle":true,"title":"Keyboard shortcut"}},{"label":"Left · brand","props":{"placement":"left","brand":true}},{"label":"Right · light","props":{"placement":"right","surface":"light"}}],"w":864,"cellH":64,"gapY":8},{"key":"popover","family":"Popover","cls":"display","axes":["default"],"rows":[{"label":"Title","props":{"title":true}},{"label":"Actions","props":{"actions":true}},{"label":"Plain","props":{}}],"w":864,"cellH":180},{"key":"popconfirm","family":"Popconfirm","cls":"display","axes":["default"],"rows":[{"label":"Danger","props":{"tone":"danger"}},{"label":"Neutral","props":{"tone":"default"}},{"label":"With title","props":{"title":true}}],"w":864,"cellH":160},{"key":"modal","family":"Modal","cls":"display","axes":["default"],"rows":[{"label":"Confirm","props":{"confirm":true}},{"label":"Wide","props":{"width":"wide"}},{"label":"Large","props":{"size":"lg"}}],"w":864,"cellH":380},{"key":"drawer","family":"Drawer","cls":"display","axes":["default"],"rows":[{"label":"End","props":{"placement":"right"}},{"label":"Start","props":{"placement":"left"}},{"label":"Bottom","props":{"placement":"bottom"}}],"w":864,"cellH":380},{"key":"spin","family":"Spin","cls":"display","axes":["default"],"rows":[{"label":"Block","props":{"size":"md"}},{"label":"Label right","props":{"label":"Loading"}},{"label":"Container","props":{"container":true}}],"w":864,"cellH":120},{"key":"sheet","family":"Sheet","cls":"display","axes":["default"],"rows":[{"label":"Title","props":{"title":true}},{"label":"Cancel","props":{"title":true,"cancel":true}},{"label":"Options","props":{}}],"w":864,"cellH":300}]}};

  // plan entries are stored as { families:[…] }; expose the family array the readers use.
  Object.keys(CAT.PLAN).forEach((k) => { if (CAT.PLAN[k] && CAT.PLAN[k].families) CAT.PLAN[k] = CAT.PLAN[k].families; });
  // ---- block pages are the 03–09 standard (penpot-structure.md §2.3) ----
  // One page per canonical family, named `NN.MM · Chapter · <Family>·Spec`. `MM` is the 1-based position in
  // CAT.PLAN (the canonical order), not the board's current shelf position. The page list is derived here so
  // scaffold_structure.js, buildPage, the auditor and the library pairing all read ONE inventory.
  CAT.BLOCKS = [];
  Object.keys(CAT.PLAN).forEach((nn) => {
    const chapterName = String(CAT.PAGE_NAMES[nn] || nn).replace(/^\d{2} · /, '');
    CAT.PLAN[nn].forEach((f, i) => {
      const mm = String(i + 1).padStart(2, '0');
      CAT.BLOCKS.push({
        chapter: nn, chapterName: chapterName, index: i + 1, mm: mm,
        family: f.family, spec: f.family + '·Spec',
        page: nn + '.' + mm + ' · ' + chapterName + ' · ' + f.family + '·Spec',
        fam: f
      });
    });
  });
  CAT.blockFor = function (page) { const p = String(page || ''); return CAT.BLOCKS.filter((b) => b.page === p)[0] || null; };
  CAT.blockByFamily = function (chapter, family) {
    return CAT.BLOCKS.filter((b) => b.chapter === String(chapter) && b.family === String(family))[0] || null;
  };
  CAT.blockPages = function () { return CAT.BLOCKS.map((b) => b.page); };
  /** The canonical page SEQUENCE. Head 00–02 first, then the 67 block pages in `CAT.BLOCKS` order, then the numbered
      support pages 10–17. Extra support pages (e.g. a `Masters·` page) are not part of the sequence and may sit
      anywhere, so a re-paginated file is judged on the pages the contract actually names. */
  CAT.orderNames = function (names) {
    const all = (names || Array.from((penpot.currentFile && penpot.currentFile.pages) || []).map((p) => String(p.name)));
    const head = all.filter((n) => /^0[0-2] · /.test(n)).sort();
    const support = all.filter((n) => /^1[0-7] · /.test(n)).sort();
    const blocks = CAT.BLOCKS.map((b) => b.page).filter((p) => all.indexOf(p) >= 0);
    return head.concat(blocks, support);
  };
  /** Order half of the pagination gate: the contract pages must appear in that sequence. Reordering by hand, or
      appending a page with `createPage()` (which always lands last), is invisible to every per-page audit. */
  CAT.orderIssues = function (names) {
    const out = [];
    const all = (names || Array.from((penpot.currentFile && penpot.currentFile.pages) || []).map((p) => String(p.name)));
    const want = CAT.orderNames(all);
    const seen = {};
    want.forEach((n, i) => { seen[n] = i; });
    const live = all.filter((n) => Object.prototype.hasOwnProperty.call(seen, n));
    for (let i = 1; i < live.length; i++) {
      if (seen[live[i]] < seen[live[i - 1]]) {
        out.push({ page: live[i], detail: 'page order drift: "' + live[i] + '" (' + (i + 1) + '/' + live.length +
          ' in the file) precedes "' + live[i - 1] + '" but the contract puts it at position ' + (seen[live[i]] + 1) +
          ' of ' + live.length + ' — reorder the pages list (UI drag; the plugin API has no page-move call)' });
        return out;
      }
    }
    return out;
  };
  /** File-level pagination gate: every canonical family page exists exactly once, every 03–09 chapter shell is
      gone, and the contract pages sit in canonical order. Support pages (no canonical ·Spec, e.g. a `Masters·`
      page) are allowed; a chapter page that still holds ·Spec boards is the pre-pagination shape and is reported. */
  CAT.pageIssues = function () {
    const out = [];
    const pages = Array.from((penpot.currentFile && penpot.currentFile.pages) || []);
    const byName = {};
    pages.forEach((p) => { byName[String(p.name)] = p; });
    CAT.BLOCKS.forEach((b) => {
      if (!byName[b.page]) out.push({ page: b.page, detail: 'missing standard block page "' + b.page + '" — 03–09 are one page per family (CAT.BLOCKS, ' + CAT.BLOCKS.length + ' pages)' });
    });
    pages.forEach((p) => {
      const nm = String(p.name);
      if (!/^0[3-9](?:\.| ·)/.test(nm)) return;
      const pr = Array.from((p.root && p.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name)));
      if (!pr) { out.push({ page: nm, detail: nm + ' has no PageRoot — page anatomy is broken' }); return; }
      const specs = Array.from(pr.children || []).filter((c) => c.type === 'board' && /·Spec(?:·|$)/.test(String(c.name)));
      const b = CAT.blockFor(nm);
      if (/^0[3-9] · /.test(nm)) {
        out.push({ page: nm, detail: 'chapter page "' + nm + '" still exists with ' + specs.length + ' ·Spec board(s); the 03–09 standard is one block page per family — migrate to ' + CAT.BLOCKS.filter((x) => x.chapter === nm.slice(0, 2)).length + ' `NN.MM · Chapter · Family·Spec` pages' });
      } else if (!b && specs.length) {
        out.push({ page: nm, detail: nm + ' holds ' + specs.length + ' ·Spec board(s) but is not a canonical block page — support pages must not carry family specs' });
      }
    });
    return out.concat(CAT.orderIssues(pages.map((p) => String(p.name))));
  };
  CAT.q = CAT.q || {}; CAT.shelf = CAT.shelf || {}; CAT.report = CAT.report || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefix = (p) => String(p || '').slice(0, 2);
  function pageRoot(page) {
    const pg = penpotUtils.getPageByName(page);
    if (!pg) return null;
    return Array.from((pg.root && pg.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name))) || null;
  }
  CAT.pageFams = function (p) {
    const b = CAT.blockFor(p);
    if (b) return [b.family];
    const k = prefix(p);
    return (CAT.PLAN[k] || []).map((f) => f.family);
  };
  CAT.planFor = function (p) { const b = CAT.blockFor(p); if (b) return [b.fam]; return CAT.PLAN[prefix(p)] || []; };

  /** Re-shelve every canonical ·Spec board from its CURRENT measured size, in canonical family order.
      This is the repair for the stale-shelf class: an auto-height spec can grow AFTER the shelf step was written
      (TK.bindBoard rewrites fonts/leading; text grows; the hug height follows), so later boards end up overlapping.
      Idempotent: a correctly packed page moves nothing. The shelf geometry (80 / 208 / 32) is the page contract. */
  CAT.reflowPage = function (o) {
    o = o || {};
    const page = o.page || (penpot.currentPage && penpot.currentPage.name);
    const pr = pageRoot(page); if (!pr) return { err: 'no PageRoot on ' + page };
    const plan = CAT.planFor(page); if (!plan.length) return { err: 'not a standard page: ' + page };
    // every step lands on the 4px grid: a caller's odd start y (a build placed at `prevY + prevH + gap` with an odd
    // measured height) used to leave the next board at y=1965 and gate `off_grid` indicted a sheet nobody had moved.
    const gap = Math.ceil((o.gap === undefined ? 32 : o.gap) / 4) * 4, maxW = o.maxW || 1760;
    const startX = Math.ceil((o.x === undefined ? 80 : o.x) / 4) * 4, startY = Math.ceil((o.y === undefined ? 208 : o.y) / 4) * 4;
    const order = {}; plan.forEach((f, i) => { order[String(f.family).toLowerCase()] = i; });
    const specs = Array.from(pr.children || []).filter((b) => b.type === 'board' && /·Spec(?:·|$)/.test(String(b.name)) && order[String(b.name).split('·')[0].toLowerCase()] !== undefined);
    specs.sort((a, b) => order[String(a.name).split('·')[0].toLowerCase()] - order[String(b.name).split('·')[0].toLowerCase()]);
    let x = startX, y = startY, rowH = 0, moved = 0; const rows = [];
    specs.forEach((b) => {
      const w = Math.round(b.width), h = Math.round(b.height);
      if (x + w > startX + maxW && x > startX) { x = startX; y += rowH + gap; rowH = 0; }
      const nx = pr.x + x, ny = pr.y + y;
      const dx = nx - b.x, dy = ny - b.y;
      // Penpot layout children store x/y RELATIVE to their parent ("absolute" only opts out of flow), so moving the
      // spec board moves its whole subtree. Moving descendants too double-shifts them (measured 2026-10-26: a +500
      // shelf move put every host at +1000). The board is the only write this repair needs.
      if (dx || dy) { try { b.x = nx; b.y = ny; moved++; } catch (e) {} }
      rows.push({ family: String(b.name).split('·')[0], x: x, y: y, w: w, h: h });
      x = Math.ceil((x + w + gap) / 4) * 4;
      rowH = Math.max(rowH, Math.ceil(h / 4) * 4);
    });
    let fit = null;
    if (storage.FN && storage.FN.fitRoot) { try { fit = storage.FN.fitRoot(page); } catch (e) {} }
    return { page: page, boards: specs.length, moved: moved, rows: rows, fit: fit, dry: !!o.dry };
  };
  function cellsFor(cls, axes) {
    return axes.map((a) => a === 'error' ? { state: 'default', status: 'error' } : (a === 'readonly' ? { state: 'readonly' } : { state: a }));
  }
  /** Fixed token capacity. Names/values are brand-configurable; the capacity is the layout contract. */
  CAT.tokenDrift = function (decl) {
    decl = decl || {};
    const out = [];
    const counts = decl.counts || {};
    ['colors', 'types', 'spaces', 'radii', 'shadows', 'dims'].forEach((k) => {
      const want = CAT.CAPACITY[k], got = counts[k];
      if (got !== want) out.push({ detail: 'token capacity ' + k + '=' + got + ', standard is ' + want + ' — 01/02 would change layout' });
    });
    const cols = (decl.colors || []).map((c) => String(c.name || '').replace(/^color\./, ''));
    const strokes = cols.filter((n) => /border|divider|outline/i.test(n)).length;
    if (strokes !== CAT.CAPACITY.strokes) out.push({ detail: 'border/divider colour roles=' + strokes + ', standard is ' + CAT.CAPACITY.strokes + ' — the Strokes board would change height' });
    const tones = cols.filter((n) => {
      const ink = cols.indexOf(n + '-ink') >= 0 || cols.indexOf(n + 'Ink') >= 0;
      const soft = cols.indexOf(n + '-soft') >= 0 || cols.indexOf(n + '-wash') >= 0 || cols.indexOf(n + 'Soft') >= 0 || cols.indexOf(n + 'Wash') >= 0;
      return ink && soft;
    }).length;
    if (tones !== CAT.CAPACITY.tones) out.push({ detail: 'semantic tone triples=' + tones + ', standard is ' + CAT.CAPACITY.tones + ' — the Semantic roles board would change height' });
    return out;
  };
  /** Canonical family set + order on one standard-system page. Shapes are returned so audit_design can report them. */
  CAT.auditFor = function (o) {
    o = o || {};
    const p = prefix(o.page);
    const out = [];
    if (p === '01' && storage.TK && storage.TK.declared) {
      CAT.tokenDrift(storage.TK.declared(true)).forEach((d) => out.push({ shape: null, detail: d.detail }));
    }
    if (!o.root || !/^0[3-9](?:\.| ·)/.test(String(o.page))) return out;
    const allSpecs = Array.from(o.root.children || []).filter((c) => c.type === 'board' && /·Spec(?:·|$)/.test(String(c.name)));
    const block = CAT.blockFor(o.page);
    if (block) {
      const mine = allSpecs.filter((c) => String(c.name).split('·')[0] === block.family);
      const extras = allSpecs.filter((c) => String(c.name).split('·')[0] !== block.family);
      if (!mine.length) out.push({ shape: null, detail: 'block page "' + block.page + '" must hold exactly one ' + block.spec + ' board — none found' });
      if (mine.length > 1) out.push({ shape: mine[1], detail: 'block page "' + block.page + '" holds ' + mine.length + ' copies of ' + block.spec + ' — exactly one board per page' });
      mine.concat(extras).forEach((b) => {
        if (String(b.name) !== block.spec) out.push({ shape: b, detail: 'block page "' + block.page + '" holds "' + String(b.name) + '"; the page suffix and the board must both be "' + block.spec + '" (the page is addressable by the thing it contains)' });
      });
      return out;
    }
    if (/^0[3-9] · /.test(String(o.page))) {
      out.push({ shape: allSpecs[0] || null, detail: 'chapter page "' + o.page + '" still carries ' + allSpecs.length + ' ·Spec board(s); the 03–09 standard is one block page per family — migrate to `NN.MM · Chapter · Family·Spec` pages (CAT.BLOCKS)' });
      return out;
    }
    // A support page (e.g. `07.11 … · Masters·Chip`) may carry no family spec; it may not smuggle one in.
    if (allSpecs.length) out.push({ shape: allSpecs[0], detail: '"' + o.page + '" is not a canonical block page but carries ' + allSpecs.length + ' ·Spec board(s) — family specs live only on their CAT.BLOCKS page' });
    return out;
  };
  CAT.planIssues = function () {
    const seen = {}, out = [];
    Object.keys(CAT.PLAN).forEach((p) => {
      const local = {};
      CAT.PLAN[p].forEach((f) => {
        if (local[f.family]) out.push({ page: p, detail: 'duplicate family ' + f.family + ' appears twice on ' + p + ' — one ·Spec master per family' });
        local[f.family] = 1;
        if (seen[f.family]) out.push({ page: p, detail: 'family ' + f.family + ' is on both ' + seen[f.family] + ' and ' + p + ' — one family belongs to exactly one standard page' });
        else seen[f.family] = p;
      });
    });
    return out;
  };
  CAT.audit = function () {
    const plan = CAT.planIssues();
    const tokens = (storage.TK && storage.TK.declared ? CAT.tokenDrift(storage.TK.declared(true)) : [{ detail: 'TK not seeded' }]).concat(plan);
    const pages = CAT.BLOCKS.map((b) => {
      const pr = pageRoot(b.page);
      return { page: b.page, findings: pr ? CAT.auditFor({ page: b.page, root: pr }) : [{ detail: 'missing standard block page or its PageRoot: ' + b.page }] };
    });
    const fileFindings = CAT.pageIssues();
    const all = tokens.concat(...pages.map((x) => x.findings), fileFindings);
    return { verdict: all.length ? 'NEEDS_REPAIR' : 'CLEAN', plan: plan, tokens: tokens, pages: pages, file: fileFindings, findings: all };
  };
  CAT.seed = function (root) {
    CAT.active = true;
    const payload = JSON.stringify({ version: CAT.VERSION, capacity: CAT.CAPACITY });
    let n = 0;
    const roots = root ? [root] : [];
    // `currentFile.pages` is a collection proxy: its own forEach iterates lazily (measured 2026-10-24 — one root),
    // while Array.from materializes all 18. Convert first, never call the collection's forEach directly.
    try { Array.from((penpot.currentFile && penpot.currentFile.pages) || []).forEach((p) => { const pr = Array.from((p.root && p.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name))); if (pr) roots.push(pr); }); } catch (e) {}
    // Only the OPEN page's shapes accept a write in this plugin build (measured 2026-10-24: 18 roots iterated, one
    // stamped). So `seed()` is the per-page stamp; `buildPage` stamps the page it builds, which is what makes the
    // 03–09 contract durable without opening every page up front.
    roots.forEach((pr) => { try { pr.setPluginData('nl:cat', payload); n++; } catch (e) {} });
    return { seeded: 'CATALOG', version: CAT.VERSION, capacity: CAT.CAPACITY, stamped: n, note: 'stamps the open page; buildPage stamps each standard page it builds' };
  };
  CAT.hydrate = function () {
    try { const pr = penpotUtils.findShape && penpotUtils.findShape((s) => /-PageRoot$/.test(String(s.name))); const raw = pr && pr.getPluginData ? pr.getPluginData('nl:cat') : null; if (raw) { CAT.active = true; return JSON.parse(raw); } } catch (e) {}
    return null;
  };
  /** Build one standard page, one canonical family at a time. */
  CAT.buildPage = async function (o) {
    o = o || {};
    const page = o.page; const p = prefix(page); const plan = CAT.planFor(page);
    if (/^0[3-9] · /.test(String(page))) {
      const first = CAT.BLOCKS.filter((b) => b.chapter === String(page).slice(0, 2))[0];
      return { err: '03–09 are one page per family in the standard: build "' + (first ? first.page : 'NN.MM · Chapter · Family·Spec') + '" (CAT.BLOCKS / scaffold rows), not the chapter page "' + page + '"' };
    }
    if (!plan.length) return { err: 'no standard catalogue for page ' + page };
    const pr = pageRoot(page); if (!pr) return { err: 'no PageRoot on ' + page };
    try { pr.setPluginData('nl:cat', JSON.stringify({ version: CAT.VERSION, capacity: CAT.CAPACITY })); } catch (e) {}
    if (penpot.currentPage.name !== page) { const pg = penpotUtils.getPageByName(page); penpot.openPage(pg.id); await sleep(600); if (penpot.currentPage.name !== page) return { wait: penpot.currentPage.name }; }
    // IDEMPOTENT BY INVENTORY. The queue is session memory and resets on a storage wipe; the boards do not.
    // Continue with the first family the page does not own yet instead of re-drawing from index 0.
    const have = {};
    Array.from(pr.children || []).forEach((b) => {
      if (b.type !== 'board' || !/·Spec(?:·|$)/.test(String(b.name))) return;
      const f = String(b.name).split('·')[0].toLowerCase();
      if (!have[f]) have[f] = b;
    });
    let i = plan.findIndex((f) => !have[String(f.family).toLowerCase()]);
    if (i < 0) { const rf = CAT.reflowPage({ page }); return { page: page, done: true, total: plan.length, existing: true, reflow: rf }; }
    // An interrupted matrix (client timeout) leaves phase-1 hosts and no skeleton. Report it; never shelf it.
    const partial = (b) => {
      if (!b) return false;
      const names = Array.from(b.children || []).map((c) => String(c.name));
      return !names.some((n) => /^(grid|row|axis)·/.test(n)) && Math.round(b.height) <= 160;
    };
    const bad = plan.map((f) => have[String(f.family).toLowerCase()]).filter(partial);
    if (bad.length && !o.allowPartial) return { page: page, partial: bad.map((b) => String(b.name)), note: 'partial matrix without a skeleton — rebuild that family (CF.matrix, or a CF.matrixPlan split) before continuing' };
    // PACK WHAT EXISTS FIRST, then continue after its last board. A shelf snapshot from an earlier call is stale
    // as soon as one spec grows; the measured page is the only truth.
    const rf0 = CAT.reflowPage({ page });
    const last = rf0.rows && rf0.rows.length ? rf0.rows[rf0.rows.length - 1] : null;
    const fam = plan[i]; const w = fam.w || 864;
    let cur = { x: last ? last.x + last.w + 32 : 80, y: last ? last.y : 208, rowH: last ? Math.ceil(last.h / 4) * 4 : 0 };
    if (cur.x + w > 1840) { cur.x = 80; cur.y = last ? last.y + last.h + 32 : 208; cur.rowH = 0; }
    const x = pr.x + cur.x, y = pr.y + cur.y;
    const rows = (fam.rows || []).map((r) => ({ label: r.label, factory: fam.key, props: r.props || {}, cells: cellsFor(fam.cls, fam.axes) }));
    let b = null;
    try { b = await storage.CF.matrix({ family: fam.family, x: x, y: y, w: w, maxW: w, shrink: false, parent: pr, axes: fam.axes, cellH: fam.cellH || 44, colW: fam.colW || 112, gapX: 12, gapY: fam.gapY === undefined ? 16 : fam.gapY, labelW: fam.labelW || 148, rows: rows }); } catch (e) { CAT.q[page] = i + 1; return { page: page, family: fam.family, err: String(e.message || e) }; }
    if (!b || !b.name) { CAT.q[page] = i + 1; return { page: page, family: fam.family, err: 'matrix returned nothing' }; }
    // BIND FIRST, THEN MEASURE. TK.bindBoard rewrites the board's copy from the fallback family to the declared ramp;
    // an auto-height spec grows at that moment. Measuring before binding stepped the shelf by the pre-bind height,
    // which is how later boards were stacked under a 132px pitch while their real heights were 200-2287.
    try { storage.CF.autoRegister({ roots: [b], states: true, limit: 200 }); } catch (e) {}
    try { await storage.TK.bindBoard(b, { snapSpace: true }); } catch (e) {}
    // THE ELEVATION PASS IS PART OF BUILDING A PAGE. `CF.shadow()` paints a typed stack; only `EL.sweepPage` takes the
    // recipe from the elevation record and writes `tokens.shadow`. Without it every shadowed family (Card, Popover,
    // Popconfirm, Sheet, Dropdown) rebuilds CLEAN-looking but fails gate `shadow_unbound` — measured 2026-10-26 on the
    // batch re-pagination, where 5 rebuilt pages reported unbound shadows the previous whole-file sweep had covered.
    var elev = null;
    if (storage.EL) {
      if (!storage.EL.seeded && storage.EL.hydrate) { try { storage.EL.hydrate(); } catch (e) {} }
      if (storage.EL.seeded) {
        try { await storage.EL.sweepPage({ page: page, apply: true }); } catch (e) {}
        try { elev = storage.EL.adopt(b); } catch (e) {}
      } else {
        elev = { err: 'EL has no recipes and nothing to hydrate from — shadowed families will fail `shadow_unbound`' };
      }
    } else {
      elev = { err: 'storage.EL is not loaded — elevation cannot be bound at build time' };
    }
    try { await storage.TK.bindBoard(b, { snapSpace: true }); } catch (e) {}
    try { if (storage.NL && storage.NL.whenSettled) await storage.NL.whenSettled(); } catch (e) {}
    await sleep(150);
    const bw = Math.round(b.width), bh = Math.round(b.height);
    cur.x = Math.ceil((cur.x + bw + 32) / 4) * 4;
    cur.rowH = Math.max(cur.rowH, Math.ceil(bh / 4) * 4);
    CAT.q[page] = i + 1;
    CAT.report[page] = CAT.report[page] || [];
    CAT.report[page].push({ family: fam.family, x: Math.round(b.x), y: Math.round(b.y), w: bw, h: bh });
    const rf = CAT.reflowPage({ page });   // repair pass: re-packs every ·Spec from its CURRENT size
    return { page: page, family: fam.family, index: i, left: plan.length - i - 1, w: bw, h: bh, elevation: elev,
      reflow: { moved: rf.moved, boards: rf.boards } };
  };
  return { seeded: 'CATALOG', version: CAT.VERSION, capacity: CAT.CAPACITY, pages: Object.keys(CAT.PLAN), families: Object.keys(CAT.PLAN).reduce((n, k) => n + CAT.PLAN[k].length, 0) };
})(storage, penpot, penpotUtils);