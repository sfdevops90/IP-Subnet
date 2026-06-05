/* ── Utilities ────────────────────────────────────── */
function ipToNum(ip) {
  const p = ip.trim().split('.');
  if (p.length !== 4) return null;
  const n = p.map(Number);
  if (n.some(x => isNaN(x) || x < 0 || x > 255)) return null;
  return ((n[0] << 24) | (n[1] << 16) | (n[2] << 8) | n[3]) >>> 0;
}

function numToIp(n) {
  n = n >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function cidrToMaskNum(cidr) {
  if (cidr === 0) return 0;
  return (0xFFFFFFFF << (32 - cidr)) >>> 0;
}

function cidrToMask(cidr) { return numToIp(cidrToMaskNum(cidr)); }

function maskToWildcard(maskStr) {
  return maskStr.split('.').map(Number).map(b => 255 - b).join('.');
}

function numComma(n) { return n.toLocaleString(); }

/* ── Mode management ──────────────────────────────── */
let currentMode = 'subnets';
let lastResults  = [];
const MAX_ROWS   = 512;

function setMode(mode) {
  currentMode = mode;
  ['subnets','hosts','custom'].forEach(m => {
    document.getElementById('btn-mode-' + m).classList.toggle('active', m === mode);
  });
  const vf = document.getElementById('value-field');
  const cr = document.getElementById('custom-row');
  if (mode === 'custom') {
    vf.style.display = 'none';
    cr.style.display = 'block';
    refreshCustomCidr();
  } else {
    vf.style.display = 'flex';
    cr.style.display = 'none';
    document.getElementById('value-label').textContent =
      mode === 'subnets' ? 'Subnets Required' : 'Hosts per Subnet';
    document.getElementById('value-input').placeholder =
      mode === 'subnets' ? '4' : '50';
  }
  clearError();
}

function refreshCustomCidr() {
  const base = parseInt(document.getElementById('cidr-select').value);
  const sel  = document.getElementById('custom-cidr-sel');
  sel.innerHTML = '';
  for (let i = base + 1; i <= 30; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `/${i}  —  ${cidrToMask(i)}`;
    sel.appendChild(opt);
  }
}

document.getElementById('cidr-select').addEventListener('change', () => {
  if (currentMode === 'custom') refreshCustomCidr();
});

/* ── Error handling ───────────────────────────────── */
function showError(msg) {
  const bar = document.getElementById('error-bar');
  document.getElementById('error-text').textContent = msg;
  bar.classList.add('visible');
  document.getElementById('ip-input').classList.remove('has-error');
}
function clearError() {
  document.getElementById('error-bar').classList.remove('visible');
  document.getElementById('ip-input').classList.remove('has-error');
}

/* ── Core calculation ─────────────────────────────── */
function calculate() {
  clearError();
  const ipStr   = document.getElementById('ip-input').value.trim();
  const baseCidr = parseInt(document.getElementById('cidr-select').value);

  // Validate IP
  const ipNum = ipToNum(ipStr);
  if (ipNum === null) {
    document.getElementById('ip-input').classList.add('has-error');
    showError('Invalid IP address. Use dotted-decimal notation, e.g. 192.168.1.0');
    return;
  }

  let newCidr;

  if (currentMode === 'custom') {
    newCidr = parseInt(document.getElementById('custom-cidr-sel').value);
  } else {
    const value = parseInt(document.getElementById('value-input').value);
    if (isNaN(value) || value < 1) {
      showError('Please enter a valid positive number.');
      return;
    }

    if (currentMode === 'subnets') {
      const bitsNeeded = Math.ceil(Math.log2(value));
      newCidr = baseCidr + (bitsNeeded < 1 ? 1 : bitsNeeded);
      if (newCidr > 30) {
        showError(`Cannot fit ${numComma(value)} subnets within /${baseCidr}. Maximum is ${numComma(Math.pow(2, 30 - baseCidr))} subnets.`);
        return;
      }
    } else {
      // hosts mode
      let hostBits = Math.ceil(Math.log2(value + 2));
      if (hostBits < 2) hostBits = 2;
      newCidr = 32 - hostBits;
      if (newCidr < baseCidr) {
        showError(`${numComma(value)} hosts/subnet requires /${newCidr}, which is outside the base /${baseCidr} network. Use a larger base network.`);
        return;
      }
      if (newCidr > 30) {
        showError('Minimum usable subnet is /30 (2 hosts). Please increase the host count.');
        return;
      }
    }
  }

  if (newCidr <= baseCidr) {
    showError(`New CIDR (/${newCidr}) must be more specific than the base (/${baseCidr}).`);
    return;
  }

  // Align to base network boundary
  const baseMaskNum  = cidrToMaskNum(baseCidr);
  const networkBase  = (ipNum & baseMaskNum) >>> 0;
  const subnetSize   = Math.pow(2, 32 - newCidr);
  const totalSubnets = Math.pow(2, newCidr - baseCidr);
  const usableHosts  = subnetSize - 2;
  const subnetMask   = cidrToMask(newCidr);
  const wildcard     = maskToWildcard(subnetMask);

  const results = [];
  const cap = Math.min(totalSubnets, MAX_ROWS);

  for (let i = 0; i < cap; i++) {
    const netNum    = (networkBase + i * subnetSize) >>> 0;
    const bcastNum  = (netNum + subnetSize - 1) >>> 0;
    results.push({
      num:       i + 1,
      network:   numToIp(netNum),
      mask:      subnetMask,
      cidr:      '/' + newCidr,
      wildcard:  wildcard,
      firstHost: usableHosts > 0 ? numToIp((netNum + 1) >>> 0) : '—',
      lastHost:  usableHosts > 0 ? numToIp((bcastNum - 1) >>> 0) : '—',
      broadcast: numToIp(bcastNum),
      usable:    usableHosts
    });
  }

  lastResults = results;
  renderResults(results, {
    newCidr, baseCidr, totalSubnets, usableHosts, subnetMask, wildcard,
    truncated: totalSubnets > MAX_ROWS
  });
}

/* ── Render results ───────────────────────────────── */
function renderResults(results, meta) {
  document.getElementById('empty-panel').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';

  const borrowedBits = meta.newCidr - meta.baseCidr;

  // Summary strip
  document.getElementById('summary-strip').innerHTML = `
    <div class="summary-card">
      <div class="sc-label">Total Subnets</div>
      <div class="sc-value">${numComma(meta.totalSubnets)}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">Hosts / Subnet</div>
      <div class="sc-value">${numComma(meta.usableHosts)}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">New Subnet Mask</div>
      <div class="sc-value small">${meta.subnetMask}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">CIDR Notation</div>
      <div class="sc-value">/${meta.newCidr}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">Bits Borrowed</div>
      <div class="sc-value">${borrowedBits}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">Wildcard (Cisco)</div>
      <div class="sc-value amber small">${meta.wildcard}</div>
    </div>
  `;

  // Row count
  document.getElementById('result-count').innerHTML =
    `Showing <strong>${numComma(results.length)}</strong> of <strong>${numComma(meta.totalSubnets)}</strong> subnet${meta.totalSubnets !== 1 ? 's' : ''}`;

  // Table body
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-num">${r.num}</td>
      <td class="col-net">${r.network}</td>
      <td>${r.mask}</td>
      <td>${r.cidr}</td>
      <td class="col-wc">${r.wildcard}</td>
      <td>${r.firstHost}</td>
      <td>${r.lastHost}</td>
      <td>${r.broadcast}</td>
      <td class="col-hosts">${numComma(r.usable)}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);

  // Truncation notice
  const tn = document.getElementById('truncation-notice');
  if (meta.truncated) {
    tn.style.display = 'block';
    tn.textContent = `⚠  Showing first ${numComma(MAX_ROWS)} of ${numComma(meta.totalSubnets)} subnets to maintain performance. Export CSV includes all displayed rows.`;
  } else {
    tn.style.display = 'none';
  }
}

/* ── Reset ────────────────────────────────────────── */
function resetAll() {
  document.getElementById('ip-input').value = '192.168.1.0';
  document.getElementById('cidr-select').value = '24';
  document.getElementById('value-input').value = '';
  clearError();
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('empty-panel').style.display = 'block';
  lastResults = [];
}

/* ── CSV export ───────────────────────────────────── */
function exportCSV() {
  if (!lastResults.length) return;
  const headers = ['#','Network Address','Subnet Mask','CIDR','Wildcard Mask (Cisco)','First Host','Last Host','Broadcast','Usable Hosts'];
  const rows = lastResults.map(r =>
    [r.num, r.network, r.mask, r.cidr, r.wildcard, r.firstHost, r.lastHost, r.broadcast, r.usable]
  );
  const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'subnet-table.csv' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Quick reference tables ───────────────────────── */
(function buildRefTables() {
  const rows = [];
  for (let c = 8; c <= 30; c++) {
    const mask  = cidrToMask(c);
    const wc    = maskToWildcard(mask);
    const hosts = Math.max(0, Math.pow(2, 32 - c) - 2);
    rows.push({ cidr: '/' + c, mask, wc, hosts: numComma(hosts) });
  }
  const half = Math.ceil(rows.length / 2);
  ['a','b'].forEach((id, idx) => {
    const tbody = document.getElementById('ref-tbody-' + id);
    rows.slice(idx * half, (idx + 1) * half).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.cidr}</td><td>${r.mask}</td><td>${r.wc}</td><td style="text-align:right;padding-right:0.75rem">${r.hosts}</td>`;
      tbody.appendChild(tr);
    });
  });
})();

/* ── Scenario Planner ─────────────────────────────── */
const COLOR_HEX = {
  green:'#22c55e', amber:'#f5a623', blue:'#38bdf8',
  red:'#ff4d6d', purple:'#a78bfa', orange:'#fb923c', teal:'#2dd4bf'
};

const SCENARIOS = {
  'small-corp': {
    name:'Small Corporate Network', icon:'🏢',
    desc:'Typical SMB with segmented VLANs for staff, voice, guest WiFi and CCTV cameras.',
    baseIp:'192.168.0.0', baseCidr:'16',
    vlans:[
      { color:'green',  name:'LAN / Staff',    id:10, hosts:200, note:'Main user VLAN. DHCP .10–.254. Default gateway' },
      { color:'amber',  name:'Voice / VoIP',   id:20, hosts:50,  note:'QoS DSCP EF. CDP/LLDP for IP phones' },
      { color:'blue',   name:'Guest WiFi',     id:30, hosts:100, note:'Internet-only ACL. Isolated from LAN & Voice' },
      { color:'red',    name:'CCTV / Cameras', id:40, hosts:30,  note:'No internet. NVR access only. Block inter-VLAN' },
      { color:'purple', name:'Management',     id:99, hosts:10,  note:'Switch/AP/router OOB. Restrict to admins only' },
    ]
  },
  'medium-enterprise': {
    name:'Medium Enterprise', icon:'🏗',
    desc:'Multi-department office with DMZ, server VLAN, IoT segment and dedicated WAN links.',
    baseIp:'10.0.0.0', baseCidr:'8',
    vlans:[
      { color:'green',  name:'Users / LAN',    id:10, hosts:500, note:'Main corporate LAN. AD/DHCP from DC' },
      { color:'amber',  name:'Servers / DC',   id:20, hosts:50,  note:'Static IPs. DNS, DHCP, AD, File servers' },
      { color:'blue',   name:'VoIP',           id:30, hosts:150, note:'QoS DSCP EF. 802.1p CoS 5. Auto-QoS' },
      { color:'red',    name:'DMZ',            id:40, hosts:20,  note:'Web/mail facing internet. Firewall required' },
      { color:'purple', name:'Guest',          id:50, hosts:200, note:'Internet-only. Rate limited. Captive portal' },
      { color:'orange', name:'IoT / Building', id:60, hosts:100, note:'BMS, printers, sensors. No DC access' },
      { color:'teal',   name:'Management',     id:99, hosts:20,  note:'OOB management. SSH/HTTPS only' },
    ]
  },
  'home-lab': {
    name:'Home Lab', icon:'🧪',
    desc:'Personal homelab with trusted devices, IoT isolation, sandbox VMs and VPN clients.',
    baseIp:'192.168.0.0', baseCidr:'16',
    vlans:[
      { color:'green',  name:'Trusted / Main', id:10, hosts:30, note:'Laptops, phones, TVs. Full internet access' },
      { color:'amber',  name:'IoT Devices',    id:20, hosts:50, note:'Smart home. Block internet where possible' },
      { color:'red',    name:'Lab / Sandbox',  id:30, hosts:20, note:'VMs, test servers. No production access' },
      { color:'purple', name:'VPN Clients',    id:40, hosts:10, note:'WireGuard/OpenVPN tunnel addresses' },
    ]
  },
  'branch-office': {
    name:'Branch Office', icon:'📡',
    desc:'Remote site with SD-WAN/MPLS back to HQ. Minimal local services.',
    baseIp:'172.16.0.0', baseCidr:'16',
    vlans:[
      { color:'green',  name:'Staff LAN',       id:10, hosts:80, note:'DHCP from HQ or local scope' },
      { color:'amber',  name:'VoIP',            id:20, hosts:40, note:'QoS required over WAN. Local survivability' },
      { color:'blue',   name:'Printers / MFP',  id:30, hosts:10, note:'Isolated. Print server at HQ via WAN' },
      { color:'purple', name:'Guest WiFi',      id:40, hosts:50, note:'Local internet breakout only. No HQ access' },
      { color:'red',    name:'WAN / P2P Links', id:99, hosts:2,  note:'/30 point-to-point links to HQ/DC' },
    ]
  },
  'data-centre': {
    name:'Data Centre', icon:'🖥',
    desc:'Rack infrastructure with OOB management, storage fabric, production tiers and DR replication.',
    baseIp:'10.10.0.0', baseCidr:'16',
    vlans:[
      { color:'green',  name:'Production',      id:10, hosts:200, note:'App and web servers. HA pairs. Redundant NICs' },
      { color:'amber',  name:'Storage / iSCSI', id:20, hosts:50,  note:'Jumbo frames MTU 9000. Dedicated HBAs' },
      { color:'blue',   name:'Backup',          id:30, hosts:30,  note:'Veeam/backup agents. Scheduled off-peak' },
      { color:'red',    name:'OOB Management',  id:40, hosts:50,  note:'iDRAC/iLO/IPMI. Air-gap if possible' },
      { color:'purple', name:'Replication / DR',id:50, hosts:20,  note:'Encrypted DR tunnel. Scheduled replication' },
    ]
  }
};

/* Tab switching */
function switchTab(tab) {
  ['manual','scenario','firewall','dhcp'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tab-btn-' + t).classList.toggle('active', t === tab);
  });
}

/* Scenario step navigation */
function scenarioStep(step) {
  ['picker','editor','results'].forEach(s => {
    document.getElementById('sc-step-' + s).style.display = s === step ? 'block' : 'none';
  });
}

/* syncBadge — no-op; color read at generation time */
function syncBadge(select) {}

/* Build picker cards */
(function buildScenarioPicker() {
  const grid = document.getElementById('scenario-grid');
  Object.entries(SCENARIOS).forEach(([id, sc]) => {
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.innerHTML = `
      <div class="sc-icon">${sc.icon}</div>
      <div class="sc-name">${sc.name}</div>
      <div class="sc-desc">${sc.desc}</div>
      <div class="sc-meta">${sc.vlans.length} VLANs &nbsp;·&nbsp; Base: ${sc.baseIp}/${sc.baseCidr}</div>
    `;
    card.onclick = () => loadScenario(id);
    grid.appendChild(card);
  });
})();

let activeScenarioId = null;
let scenarioResults  = [];

function loadScenario(id) {
  const sc = SCENARIOS[id];
  activeScenarioId = id;
  document.getElementById('sce-title').textContent      = sc.name;
  document.getElementById('sce-subdesc').textContent    = sc.desc;
  document.getElementById('sce-panel-title').textContent = sc.name + ' — Configure VLANs';
  document.getElementById('sc-base-ip').value           = sc.baseIp;
  document.getElementById('sc-base-cidr').value         = sc.baseCidr;
  document.getElementById('sc-error-bar').classList.remove('visible');

  const tbody = document.getElementById('vlan-editor-tbody');
  tbody.innerHTML = '';
  sc.vlans.forEach(v => addVlanRow(v));
  scenarioStep('editor');
}

function escH(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function addVlanRow(data) {
  const tbody  = document.getElementById('vlan-editor-tbody');
  const colors = Object.keys(COLOR_HEX);
  const color  = data ? data.color : colors[tbody.rows.length % colors.length];
  const opts   = colors.map(c =>
    `<option value="${c}" ${c === color ? 'selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`
  ).join('');

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="vi w-color" onchange="syncBadge(this)">
        ${opts}
      </select>
    </td>
    <td><input  type="text"   class="vi w-name"  value="${data ? escH(data.name)  : ''}" placeholder="e.g. Staff LAN"></td>
    <td><input  type="number" class="vi w-id"    value="${data ? data.id    : ''}" placeholder="10"  min="1" max="4094"></td>
    <td><input  type="number" class="vi w-hosts" value="${data ? data.hosts : ''}" placeholder="50"  min="1"></td>
    <td><input  type="text"   class="vi w-note"  value="${data ? escH(data.note)  : ''}" placeholder="Optional Cisco / design notes"></td>
    <td><button class="btn-del" onclick="this.closest('tr').remove()" title="Remove">×</button></td>
  `;
  tbody.appendChild(tr);
}

/* ── VLSM allocation engine ───────────────────────── */
function buildNetworkPlan() {
  const baseIpStr = document.getElementById('sc-base-ip').value.trim();
  const baseCidr  = parseInt(document.getElementById('sc-base-cidr').value);
  const errBar    = document.getElementById('sc-error-bar');
  const errTxt    = document.getElementById('sc-error-text');
  errBar.classList.remove('visible');

  const baseIpNum = ipToNum(baseIpStr);
  if (!baseIpNum && baseIpNum !== 0) {
    errTxt.textContent = 'Invalid base IP address.';
    errBar.classList.add('visible');
    return;
  }

  // Read rows from editor
  const vlans = [];
  let hasErr = false;
  document.querySelectorAll('#vlan-editor-tbody tr').forEach((tr, idx) => {
    const inputs = tr.querySelectorAll('select,input');
    const color  = inputs[0].value;
    const name   = inputs[1].value.trim() || ('VLAN ' + (idx + 1));
    const vlanId = parseInt(inputs[2].value) || (10 * (idx + 1));
    const hosts  = parseInt(inputs[3].value);
    const note   = inputs[4].value.trim();
    if (isNaN(hosts) || hosts < 1) {
      errTxt.textContent = `Row ${idx+1} ("${name}"): enter a valid host count (min 1).`;
      errBar.classList.add('visible');
      hasErr = true;
    }
    vlans.push({ color, name, vlanId, hosts, note });
  });
  if (hasErr || !vlans.length) return;

  // VLSM: sort largest-first for efficient packing
  const sorted      = [...vlans].sort((a, b) => b.hosts - a.hosts);
  const baseMaskNum = cidrToMaskNum(baseCidr);
  let   cursor      = (baseIpNum & baseMaskNum) >>> 0;
  const spaceEnd    = (cursor + Math.pow(2, 32 - baseCidr) - 1) >>> 0;
  const allocs      = [];

  for (const v of sorted) {
    let   hBits = Math.ceil(Math.log2(v.hosts + 2));
    if (hBits < 2) hBits = 2;
    const sCidr    = 32 - hBits;
    const sSize    = Math.pow(2, hBits);
    // Align cursor to subnet boundary
    if (cursor % sSize !== 0)
      cursor = (Math.floor(cursor / sSize) + 1) * sSize;

    const netNum   = cursor >>> 0;
    const bcastNum = (netNum + sSize - 1) >>> 0;

    if (bcastNum > spaceEnd) {
      errTxt.textContent = `Address space exhausted allocating "${v.name}". Choose a larger base network (/8 or /16).`;
      errBar.classList.add('visible');
      return;
    }

    const mask      = cidrToMask(sCidr);
    const wildcard  = maskToWildcard(mask);
    const gw        = numToIp((netNum + 1) >>> 0);
    const dhcpStart = numToIp((netNum + 2) >>> 0);
    const dhcpEnd   = numToIp((bcastNum - 1) >>> 0);

    allocs.push({
      ...v,
      network:   numToIp(netNum),
      mask,
      cidr:      '/' + sCidr,
      wildcard,
      gateway:   gw,
      dhcpRange: dhcpStart + ' – ' + dhcpEnd,
      broadcast: numToIp(bcastNum),
      usable:    sSize - 2
    });
    cursor = (bcastNum + 1) >>> 0;
  }

  // Re-sort by VLAN ID for display
  allocs.sort((a, b) => a.vlanId - b.vlanId);
  scenarioResults = allocs;
  renderScenarioResults(allocs);
}

function renderScenarioResults(allocs) {
  const sc = SCENARIOS[activeScenarioId];
  document.getElementById('sc-results-title').textContent =
    (sc ? sc.name : 'Network') + ' — Subnet Allocation Plan';

  const baseIp   = document.getElementById('sc-base-ip').value;
  const baseCidr = document.getElementById('sc-base-cidr').value;
  document.getElementById('sc-result-count').innerHTML =
    `<strong>${allocs.length}</strong> VLAN${allocs.length!==1?'s':''} &nbsp;·&nbsp; Base: <strong>${baseIp}/${baseCidr}</strong>`;

  const tbody = document.getElementById('sc-results-tbody');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  allocs.forEach(a => {
    const hex = COLOR_HEX[a.color] || '#00d4a8';
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="vlan-name-cell">
        <span class="vlan-badge" style="background:${hex};width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0"></span>
        <span>${escH(a.name)}</span>
      </div></td>
      <td style="color:var(--text-secondary)">${a.vlanId}</td>
      <td class="td-net">${a.network}</td>
      <td>${a.mask}</td>
      <td>${a.cidr}</td>
      <td class="td-wc">${a.wildcard}</td>
      <td class="td-gw">${a.gateway}</td>
      <td style="font-size:0.7rem;color:var(--text-secondary)">${a.dhcpRange}</td>
      <td>${a.broadcast}</td>
      <td style="text-align:right;padding-right:1.25rem">${numComma(a.usable)}</td>
      <td class="td-notes">${escH(a.note)}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);

  // Summary cards
  const totalIPs   = allocs.reduce((s,a) => s + a.usable, 0);
  const largest    = allocs.reduce((m,a) => a.usable > m.usable ? a : m, allocs[0]);
  const smallest   = allocs.reduce((m,a) => a.usable < m.usable ? a : m, allocs[0]);
  document.getElementById('sc-summary-strip').innerHTML = `
    <div class="summary-card"><div class="sc-label">VLANs Planned</div><div class="sc-value">${allocs.length}</div></div>
    <div class="summary-card"><div class="sc-label">Total Usable IPs</div><div class="sc-value">${numComma(totalIPs)}</div></div>
    <div class="summary-card"><div class="sc-label">Base Network</div><div class="sc-value small">${document.getElementById('sc-base-ip').value}/${document.getElementById('sc-base-cidr').value}</div></div>
    <div class="summary-card"><div class="sc-label">Largest Subnet</div><div class="sc-value small">${largest ? largest.name+' '+largest.cidr : '—'}</div></div>
    <div class="summary-card"><div class="sc-label">Smallest Subnet</div><div class="sc-value small amber">${smallest ? smallest.name+' '+smallest.cidr : '—'}</div></div>
  `;

  scenarioStep('results');
}

function exportScenarioCSV() {
  if (!scenarioResults.length) return;
  const hdr  = ['VLAN Name','VLAN ID','Network','Subnet Mask','CIDR','Wildcard (Cisco)','Gateway','DHCP Range','Broadcast','Usable Hosts','Notes'];
  const rows = scenarioResults.map(a =>
    [a.name, a.vlanId, a.network, a.mask, a.cidr, a.wildcard, a.gateway, a.dhcpRange, a.broadcast, a.usable, a.note]
  );
  const csv  = [hdr,...rows].map(r => r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:'network-plan.csv' });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── Init ─────────────────────────────────────────── */
refreshCustomCidr();

/* ══════════════════════════════════════════════════════
   SHARED UTILITIES
═══════════════════════════════════════════════════════ */

/* Parse "192.168.10.0/24" → network info object */
function parseNetworkCIDR(str) {
  if (!str) return null;
  str = str.trim();
  const slash = str.lastIndexOf('/');
  if (slash === -1) return null;
  const ipStr = str.substring(0, slash);
  const cidrNum = parseInt(str.substring(slash + 1));
  if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) return null;
  const ipNum = ipToNum(ipStr);
  if (ipNum === null) return null;
  const maskNum = cidrToMaskNum(cidrNum);
  const netNum  = (ipNum & maskNum) >>> 0;
  const size    = Math.pow(2, 32 - cidrNum);
  const bcastNum = (netNum + size - 1) >>> 0;
  const mask    = cidrToMask(cidrNum);
  return {
    network:   numToIp(netNum),
    cidrNum,
    cidr:      '/' + cidrNum,
    mask,
    wildcard:  maskToWildcard(mask),
    gateway:   cidrNum <= 30 ? numToIp((netNum + 1) >>> 0) : numToIp(netNum),
    broadcast: numToIp(bcastNum),
    usable:    Math.max(0, size - 2),
    size
  };
}

/* Safe ACL / identifier name */
function safeId(s) {
  return (s || 'NET').toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 20);
}

/* Copy pre element text to clipboard */
function copyCode(preId, btn) {
  const pre  = document.getElementById(preId);
  const text = pre.textContent || pre.innerText;
  const doFeedback = () => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(doFeedback).catch(() => fallbackCopy(text, doFeedback));
  } else {
    fallbackCopy(text, doFeedback);
  }
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  Object.assign(ta.style, { position:'fixed', left:'-9999px', top:'-9999px' });
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb(); } catch(e) {}
  document.body.removeChild(ta);
}

/* ══════════════════════════════════════════════════════
   SYNTAX HIGHLIGHTING
═══════════════════════════════════════════════════════ */
function highlight(rawCode, lang) {
  let c = rawCode.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  switch (lang) {
    case 'cisco':      return hlCisco(c);
    case 'xml':        return hlXML(c);
    case 'juniper':    return hlJuniper(c);
    case 'powershell': return hlPS(c);
    case 'isc':        return hlISC(c);
    case 'json':       return hlJSON(c);
    case 'mikrotik':   return hlMikrotik(c);
    default:           return c;
  }
}

function hlCisco(c) {
  c = c.replace(/(^!.*)$/gm, '<span class="sh-cmt">$1</span>');
  c = c.replace(/^( *)(remark)([ \t].*)$/gm,'$1<span class="sh-kw">$2</span><span class="sh-cmt">$3</span>');
  c = c.replace(/\b(permit|deny)\b/g,'<span class="sh-kw">$1</span>');
  c = c.replace(/\b(ip access-list extended|ip access-list standard|ip dhcp excluded-address|ip dhcp pool|ip access-group|ip helper-address|interface Vlan\d*|interface vlan\d*|default-router|dns-server|domain-name|lease|network|any|host|log|eq|gt|lt|established|icmp|tcp|udp|ip)\b/g,'<span class="sh-kw">$1</span>');
  c = c.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,'<span class="sh-val">$1</span>');
  c = c.replace(/(extended|standard|pool|group)\s+([A-Z][A-Z0-9\-]+)/g,'$1 <span class="sh-func">$2</span>');
  return c;
}

function hlXML(c) {
  c = c.replace(/(&lt;!--[\s\S]*?--&gt;)/g,'<span class="sh-cmt">$1</span>');
  c = c.replace(/(&lt;\/?[\w:.-]+)([^&]*?)(&gt;)/g,'<span class="sh-tag">$1</span>$2<span class="sh-tag">$3</span>');
  c = c.replace(/([\w:-]+=)(&quot;[^&]*?&quot;)/g,'<span class="sh-attr">$1</span><span class="sh-str">$2</span>');
  return c;
}

function hlJuniper(c) {
  c = c.replace(/(\/\*[\s\S]*?\*\/)/g,'<span class="sh-cmt">$1</span>');
  c = c.replace(/\b(firewall|family|inet|filter|term|from|then|accept|reject|count|log|syslog|source-address|destination-address|protocol|destination-port|interfaces|irb|unit|input|output)\b/g,'<span class="sh-kw">$1</span>');
  c = c.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d+)\b/g,'<span class="sh-val">$1</span>');
  c = c.replace(/\b(VLAN[A-Z0-9\-]+|DENY-[A-Z0-9\-]+|ALLOW-[A-Z]+|TERM-[A-Z0-9\-]+)\b/g,'<span class="sh-func">$1</span>');
  return c;
}

function hlPS(c) {
  c = c.replace(/(#.*)$/gm,'<span class="sh-cmt">$1</span>');
  c = c.replace(/\b(Add-DhcpServerv4Scope|Set-DhcpServerv4OptionValue|Add-DhcpServerv4ExclusionRange|New-TimeSpan|Install-WindowsFeature)\b/g,'<span class="sh-func">$1</span>');
  c = c.replace(/(-\w+)\b/g,'<span class="sh-attr">$1</span>');
  c = c.replace(/(&quot;[^&]*?&quot;)/g,'<span class="sh-str">$1</span>');
  c = c.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,'<span class="sh-val">$1</span>');
  return c;
}

function hlISC(c) {
  c = c.replace(/(#.*)$/gm,'<span class="sh-cmt">$1</span>');
  c = c.replace(/\b(subnet|netmask|range|option|routers|domain-name-servers|domain-name|default-lease-time|max-lease-time|authoritative|host|hardware|ethernet|fixed-address)\b/g,'<span class="sh-kw">$1</span>');
  c = c.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,'<span class="sh-val">$1</span>');
  c = c.replace(/(&quot;[^&]*?&quot;)/g,'<span class="sh-str">$1</span>');
  return c;
}

function hlJSON(c) {
  c = c.replace(/(\/\/.*$)/gm,'<span class="sh-cmt">$1</span>');
  c = c.replace(/(&quot;[^&]+&quot;)(\s*:)/g,'<span class="sh-attr">$1</span>$2');
  c = c.replace(/:\s*(&quot;[^&]*&quot;)/g,': <span class="sh-str">$1</span>');
  c = c.replace(/\b(true|false|null)\b/g,'<span class="sh-kw">$1</span>');
  c = c.replace(/:\s*(\d+)\b/g,': <span class="sh-num">$1</span>');
  return c;
}

function hlMikrotik(c) {
  c = c.replace(/(#.*)$/gm,'<span class="sh-cmt">$1</span>');
  c = c.replace(/^(\s*\/[\w\/-]+)/gm,'<span class="sh-kw">$1</span>');
  c = c.replace(/\b(add|set|remove|print|export)\b/g,'<span class="sh-func">$1</span>');
  c = c.replace(/\b([\w-]+=)/g,'<span class="sh-attr">$1</span>');
  c = c.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,'<span class="sh-val">$1</span>');
  return c;
}

/* ══════════════════════════════════════════════════════
   FIREWALL RULES GENERATOR
═══════════════════════════════════════════════════════ */
let fwPreset   = 'strict';
let fwPlatform = 'cisco-ios';

function addFwVlan(data) {
  const tbody  = document.getElementById('fw-vlan-tbody');
  const colors = Object.keys(COLOR_HEX);
  const color  = data ? (data.color || 'green') : colors[tbody.rows.length % colors.length];
  const opts   = colors.map(c => `<option value="${c}"${c===color?' selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('');
  const zones  = ['lan','dmz','guest','management','server','iot','wan'];
  const zOpts  = zones.map(z => `<option value="${z}"${(data&&data.zone===z)?' selected':''}>${z.charAt(0).toUpperCase()+z.slice(1)}</option>`).join('');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="vi" style="max-width:88px">${opts}</select></td>
    <td><input type="text"   class="vi" style="min-width:120px" value="${data?escH(data.name||''):''}" placeholder="e.g. Staff LAN"></td>
    <td><input type="text"   class="vi" style="min-width:140px" value="${data?escH(data.networkCidr||''):''}" placeholder="192.168.10.0/24"></td>
    <td><input type="number" class="vi" style="max-width:62px"  value="${data&&data.vlanId?data.vlanId:''}" placeholder="10" min="1" max="4094"></td>
    <td><select class="vi" style="min-width:110px">${zOpts}</select></td>
    <td><button class="btn-del" onclick="this.closest('tr').remove()" title="Remove">×</button></td>
  `;
  tbody.appendChild(tr);
}

function getFwNetworks() {
  return Array.from(document.querySelectorAll('#fw-vlan-tbody tr')).map((tr, i) => {
    const s = tr.querySelectorAll('select,input');
    return { color:s[0].value, name:s[1].value.trim()||`Net${i+1}`, networkCidr:s[2].value.trim(), vlanId:parseInt(s[3].value)||((i+1)*10), zone:s[4].value };
  }).filter(n => n.networkCidr);
}

function getFwRules() {
  return Array.from(document.querySelectorAll('#fw-rules-tbody tr')).map(tr => {
    const s = tr.querySelectorAll('select,input');
    return { action:s[0].value, src:s[1].value, dst:s[2].value, proto:s[3].value, port:s[4].value.trim(), desc:s[5].value.trim() };
  });
}

function setFwPreset(p) {
  fwPreset = p;
  ['strict','relaxed','custom'].forEach(x => document.getElementById('fw-preset-'+x).classList.toggle('active', x===p));
  document.getElementById('fw-custom-rules').style.display = p==='custom' ? 'block' : 'none';
}

function setFwPlatform(p, btn) {
  fwPlatform = p;
  document.querySelectorAll('#fw-platform-tabs .platform-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function addFwRule() {
  const nets = getFwNetworks();
  const srcOpts = ['<option value="any">Any source</option>', ...nets.map(n=>`<option value="${escH(n.name)}">${escH(n.name)}</option>`)].join('');
  const dstOpts = ['<option value="any">Any destination</option>','<option value="internet">Internet (any)</option>',...nets.map(n=>`<option value="${escH(n.name)}">${escH(n.name)}</option>`)].join('');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="vi" style="max-width:78px"><option value="permit">Permit</option><option value="deny">Deny</option></select></td>
    <td><select class="vi" style="min-width:130px">${srcOpts}</select></td>
    <td><select class="vi" style="min-width:130px">${dstOpts}</select></td>
    <td><select class="vi" style="max-width:75px"><option value="ip">IP</option><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option></select></td>
    <td><input type="text" class="vi" style="max-width:75px" placeholder="any" value="any"></td>
    <td><input type="text" class="vi" style="min-width:150px" placeholder="Optional description"></td>
    <td><button class="btn-del" onclick="this.closest('tr').remove()" title="Remove">×</button></td>
  `;
  document.getElementById('fw-rules-tbody').appendChild(tr);
}

function generateFWRules() {
  const nets = getFwNetworks();
  const err  = (m) => { document.getElementById('fw-error-text').textContent=m; document.getElementById('fw-error-bar').classList.add('visible'); };
  document.getElementById('fw-error-bar').classList.remove('visible');
  if (!nets.length) return err('Add at least one network / VLAN.');
  for (const n of nets) { if (!parseNetworkCIDR(n.networkCidr)) return err(`Invalid CIDR for "${n.name}". Use format: 192.168.10.0/24`); }
  const rules = fwPreset==='custom' ? getFwRules() : [];
  let code, lang, badge;
  if (fwPlatform==='cisco-ios') { code=genCiscoACL(nets,rules,fwPreset); lang='cisco'; badge='CISCO IOS EXTENDED ACL'; }
  else if (fwPlatform==='pfsense') { code=genPfsenseXML(nets,rules,fwPreset); lang='xml'; badge='PFSENSE / OPNSENSE XML'; }
  else { code=genJuniperFW(nets,rules,fwPreset); lang='juniper'; badge='JUNIPER FIREWALL FILTER'; }
  const titles = {'cisco-ios':'Cisco IOS ACL','pfsense':'pfSense / OPNsense XML','juniper':'Juniper Firewall Filter'};
  document.getElementById('fw-code-badge').textContent = badge;
  document.getElementById('fw-output-title').textContent = 'Generated: ' + titles[fwPlatform];
  document.getElementById('fw-code-pre').innerHTML = highlight(code, lang);
  const sec = document.getElementById('fw-output-section');
  sec.style.display = 'block';
  setTimeout(() => sec.scrollIntoView({behavior:'smooth',block:'nearest'}), 50);
}

function importScenarioToFW() {
  if (!scenarioResults.length) { alert('No scenario results yet — run the Scenario Planner first.'); return; }
  document.getElementById('fw-vlan-tbody').innerHTML = '';
  scenarioResults.forEach(r => addFwVlan({ color:r.color, name:r.name, networkCidr:r.network+r.cidr, vlanId:r.vlanId }));
}

function resetFW() {
  document.getElementById('fw-vlan-tbody').innerHTML = '';
  document.getElementById('fw-rules-tbody').innerHTML = '';
  document.getElementById('fw-output-section').style.display = 'none';
  document.getElementById('fw-error-bar').classList.remove('visible');
  initFwDefaults();
}

/* ── Cisco IOS Extended ACL generator ─────────────── */
function genCiscoACL(nets, rules, preset) {
  const ts = new Date().toISOString().slice(0,10);
  const L = [];
  L.push('!');
  L.push('! ============================================================');
  L.push('! Cisco IOS — Named Extended ACL Configuration');
  L.push(`! Generated by Network Sloth — ${ts}`);
  L.push(`! Preset  : ${preset.charAt(0).toUpperCase()+preset.slice(1)}`);
  L.push('! WARNING : Review carefully and test in a lab before deploying');
  L.push('! ============================================================');
  L.push('!');
  nets.forEach(net => {
    const p = parseNetworkCIDR(net.networkCidr);
    if (!p) return;
    const aName = `ACL-V${net.vlanId}-${safeId(net.name)}-IN`;
    L.push(`! ---- ${net.name}  ${net.networkCidr} ----`);
    L.push(`ip access-list extended ${aName}`);
    L.push(` remark === ${net.name} (${net.networkCidr}) — ${preset} ===`);
    if (preset==='strict') {
      nets.filter(o=>o!==net).forEach(o => {
        const op = parseNetworkCIDR(o.networkCidr); if (!op) return;
        L.push(` remark [DENY] ${net.name} → ${o.name}`);
        L.push(` deny   ip ${p.network} ${p.wildcard} ${op.network} ${op.wildcard}`);
      });
      L.push(` remark [PERMIT] Internet / routed uplink`);
      L.push(` permit ip ${p.network} ${p.wildcard} any`);
      L.push(` deny   ip any any log`);
    } else if (preset==='relaxed') {
      L.push(` remark [PERMIT] All outbound traffic (relaxed)`);
      L.push(` permit ip ${p.network} ${p.wildcard} any`);
    } else {
      const nr = rules.filter(r=>r.src===net.name||r.src==='any');
      if (!nr.length) { L.push(` remark [INFO] No custom rules — implicit deny applies`); L.push(` deny   ip any any log`); }
      else {
        nr.forEach(r => {
          const sp = nets.find(n=>n.name===r.src); const dp = nets.find(n=>n.name===r.dst);
          const srcS = sp ? (() => { const x=parseNetworkCIDR(sp.networkCidr); return x?`${x.network} ${x.wildcard}`:'any'; })() : 'any';
          const dstS = dp ? (() => { const x=parseNetworkCIDR(dp.networkCidr); return x?`${x.network} ${x.wildcard}`:'any'; })() : 'any';
          const proto = r.proto||'ip';
          const portPart = (r.port&&r.port!=='any'&&proto!=='ip'&&proto!=='icmp') ? ` eq ${r.port}` : '';
          if (r.desc) L.push(` remark [${r.action.toUpperCase()}] ${r.desc}`);
          L.push(` ${r.action==='permit'?'permit':'deny  '} ${proto} ${srcS} ${dstS}${portPart}`);
        });
        L.push(` deny   ip any any log`);
      }
    }
    L.push('!');
  });
  L.push('! ---- Apply inbound on SVIs (remove leading ! to enable) ----');
  nets.forEach(net => {
    L.push(`! interface Vlan${net.vlanId}`);
    L.push(`!  ip access-group ACL-V${net.vlanId}-${safeId(net.name)}-IN in`);
    L.push('!');
  });
  return L.join('\n');
}

/* ── pfSense / OPNsense XML generator ─────────────── */
function genPfsenseXML(nets, rules, preset) {
  const ts = new Date().toISOString().slice(0,10);
  const L = [];
  L.push('<?xml version="1.0"?>');
  L.push('<!--');
  L.push('  pfSense / OPNsense Firewall Rules');
  L.push(`  Generated by Network Sloth — ${ts}  |  Preset: ${preset}`);
  L.push('  Import via: Diagnostics > Backup/Restore > Restore section "filter"');
  L.push('  IMPORTANT: Back up your current config before merging XML!');
  L.push('  Adjust interface names (opt1, opt2…) to match your pfSense interfaces.');
  L.push('-->');
  L.push('<pfsense>');
  L.push('  <filter>');
  nets.forEach((net, idx) => {
    const p = parseNetworkCIDR(net.networkCidr); if (!p) return;
    const iface = `opt${idx+1}`;
    const cidrStr = `${p.network}/${p.cidrNum}`;
    L.push(`    <!-- ===== ${net.name}  ${net.networkCidr}  interface: ${iface} ===== -->`);
    if (preset==='strict') {
      nets.filter(o=>o!==net).forEach(o => {
        const op = parseNetworkCIDR(o.networkCidr); if (!op) return;
        L.push('    <rule>');
        L.push('      <type>block</type>');
        L.push(`      <interface>${iface}</interface>`);
        L.push('      <ipprotocol>inet</ipprotocol><protocol>any</protocol>');
        L.push(`      <source><network>${iface}</network></source>`);
        L.push(`      <destination><address>${op.network}/${op.cidrNum}</address></destination>`);
        L.push(`      <descr>Block ${net.name} to ${o.name}</descr><log/>`);
        L.push('    </rule>');
      });
      L.push('    <rule>');
      L.push('      <type>pass</type>');
      L.push(`      <interface>${iface}</interface>`);
      L.push('      <ipprotocol>inet</ipprotocol><protocol>any</protocol>');
      L.push(`      <source><network>${iface}</network></source>`);
      L.push('      <destination><any/></destination>');
      L.push(`      <descr>Allow ${net.name} to internet</descr>`);
      L.push('    </rule>');
    } else if (preset==='relaxed') {
      L.push('    <rule>');
      L.push('      <type>pass</type>');
      L.push(`      <interface>${iface}</interface>`);
      L.push('      <ipprotocol>inet</ipprotocol><protocol>any</protocol>');
      L.push(`      <source><network>${iface}</network></source>`);
      L.push('      <destination><any/></destination>');
      L.push(`      <descr>Allow all from ${net.name} (relaxed)</descr>`);
      L.push('    </rule>');
    } else {
      rules.filter(r=>r.src===net.name||r.src==='any').forEach(r => {
        const dp = nets.find(n=>n.name===r.dst);
        const dpr = dp ? parseNetworkCIDR(dp.networkCidr) : null;
        L.push('    <rule>');
        L.push(`      <type>${r.action==='permit'?'pass':'block'}</type>`);
        L.push(`      <interface>${iface}</interface>`);
        L.push('      <ipprotocol>inet</ipprotocol>');
        if (r.proto&&r.proto!=='ip') L.push(`      <protocol>${r.proto}</protocol>`);
        L.push(`      <source><network>${iface}</network></source>`);
        L.push('      <destination>');
        if (dpr) L.push(`        <address>${dpr.network}/${dpr.cidrNum}</address>`);
        else L.push('        <any/>');
        if (r.port&&r.port!=='any') L.push(`        <port>${r.port}</port>`);
        L.push('      </destination>');
        if (r.desc) L.push(`      <descr>${escH(r.desc)}</descr>`);
        if (r.action==='deny') L.push('      <log/>');
        L.push('    </rule>');
      });
    }
  });
  L.push('  </filter>');
  L.push('</pfsense>');
  return L.join('\n');
}

/* ── Juniper EX/QFX Firewall Filter generator ─────── */
function genJuniperFW(nets, rules, preset) {
  const ts = new Date().toISOString().slice(0,10);
  const L = [];
  L.push('/*');
  L.push(' * Juniper EX / QFX — Firewall Filters (family inet)');
  L.push(` * Generated by Network Sloth — ${ts}  |  Preset: ${preset}`);
  L.push(' * Apply to IRB interfaces:');
  L.push(' *   set interfaces irb unit <VLAN_ID> family inet filter input <filter-name>');
  L.push(' */');
  L.push('firewall {');
  L.push('    family inet {');
  nets.forEach(net => {
    const p = parseNetworkCIDR(net.networkCidr); if (!p) return;
    const fname = `VLAN${net.vlanId}-${safeId(net.name).substring(0,12)}`;
    L.push(`        /* ---- ${net.name}  ${net.networkCidr} ---- */`);
    L.push(`        filter ${fname} {`);
    if (preset==='strict') {
      nets.filter(o=>o!==net).forEach(o => {
        const op = parseNetworkCIDR(o.networkCidr); if (!op) return;
        const tname = `DENY-TO-${safeId(o.name).substring(0,10)}`;
        L.push(`            term ${tname} {`);
        L.push('                from {');
        L.push(`                    source-address { ${p.network}/${p.cidrNum}; }`);
        L.push(`                    destination-address { ${op.network}/${op.cidrNum}; }`);
        L.push('                }');
        L.push('                then { reject; count '+tname+'; log; syslog; }');
        L.push('            }');
      });
      L.push('            term ALLOW-INTERNET {');
      L.push(`                from { source-address { ${p.network}/${p.cidrNum}; } }`);
      L.push('                then accept;');
      L.push('            }');
      L.push('            term DENY-ALL { then { reject; count DENY-ALL; log; syslog; } }');
    } else if (preset==='relaxed') {
      L.push('            term ALLOW-ALL {');
      L.push(`                /* Allow all traffic from ${net.name} */`);
      L.push('                then accept;');
      L.push('            }');
    } else {
      const nr = rules.filter(r=>r.src===net.name||r.src==='any');
      nr.forEach((r, i) => {
        const sp = nets.find(n=>n.name===r.src); const dp = nets.find(n=>n.name===r.dst);
        const tname = `TERM-${i+1}-${r.action.toUpperCase()}`;
        L.push(`            term ${tname} {`);
        L.push('                from {');
        if (sp) { const x=parseNetworkCIDR(sp.networkCidr); if(x) L.push(`                    source-address { ${x.network}/${x.cidrNum}; }`); }
        if (dp) { const x=parseNetworkCIDR(dp.networkCidr); if(x) L.push(`                    destination-address { ${x.network}/${x.cidrNum}; }`); }
        if (r.proto&&r.proto!=='ip') L.push(`                    protocol ${r.proto};`);
        if (r.port&&r.port!=='any') L.push(`                    destination-port ${r.port};`);
        L.push('                }');
        if (r.action==='permit') L.push('                then accept;');
        else L.push('                then { reject; log; syslog; }');
        L.push('            }');
      });
      if (!nr.length) L.push('            term DENY-ALL { /* No custom rules */ then reject; }');
      else L.push('            term DENY-ALL { then { reject; count DENY-ALL; } }');
    }
    L.push('        }');
  });
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/* Apply filters to IRB interfaces: */');
  nets.forEach(net => L.push(`/* set interfaces irb unit ${net.vlanId} family inet filter input VLAN${net.vlanId}-${safeId(net.name).substring(0,12)} */`));
  return L.join('\n');
}

/* ══════════════════════════════════════════════════════
   DHCP SCOPE GENERATOR
═══════════════════════════════════════════════════════ */
let dhcpPlatform = 'cisco-ios';

function addDhcpRow(data) {
  const def1 = document.getElementById('dhcp-dns1')?.value||'8.8.8.8';
  const def2 = document.getElementById('dhcp-dns2')?.value||'8.8.4.4';
  const defD = document.getElementById('dhcp-domain')?.value||'';
  const defL = document.getElementById('dhcp-lease')?.value||'1';
  let gw = data?.gateway||'';
  if (!gw && data?.networkCidr) { const pn=parseNetworkCIDR(data.networkCidr); if(pn) gw=pn.gateway; }
  const exS = data?.excludeStart || gw;
  const exE = data?.excludeEnd   || gw;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text"   class="vi" style="min-width:110px" value="${escH(data?.name||'')}"             placeholder="STAFF-LAN"></td>
    <td><input type="text"   class="vi" style="min-width:140px" value="${escH(data?.networkCidr||'')}"      placeholder="10.0.0.0/24" oninput="dhcpAutoFill(this)"></td>
    <td><input type="text"   class="vi" style="max-width:112px" value="${escH(gw)}"                         placeholder="10.0.0.1"></td>
    <td><input type="text"   class="vi" style="max-width:112px" value="${escH(data?.dns1||def1)}"           placeholder="8.8.8.8"></td>
    <td><input type="text"   class="vi" style="max-width:112px" value="${escH(data?.dns2||def2)}"           placeholder="8.8.4.4"></td>
    <td><input type="text"   class="vi" style="min-width:95px"  value="${escH(data?.domain||defD)}"         placeholder="corp.local"></td>
    <td><input type="text"   class="vi" style="max-width:112px" value="${escH(exS)}"                        placeholder="10.0.0.1"></td>
    <td><input type="text"   class="vi" style="max-width:112px" value="${escH(exE)}"                        placeholder="10.0.0.10"></td>
    <td><input type="number" class="vi" style="max-width:52px"  value="${data?.lease||defL}" min="1" max="365"></td>
    <td><button class="btn-del" onclick="this.closest('tr').remove()" title="Remove">×</button></td>
  `;
  document.getElementById('dhcp-tbody').appendChild(tr);
}

function dhcpAutoFill(inp) {
  const tr = inp.closest('tr');
  const ins = tr.querySelectorAll('input');
  const pn = parseNetworkCIDR(inp.value);
  if (!pn) return;
  if (!ins[2].value) ins[2].value = pn.gateway;
  if (!ins[6].value) ins[6].value = pn.gateway;
  if (!ins[7].value) ins[7].value = pn.gateway;
}

function getDhcpSubnets() {
  return Array.from(document.querySelectorAll('#dhcp-tbody tr')).map(tr => {
    const i = tr.querySelectorAll('input');
    return { name:i[0].value.trim(), networkCidr:i[1].value.trim(), gateway:i[2].value.trim(),
             dns1:i[3].value.trim(), dns2:i[4].value.trim(), domain:i[5].value.trim(),
             excludeStart:i[6].value.trim(), excludeEnd:i[7].value.trim(), lease:parseInt(i[8].value)||1 };
  }).filter(s=>s.networkCidr);
}

function setDhcpPlatform(p, btn) {
  dhcpPlatform = p;
  document.querySelectorAll('#dhcp-platform-tabs .platform-tab').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function generateDHCPConfig() {
  const subs = getDhcpSubnets();
  const err  = (m) => { document.getElementById('dhcp-error-text').textContent=m; document.getElementById('dhcp-error-bar').classList.add('visible'); };
  document.getElementById('dhcp-error-bar').classList.remove('visible');
  if (!subs.length) return err('Add at least one subnet / scope.');
  for (const s of subs) { if (!parseNetworkCIDR(s.networkCidr)) return err(`Invalid CIDR for "${s.name||'unnamed'}". Use format: 192.168.10.0/24`); }
  const platformMap = {
    'cisco-ios':  [genCiscoDHCP,   'cisco',      'CISCO IOS',           'Cisco IOS DHCP'],
    'windows-ps': [genWindowsDHCP, 'powershell', 'WINDOWS SERVER PS',   'Windows Server PowerShell'],
    'isc-dhcp':   [genISCDHCP,     'isc',        'ISC DHCP (dhcpd)',    'ISC DHCP (dhcpd.conf)'],
    'kea':        [genKeaDHCP,     'json',       'KEA DHCP4',           'Kea DHCP4 JSON'],
    'mikrotik':   [genMikrotikDHCP,'mikrotik',   'MIKROTIK ROUTEROS',   'MikroTik RouterOS']
  };
  const [fn, lang, badge, title] = platformMap[dhcpPlatform];
  const code = fn(subs);
  document.getElementById('dhcp-code-badge').textContent = badge;
  document.getElementById('dhcp-output-title').textContent = 'Generated: ' + title;
  document.getElementById('dhcp-code-pre').innerHTML = highlight(code, lang);
  const sec = document.getElementById('dhcp-output-section');
  sec.style.display = 'block';
  setTimeout(() => sec.scrollIntoView({behavior:'smooth',block:'nearest'}), 50);
}

function importScenarioToDHCP() {
  if (!scenarioResults.length) { alert('No scenario results yet — run the Scenario Planner first.'); return; }
  document.getElementById('dhcp-tbody').innerHTML = '';
  scenarioResults.forEach(r => addDhcpRow({ name:r.name, networkCidr:r.network+r.cidr, gateway:r.gateway }));
}

function importCalcToDHCP() {
  if (!lastResults.length) { alert('No calculator results yet — run the Subnet Calculator first.'); return; }
  document.getElementById('dhcp-tbody').innerHTML = '';
  lastResults.forEach(r => addDhcpRow({ name:`Subnet ${r.num}`, networkCidr:r.network+r.cidr, gateway:r.firstHost!=='—'?r.firstHost:'' }));
}

function resetDHCP() {
  document.getElementById('dhcp-tbody').innerHTML = '';
  document.getElementById('dhcp-output-section').style.display = 'none';
  document.getElementById('dhcp-error-bar').classList.remove('visible');
  initDhcpDefaults();
}

/* ── Cisco IOS DHCP ────────────────────────────────── */
function genCiscoDHCP(subs) {
  const ts = new Date().toISOString().slice(0,10); const L=[];
  L.push('!');
  L.push('! ============================================================');
  L.push('! Cisco IOS — DHCP Pool Configuration');
  L.push(`! Generated by Network Sloth — ${ts}`);
  L.push('! ============================================================');
  L.push('!');
  subs.forEach(s => {
    const p=parseNetworkCIDR(s.networkCidr); if(!p) return;
    const gw=s.gateway||p.gateway; const dns1=s.dns1||'8.8.8.8'; const dns2=s.dns2||''; const lease=s.lease||1;
    const exS=s.excludeStart||gw; const exE=s.excludeEnd||gw;
    const name=(s.name||'SCOPE').replace(/\s+/g,'-').toUpperCase().substring(0,32);
    L.push(`! ---- ${s.name||'Unnamed'}  ${s.networkCidr} ----`);
    L.push(`ip dhcp excluded-address ${exS} ${exE}`);
    L.push('!');
    L.push(`ip dhcp pool ${name}`);
    L.push(` network ${p.network} ${p.mask}`);
    L.push(` default-router ${gw}`);
    L.push(` dns-server ${dns1}${dns2?' '+dns2:''}`);
    if (s.domain) L.push(` domain-name ${s.domain}`);
    L.push(` lease ${lease}`);
    L.push('!');
  });
  return L.join('\n');
}

/* ── Windows Server PowerShell DHCP ───────────────── */
function genWindowsDHCP(subs) {
  const ts = new Date().toISOString().slice(0,10); const L=[];
  L.push(`# ============================================================`);
  L.push(`# Windows Server — DHCP Scope Configuration (PowerShell)`);
  L.push(`# Generated by Network Sloth — ${ts}`);
  L.push(`# Run in an elevated PowerShell session on your DHCP server`);
  L.push(`# Prereq: Install-WindowsFeature DHCP -IncludeManagementTools`);
  L.push(`# ============================================================`);
  L.push('');
  subs.forEach(s => {
    const p=parseNetworkCIDR(s.networkCidr); if(!p) return;
    const gw=s.gateway||p.gateway; const dns1=s.dns1||'8.8.8.8'; const dns2=s.dns2||'';
    const lease=s.lease||1; const exE=s.excludeEnd||gw; const exENum=ipToNum(exE);
    const bNum=ipToNum(p.broadcast);
    const rangeStart=numToIp((exENum+1)>>>0); const rangeEnd=numToIp((bNum-1)>>>0);
    const dnsArr=dns2?`"${dns1}","${dns2}"`:`"${dns1}"`;
    const name=s.name||'VLAN Scope';
    L.push(`# ---- ${name}  ${s.networkCidr} ----`);
    L.push(`Add-DhcpServerv4Scope \``);
    L.push(`    -Name "${name}" \``);
    L.push(`    -StartRange "${rangeStart}" \``);
    L.push(`    -EndRange "${rangeEnd}" \``);
    L.push(`    -SubnetMask "${p.mask}" \``);
    L.push(`    -LeaseDuration (New-TimeSpan -Days ${lease})`);
    L.push('');
    L.push(`Set-DhcpServerv4OptionValue \``);
    L.push(`    -ScopeId "${p.network}" \``);
    L.push(`    -Router "${gw}" \``);
    if (s.domain) { L.push(`    -DnsServer ${dnsArr} \``); L.push(`    -DnsDomain "${s.domain}"`); }
    else L.push(`    -DnsServer ${dnsArr}`);
    L.push('');
    if (s.excludeStart&&s.excludeEnd&&s.excludeStart!==s.excludeEnd) {
      L.push(`Add-DhcpServerv4ExclusionRange \``);
      L.push(`    -ScopeId "${p.network}" \``);
      L.push(`    -StartRange "${s.excludeStart}" \``);
      L.push(`    -EndRange "${s.excludeEnd}"`);
      L.push('');
    }
  });
  return L.join('\n');
}

/* ── ISC DHCP (dhcpd.conf) ─────────────────────────── */
function genISCDHCP(subs) {
  const ts=new Date().toISOString().slice(0,10); const L=[];
  const g1=subs[0]?.dns1||'8.8.8.8'; const g2=subs[0]?.dns2||'8.8.4.4'; const gDom=subs[0]?.domain||'corp.local';
  L.push(`# ============================================================`);
  L.push(`# ISC DHCP Server — dhcpd.conf`);
  L.push(`# Generated by Network Sloth — ${ts}`);
  L.push(`# Place in /etc/dhcp/dhcpd.conf  (or include from main config)`);
  L.push(`# ============================================================`);
  L.push('');
  L.push(`option domain-name "${gDom}";`);
  L.push(`option domain-name-servers ${g1}${g2?', '+g2:''};`);
  L.push(`default-lease-time 86400;`);
  L.push(`max-lease-time 172800;`);
  L.push(`authoritative;`);
  L.push('');
  subs.forEach(s => {
    const p=parseNetworkCIDR(s.networkCidr); if(!p) return;
    const gw=s.gateway||p.gateway; const dns1=s.dns1||g1; const dns2=s.dns2||g2;
    const lease=(s.lease||1)*86400; const exE=s.excludeEnd||gw;
    const exENum=ipToNum(exE); const bNum=ipToNum(p.broadcast);
    const rS=numToIp((exENum+1)>>>0); const rE=numToIp((bNum-1)>>>0);
    L.push(`# ---- ${s.name||'Unnamed'}  ${s.networkCidr} ----`);
    L.push(`subnet ${p.network} netmask ${p.mask} {`);
    L.push(`    range ${rS} ${rE};`);
    L.push(`    option routers ${gw};`);
    if (dns1!==g1||dns2!==g2) L.push(`    option domain-name-servers ${dns1}${dns2?', '+dns2:''};`);
    if (s.domain&&s.domain!==gDom) L.push(`    option domain-name "${s.domain}";`);
    if (lease!==86400) L.push(`    default-lease-time ${lease};`);
    L.push(`}`);
    L.push('');
  });
  return L.join('\n');
}

/* ── Kea DHCP4 JSON ────────────────────────────────── */
function genKeaDHCP(subs) {
  const ts=new Date().toISOString().slice(0,10);
  const header=`// ============================================================\n// Kea DHCP4 Configuration\n// Generated by Network Sloth — ${ts}\n// Merge into /etc/kea/kea-dhcp4.conf  (under "Dhcp4" → "subnet4")\n// ============================================================\n\n`;
  const subnet4=subs.map(s => {
    const p=parseNetworkCIDR(s.networkCidr); if(!p) return null;
    const gw=s.gateway||p.gateway; const dns1=s.dns1||'8.8.8.8'; const dns2=s.dns2||'';
    const exE=s.excludeEnd||gw; const exENum=ipToNum(exE); const bNum=ipToNum(p.broadcast);
    const rS=numToIp((exENum+1)>>>0); const rE=numToIp((bNum-1)>>>0);
    const optData=[
      {name:'routers',data:gw},
      {name:'domain-name-servers',data:dns2?`${dns1}, ${dns2}`:dns1}
    ];
    if (s.domain) optData.push({name:'domain-name',data:s.domain});
    return {
      subnet:`${p.network}/${p.cidrNum}`,
      pools:[{pool:`${rS} - ${rE}`}],
      'option-data':optData,
      'valid-lifetime':(s.lease||1)*86400,
      'user-context':{comment:s.name||'Unnamed scope'}
    };
  }).filter(Boolean);
  const cfg={Dhcp4:{'interfaces-config':{interfaces:['*']},'lease-database':{type:'memfile',persist:true,name:'/var/lib/kea/dhcp4.leases'},subnet4}};
  return header+JSON.stringify(cfg,null,2);
}

/* ── MikroTik RouterOS ─────────────────────────────── */
function genMikrotikDHCP(subs) {
  const ts=new Date().toISOString().slice(0,10); const L=[];
  L.push(`# ============================================================`);
  L.push(`# MikroTik RouterOS — DHCP Server Configuration`);
  L.push(`# Generated by Network Sloth — ${ts}`);
  L.push(`# Paste into RouterOS Terminal or Winbox Terminal`);
  L.push(`# Adjust interface names (e.g. vlan10, bridge1) to match your setup`);
  L.push(`# ============================================================`);
  L.push('');
  subs.forEach((s,idx) => {
    const p=parseNetworkCIDR(s.networkCidr); if(!p) return;
    const gw=s.gateway||p.gateway; const dns1=s.dns1||'8.8.8.8'; const dns2=s.dns2||'';
    const lease=`${s.lease||1}d`; const exE=s.excludeEnd||gw;
    const exENum=ipToNum(exE); const bNum=ipToNum(p.broadcast);
    const rS=numToIp((exENum+1)>>>0); const rE=numToIp((bNum-1)>>>0);
    const slug=(s.name||`scope${idx+1}`).replace(/\s+/g,'-').toLowerCase().substring(0,20);
    const vId=s.vlanId||(idx+1)*10;
    L.push(`# ---- ${s.name||'Unnamed'}  ${s.networkCidr} ----`);
    L.push(`/ip pool`);
    L.push(`add name=pool-${slug} ranges=${rS}-${rE}`);
    L.push('');
    L.push(`/ip dhcp-server`);
    L.push(`add name=dhcpd-${slug} address-pool=pool-${slug} interface=vlan${vId} lease-time=${lease} disabled=no`);
    L.push('');
    L.push(`/ip dhcp-server network`);
    L.push(`add address=${p.network}/${p.cidrNum} gateway=${gw} dns-server=${dns2?dns1+','+dns2:dns1}${s.domain?' domain='+s.domain:''}`);
    L.push('');
  });
  return L.join('\n');
}

/* ── Default seed rows ─────────────────────────────── */
function initFwDefaults() {
  addFwVlan({color:'green', name:'Staff LAN',  networkCidr:'192.168.10.0/24', vlanId:10, zone:'lan'});
  addFwVlan({color:'amber', name:'VoIP',       networkCidr:'192.168.20.0/26', vlanId:20, zone:'lan'});
  addFwVlan({color:'blue',  name:'Guest WiFi', networkCidr:'192.168.30.0/25', vlanId:30, zone:'guest'});
  addFwVlan({color:'red',   name:'Management', networkCidr:'192.168.99.0/28', vlanId:99, zone:'management'});
}
function initDhcpDefaults() {
  addDhcpRow({name:'Staff LAN',  networkCidr:'192.168.10.0/24'});
  addDhcpRow({name:'VoIP',       networkCidr:'192.168.20.0/26'});
  addDhcpRow({name:'Guest WiFi', networkCidr:'192.168.30.0/25'});
}
initFwDefaults();
initDhcpDefaults();
