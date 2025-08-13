// === Config: supported test networks ===
const CHAINS = {
  sepolia: {
    key: 'sepolia',
    chainId: 11155111,
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    priceSymbol: 'ETH'
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    chainId: 80002,
    chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://amoy.polygonscan.com'],
    priceSymbol: 'MATIC'
  },
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    chainId: 421614,
    chainName: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://sepolia.arbiscan.io'],
    priceSymbol: 'ETH'
  },
  baseSepolia: {
    key: 'baseSepolia',
    chainId: 84532,
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    priceSymbol: 'ETH'
  }
};

// Static price map (demo only; used to value testnet balances as if they were mainnet)
const PRICE_USD = {
  ETH: 3000,
  MATIC: 0.7
};

// === State ===
let provider = null;
let signer = null;
let userAddress = null;
let perChainResults = {}; // key -> { metrics, points, score, balanceUSD }

// === DOM ===
const connectBtn = document.getElementById('connectBtn');
const fetchBtn = document.getElementById('fetchBtn');
const signBtn = document.getElementById('signBtn');

const walletInfo = document.getElementById('walletInfo');

const summarySection = document.getElementById('summarySection');
const totalScoreEl = document.getElementById('totalScore');
const tierLabel = document.getElementById('tierLabel');
const summaryText = document.getElementById('summaryText');

const chainsSection = document.getElementById('chainsSection');
const chainCards = document.getElementById('chainCards');

const signatureSection = document.getElementById('signatureSection');
const signedMessageEl = document.getElementById('signedMessage');
const signatureEl = document.getElementById('signature');
const verifiedEl = document.getElementById('verified');

// === Boot ===
document.addEventListener('DOMContentLoaded', () => {
  connectBtn.addEventListener('click', connectWallet);
  fetchBtn.addEventListener('click', fetchSelectedChains);
  signBtn.addEventListener('click', signProof);

  // Enable/disable fetch based on wallet connection
  document.querySelectorAll('.chain-check').forEach(cb => {
    cb.addEventListener('change', () => {
      fetchBtn.disabled = !userAddress || getSelectedChainKeys().length === 0;
    });
  });
});

// === Wallet connect ===
async function connectWallet() {
  if (!window.ethereum) {
    walletInfo.innerHTML = `<span class="text-warning">MetaMask not found. Install it to continue.</span>`;
    return;
  }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    const network = await provider.getNetwork();
    walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${network.name}</span>`;
    fetchBtn.disabled = getSelectedChainKeys().length === 0;
    signBtn.disabled = false;
  } catch (e) {
    console.error(e);
    walletInfo.innerHTML = `<span class="text-danger">Connection rejected.</span>`;
  }
}

// === Chain helpers ===
function toHexChainId(dec) {
  return '0x' + Number(dec).toString(16);
}

async function ensureChain(chainKey) {
  const cfg = CHAINS[chainKey];
  if (!cfg) throw new Error(`Unknown chain ${chainKey}`);
  const hexId = toHexChainId(cfg.chainId);

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexId }]
    });
  } catch (switchErr) {
    // 4902 = Unrecognized chain
    if (switchErr && switchErr.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexId,
          chainName: cfg.chainName,
          nativeCurrency: cfg.nativeCurrency,
          rpcUrls: cfg.rpcUrls,
          blockExplorerUrls: cfg.blockExplorerUrls
        }]
      });
      // Try switching again
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexId }]
      });
    } else {
      throw switchErr;
    }
  }
  // Refresh provider (network changed)
  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
}

// === Fetch metrics per selected chains ===
async function fetchSelectedChains() {
  if (!userAddress) return;

  const chainKeys = getSelectedChainKeys();
  if (chainKeys.length === 0) return;

  perChainResults = {};
  chainsSection.classList.remove('d-none');
  chainCards.innerHTML = ''; // clear

  for (const key of chainKeys) {
    const cfg = CHAINS[key];
    try {
      await ensureChain(key);
      const { metrics, points, score, balanceUSD } = await getMetricsAndScoreForChain(userAddress, cfg);
      perChainResults[key] = { metrics, points, score, balanceUSD, chainName: cfg.chainName };
      renderChainCard(key, perChainResults[key]);
    } catch (e) {
      console.error('Chain fetch error', key, e);
      renderChainCardError(key, cfg.chainName, e);
    }
  }

  renderSummary();
}

// Metrics + scoring for a chain
async function getMetricsAndScoreForChain(address, cfg) {
  // 1) Balance (real testnet balance via provider), priced as if mainnet asset
  const wei = await provider.getBalance(address);
  const eth = Number(ethers.utils.formatEther(wei));
  const price = PRICE_USD[cfg.priceSymbol] || 0;
  const balanceUSD = eth * price;

  // 2) Deterministic pseudo‑metrics (demo). Stable per (address + chain).
  const rng = seededRNG(address.toLowerCase() + '|' + cfg.key);

  const governanceVotes = randRange(rng, 0, 7);       // proposals voted
  const defiTx = randRange(rng, 0, 18);               // LP + lending/borrowing tx count
  const uniqueContracts = randRange(rng, 0, 30);      // unique contract interactions
  const airdropsClaimed = randRange(rng, 0, 8);       // airdrops claimed
  const dexSwaps = randRange(rng, 0, 35);             // swaps

  // 3) Scoring (exact spec)
  const pGov = scoreGovernance(governanceVotes);      // /20
  const pDeFi = scoreDeFi(defiTx);                    // /20
  const pUniq = scoreUniqueContracts(uniqueContracts);// /15
  const pAir = scoreAirdrops(airdropsClaimed);        // /15
  const pSwp = scoreDexSwaps(dexSwaps);               // /15
  const pBal = scoreBalance(balanceUSD);              // /15

  const points = { governance: pGov, defi: pDeFi, unique: pUniq, airdrops: pAir, swaps: pSwp, balance: pBal };
  const score = clamp(Math.round(pGov + pDeFi + pUniq + pAir + pSwp + pBal), 0, 100);

  const metrics = { governanceVotes, defiTx, uniqueContracts, airdropsClaimed, dexSwaps, balanceUSD };
  return { metrics, points, score, balanceUSD };
}

// === Scoring functions (your rules) ===
function scoreGovernance(votes) {
  if (votes >= 5) return 20;
  if (votes >= 3) return 15;
  if (votes >= 1) return 5;
  return 0;
}
function scoreDeFi(txCount) {
  if (txCount >= 10) return 20;
  if (txCount >= 5) return 10;
  if (txCount >= 1) return 5;
  return 0;
}
function scoreUniqueContracts(n) {
  if (n >= 20) return 15;
  if (n >= 10) return 10;
  if (n >= 5) return 5;
  return 0;
}
function scoreAirdrops(n) {
  if (n >= 5) return 15;
  if (n >= 3) return 10;
  if (n >= 1) return 5;
  return 0;
}
function scoreDexSwaps(n) {
  if (n >= 25) return 15;
  if (n >= 15) return 10;
  if (n >= 5) return 5;
  if (n >= 2) return 1;
  return 0;
}
function scoreBalance(usd) {
  if (usd > 250) return 15;
  if (usd >= 50) return 10;
  if (usd >= 10) return 5;
  return 0;
}

// === Rendering ===
function renderChainCard(chainKey, res) {
  const { chainName } = CHAINS[chainKey];
  const m = res.metrics;
  const p = res.points;

  const card = document.createElement('div');
  card.className = 'col-12 col-lg-6';
  card.innerHTML = `
    <div class="card card-translucent p-3 h-100">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h3 class="h6 m-0">${chainName}</h3>
        <span class="badge-pill">Score: <strong>${res.score}</strong></span>
      </div>
      <div class="metric"><span><strong>Governance votes:</strong> ${m.governanceVotes}</span><span>${p.governance}/20</span></div>
      <div class="metric"><span><strong>DeFi tx (LP + lend/borrow):</strong> ${m.defiTx}</span><span>${p.defi}/20</span></div>
      <div class="metric"><span><strong>Unique contracts:</strong> ${m.uniqueContracts}</span><span>${p.unique}/15</span></div>
      <div class="metric"><span><strong>Airdrops claimed:</strong> ${m.airdropsClaimed}</span><span>${p.airdrops}/15</span></div>
      <div class="metric"><span><strong>DEX swaps:</strong> ${m.dexSwaps}</span><span>${p.swaps}/15</span></div>
      <div class="metric"><span><strong>Balance (USD est.):</strong> $${m.balanceUSD.toFixed(2)}</span><span>${p.balance}/15</span></div>
      <div class="mt-3 text-end">
        <button class="btn btn-sm btn-outline-light" data-switch="${chainKey}">Switch wallet to ${chainName}</button>
      </div>
    </div>
  `;
  chainCards.appendChild(card);

  // Attach switch handler
  const btn = card.querySelector('button[data-switch]');
  btn.addEventListener('click', async () => {
    try {
      await ensureChain(chainKey);
      const net = await provider.getNetwork();
      walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${net.name}</span>`;
    } catch (e) {
      console.error(e);
      alert('Could not switch network.');
    }
  });
}

function renderChainCardError(chainKey, chainName, err) {
  const card = document.createElement('div');
  card.className = 'col-12 col-lg-6';
  card.innerHTML = `
    <div class="card card-translucent p-3 h-100">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h3 class="h6 m-0">${chainName}</h3>
        <span class="badge bg-danger">Error</span>
      </div>
      <div class="text-warning small">Failed to fetch metrics for ${chainName}. You may cancel or deny network switch prompts; try again.</div>
      <div class="mt-3 text-end">
        <button class="btn btn-sm btn-outline-light" data-switch="${chainKey}">Try switching to ${chainName}</button>
      </div>
    </div>
  `;
  chainCards.appendChild(card);

  const btn = card.querySelector('button[data-switch]');
  btn.addEventListener('click', async () => {
    try {
      await ensureChain(chainKey);
      const net = await provider.getNetwork();
      walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${net.name}</span>`;
    } catch (e) {
      console.error(e);
      alert('Could not switch network.');
    }
  });
}

function renderSummary() {
  const entries = Object.values(perChainResults);
  if (entries.length === 0) return;

  // Average score across fetched chains
  const avg = entries.reduce((acc, x) => acc + x.score, 0) / entries.length;
  const totalScore = Math.round(avg);
  const tier = totalScore >= 85 ? 'Platinum' : totalScore >= 70 ? 'Gold' : totalScore >= 50 ? 'Silver' : 'Bronze';

  totalScoreEl.textContent = totalScore;
  tierLabel.textContent = `Tier: ${tier}`;
  summaryText.innerHTML = `
    <div><strong>Chains scored:</strong> ${entries.length}</div>
    <div><strong>Method:</strong> Average of per‑chain scores (0–100 each)</div>
  `;

  summarySection.classList.remove('d-none');
}

// === Sign message (proof) ===
async function signProof() {
  if (!signer || !userAddress) return;

  const entries = Object.entries(perChainResults);
  const now = new Date().toISOString();
  const nonce = Math.floor(Math.random() * 1e9);

  const perChainLines = entries.map(([key, val]) => {
    return `- ${CHAINS[key].chainName}: score=${val.score} (gov=${val.points.governance}, defi=${val.points.defi}, uniq=${val.points.unique}, air=${val.points.airdrops}, swaps=${val.points.swaps}, bal=${val.points.balance})`;
  }).join('\n');

  const overall = Object.values(perChainResults).map(x => x.score);
  const total = overall.length ? Math.round(overall.reduce((a,b) => a+b, 0) / overall.length) : 0;

  const message = [
    'ProofDrop Testnet Reputation Proof',
    `Address: ${userAddress}`,
    `Timestamp: ${now}`,
    `Chains:`,
    perChainLines || '- (no chains scored)',
    `Total Score (avg): ${total}`,
    `Nonce: ${nonce}`
  ].join('\n');

  try {
    const signature = await signer.signMessage(message);
    const recovered = ethers.utils.verifyMessage(message, signature);
    const ok = recovered.toLowerCase() === userAddress.toLowerCase();

    signedMessageEl.textContent = message;
    signatureEl.textContent = signature;
    verifiedEl.textContent = ok ? 'Yes' : 'No';
    verifiedEl.className = 'badge ' + (ok ? 'bg-success' : 'bg-danger');

    signatureSection.classList.remove('d-none');
  } catch (e) {
    console.error(e);
    alert('Signing cancelled.');
  }
}

// === Utils ===
function getSelectedChainKeys() {
  return Array.from(document.querySelectorAll('.chain-check:checked')).map(cb => cb.value);
}

function shorten(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

// Deterministic RNG (xorshift) seeded by string hash
function seededRNG(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let x = h || 123456789;
  return function next() {
    // xorshift32
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}
function randRange(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
