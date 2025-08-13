// ====== State ======
let web3Modal;
let externalProvider; // from Web3Modal
let ethersProvider;
let signer;
let userAddress;
let chainId;

// ====== DOM ======
const connectBtn = document.getElementById('connectBtn');
const fetchBtn = document.getElementById('fetchBtn');
const mintBtn = document.getElementById('mintBtn');

const walletInfo = document.getElementById('walletInfo');
const signInfo = document.getElementById('signInfo');

const summarySection = document.getElementById('summarySection');
const breakdownSection = document.getElementById('breakdownSection');

const totalScoreEl = document.getElementById('totalScore');
const tierLabel = document.getElementById('tierLabel');
const summaryText = document.getElementById('summaryText');

const mGov = document.getElementById('m-gov');
const mDefi = document.getElementById('m-defi');
const mUniq = document.getElementById('m-uniq');
const mAir = document.getElementById('m-air');
const mSwaps = document.getElementById('m-swaps');
const mBal = document.getElementById('m-bal');

const pGov = document.getElementById('p-gov');
const pDefi = document.getElementById('p-defi');
const pUniq = document.getElementById('p-uniq');
const pAir = document.getElementById('p-air');
const pSwaps = document.getElementById('p-swaps');
const pBal = document.getElementById('p-bal');

const signatureSection = document.getElementById('signatureSection');
const signedMessageEl = document.getElementById('signedMessage');
const signatureEl = document.getElementById('signature');
const verifiedEl = document.getElementById('verified');

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  web3Modal = new window.Web3Modal.default({
    cacheProvider: false,
    theme: 'dark',
    providerOptions: WEB3MODAL_PROVIDER_OPTIONS
  });

  connectBtn.addEventListener('click', onConnect);
  fetchBtn.addEventListener('click', onFetch);
  mintBtn.addEventListener('click', onMint);
});

// ====== Connect & auto-sign ======
async function onConnect() {
  try {
    externalProvider = await web3Modal.connect();
    ethersProvider = new ethers.providers.Web3Provider(externalProvider);
    signer = ethersProvider.getSigner();
    userAddress = await signer.getAddress();

    const net = await ethersProvider.getNetwork();
    chainId = net.chainId;

    walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${net.name} (${chainId})</span>`;

    // Auto sign verification message
    await autoSignMessage();

    // Enable deliberate fetch step
    fetchBtn.disabled = false;

    // React to chain/account changes
    externalProvider.on && externalProvider.on('accountsChanged', handleAccountsChanged);
    externalProvider.on && externalProvider.on('chainChanged', handleChainChanged);
    externalProvider.on && externalProvider.on('disconnect', resetApp);
  } catch (e) {
    console.error('Connect error', e);
    walletInfo.innerHTML = `<span class="text-danger">Connection failed.</span>`;
  }
}

async function autoSignMessage() {
  try {
    const now = new Date().toISOString();
    const nonce = Math.floor(Math.random() * 1e9);
    const message = [
      'ProofDrop — Wallet Verification',
      `Address: ${userAddress}`,
      `ChainId: ${chainId}`,
      `Timestamp: ${now}`,
      `Nonce: ${nonce}`
    ].join('\n');

    const signature = await signer.signMessage(message);
    const recovered = ethers.utils.verifyMessage(message, signature);
    const ok = recovered.toLowerCase() === userAddress.toLowerCase();

    signedMessageEl.textContent = message;
    signatureEl.textContent = signature;
    verifiedEl.textContent = ok ? 'Yes' : 'No';
    verifiedEl.className = 'badge ' + (ok ? 'bg-success' : 'bg-danger');

    signInfo.innerHTML = ok ? `<span class="text-success">Signature verified.</span>` : `<span class="text-danger">Signature mismatch.</span>`;
    signatureSection.classList.remove('d-none');
  } catch (e) {
    console.error('Sign error', e);
    signInfo.innerHTML = `<span class="text-warning">Signing cancelled.</span>`;
  }
}

// ====== Fetch metrics (deliberate button) ======
async function onFetch() {
  if (!userAddress || !chainId) return;

  // Refresh provider context (in case user switched)
  ethersProvider = new ethers.providers.Web3Provider(externalProvider);
  signer = ethersProvider.getSigner();
  const net = await ethersProvider.getNetwork();
  chainId = net.chainId;
  walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${net.name} (${chainId})</span>`;

  const metrics = await fetchAllMetrics(userAddress, chainId);
  const points = {
    governance: scoreGovernance(metrics.governanceVotes),
    defi: scoreDeFi(metrics.defiTx),
    unique: scoreUniqueContracts(metrics.uniqueContracts),
    airdrops: scoreAirdrops(metrics.airdropsClaimed),
    swaps: scoreDexSwaps(metrics.dexSwaps),
    balance: scoreBalance(metrics.balanceUSD)
  };
  const total = Math.max(0, Math.min(100, Math.round(points.governance + points.defi + points.unique + points.airdrops + points.swaps + points.balance)));
  const tier = total >= 85 ? 'Platinum' : total >= 70 ? 'Gold' : total >= 50 ? 'Silver' : 'Bronze';

  // Render summary
  totalScoreEl.textContent = total;
  tierLabel.textContent = `Tier: ${tier}`;
  summaryText.innerHTML = `
    <div><strong>Address:</strong> ${shorten(userAddress)}</div>
    <div><strong>Chain:</strong> ${getChainName(chainId)} (${chainId})</div>
    <div><strong>Method:</strong> Live data via The Graph, Moralis, Covalent</div>
  `;
  summarySection.classList.remove('d-none');

  // Render breakdown
  mGov.textContent = `${metrics.governanceVotes} proposal(s) voted`;
  mDefi.textContent = `${metrics.defiTx} DeFi tx`;
  mUniq.textContent = `${metrics.uniqueContracts} contracts`;
  mAir.textContent = `${metrics.airdropsClaimed} airdrops`;
  mSwaps.textContent = `${metrics.dexSwaps} swaps`;
  mBal.textContent = `$${metrics.balanceUSD.toFixed(2)} USD`;

  pGov.textContent = `${points.governance}/20`;
  pDefi.textContent = `${points.defi}/20`;
  pUniq.textContent = `${points.unique}/15`;
  pAir.textContent = `${points.airdrops}/15`;
  pSwaps.textContent = `${points.swaps}/15`;
  pBal.textContent = `${points.balance}/15`;

  breakdownSection.classList.remove('d-none');

  // Enable mint
  mintBtn.disabled = false;

  // Cache last score for minting
  window._proofdropLastScore = { metrics, points, total, chainId, address: userAddress, chainName: getChainName(chainId) };
}

// ====== Data fetchers (Graph + Moralis + Covalent) ======
async function fetchAllMetrics(address, chainId) {
  // Default zeros so UI still works if APIs not configured
  const base = { governanceVotes: 0, defiTx: 0, uniqueContracts: 0, airdropsClaimed: 0, dexSwaps: 0, balanceUSD: 0 };

  const chainCfg = CHAIN_MAP[chainId];
  if (!chainCfg) return base;

  const [gov, defi, uniq, air, swaps, bal] = await Promise.allSettled([
    fetchGovernanceVotes(address, chainId),
    fetchDeFiTxCount(address, chainId),
    fetchUniqueContracts(address, chainId),
    fetchAirdropsClaimed(address, chainId),
    fetchDexSwaps(address, chainId),
    fetchBalanceUSD(address, chainId)
  ]);

  return {
    governanceVotes: gov.value ?? 0,
    defiTx: defi.value ?? 0,
    uniqueContracts: uniq.value ?? 0,
    airdropsClaimed: air.value ?? 0,
    dexSwaps: swaps.value ?? 0,
    balanceUSD: bal.value ?? 0
  };
}

// --- Governance via The Graph (placeholder query) ---
async function fetchGovernanceVotes(address, chainId) {
  const url = GRAPH_ENDPOINTS.governance[chainId];
  if (!url) return 0;

  // Example generic query (you must adapt to your governance subgraph schema)
  const query = `
    query Votes($voter: String!) {
      votes(where: { voter: $voter }) { id }
    }
  `;
  const data = await graphQuery(url, query, { voter: address.toLowerCase() });
  const count = (data && data.votes && data.votes.length) || 0;
  return count;
}

// --- DeFi engagement (tx count touching known protocols) via Moralis or Covalent ---
async function fetchDeFiTxCount(address, chainId) {
  // Try Moralis transactions and filter to known DeFi contracts (configure as needed)
  if (MORALIS_API_KEY) {
    const chainSlug = CHAIN_MAP[chainId].moralis;
    // Example: get last N tx and filter; adjust endpoint/params per your plan
    const url = `https://deep-index.moralis.io/api/v2.2/${address}/verbose?chain=${encodeURIComponent(chainSlug)}&limit=100`;
    const res = await fetch(url, { headers: { 'X-API-Key': MORALIS_API_KEY } });
    if (res.ok) {
      const json = await res.json();
      // TODO: Add real DeFi contract lists; here we treat any tx with input data as DeFi-ish
      const tx = Array.isArray(json.result) ? json.result : [];
      const defiLike = tx.filter(t => t.input && t.input !== '0x');
      return defiLike.length;
    }
  }
  return 0;
}

// --- Unique contract interactions via Moralis (unique to_address in tx) ---
async function fetchUniqueContracts(address, chainId) {
  if (MORALIS_API_KEY) {
    const chainSlug = CHAIN_MAP[chainId].moralis;
    const url = `https://deep-index.moralis.io/api/v2.2/${address}/transactions?chain=${encodeURIComponent(chainSlug)}&limit=100`;
    const res = await fetch(url, { headers: { 'X-API-Key': MORALIS_API_KEY } });
    if (res.ok) {
      const json = await res.json();
      const tx = Array.isArray(json.result) ? json.result : [];
      const uniq = new Set(tx.map(t => (t.to_address || '').toLowerCase()).filter(Boolean));
      return uniq.size;
    }
  }
  return 0;
}

// --- Airdrops claimed via Moralis (incoming ERC20/ERC721 transfers) OR your own allowlist logic ---
async function fetchAirdropsClaimed(address, chainId) {
  if (MORALIS_API_KEY) {
    const chainSlug = CHAIN_MAP[chainId].moralis;
    // Example: count ERC20/721/1155 transfers with from_address == known airdrop contracts (you maintain a list)
    // For scaffold, we'll approximate by counting token transfers received
    const url = `https://deep-index.moralis.io/api/v2.2/${address}/erc20/transfers?chain=${encodeURIComponent(chainSlug)}&direction=to&limit=100`;
    const res = await fetch(url, { headers: { 'X-API-Key': MORALIS_API_KEY } });
    let count = 0;
    if (res.ok) {
      const json = await res.json();
      const transfers = Array.isArray(json.result) ? json.result : [];
      // TODO: replace with whitelist of known airdrop contract addresses
      count += transfers.length;
    }
    // You can similarly check NFT transfers if desired
    return count;
  }
  return 0;
}

// --- DEX swaps via The Graph (preferred) or Covalent fallback ---
async function fetchDexSwaps(address, chainId) {
  const dexUrl = GRAPH_ENDPOINTS.dex[chainId];
  if (dexUrl) {
    // Example Uniswap-like swap query; adapt to the DEX schema you choose
    const query = `
      query Swaps($trader: Bytes!) {
        swaps(where: { to: $trader }) { id }
      }
    `;
    const data = await graphQuery(dexUrl, query, { trader: address.toLowerCase() });
    const count = (data && data.swaps && data.swaps.length) || 0;
    if (count) return count;
  }
  // Covalent fallback: count "swap" method signatures in recent tx (very rough)
  if (COVALENT_API_KEY) {
    const chain = CHAIN_MAP[chainId].covalent;
    const url = `https://api.covalenthq.com/v1/${chain}/address/${address}/transactions_v3/?key=${encodeURIComponent(COVALENT_API_KEY)}&page-size=100`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const txs = json?.data?.items || [];
      const swapLike = txs.filter(t => {
        const fname = (t?.decoded?.name || '').toLowerCase();
        return fname.includes('swap');
      });
      return swapLike.length;
    }
  }
  return 0;
}

// --- Balance USD via Covalent (native + tokens aggregated in USD) ---
async function fetchBalanceUSD(address, chainId) {
  if (!COVALENT_API_KEY) return 0;
  const chain = CHAIN_MAP[chainId].covalent;
  const url = `https://api.covalenthq.com/v1/${chain}/address/${address}/balances_v2/?quote-currency=USD&nft=false&no-nft-fetch=true&key=${encodeURIComponent(COVALENT_API_KEY)}`;
  const res = await fetch(url);
  if (res.ok) {
    const json = await res.json();
    const items = json?.data?.items || [];
    const usd = items.reduce((sum, it) => sum + (Number(it.quote) || 0), 0);
    return usd;
  }
  return 0;
}

// --- The Graph helper ---
async function graphQuery(url, query, variables) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

// ====== Scoring (exact rules) ======
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

// ====== Mint reputation NFT (data: URI metadata) ======
async function onMint() {
  try {
    if (!window._proofdropLastScore) {
      alert('Please fetch your reputation first.');
      return;
    }
    const { total, metrics, points, chainId: scoredChain, address } = window._proofdropLastScore;

    // Build metadata
    const meta = {
      name: `ProofDrop Reputation — ${total}`,
      description: `On-chain reputation minted by ProofDrop.\nAddress: ${address}\nChainId: ${scoredChain}\nScore: ${total}`,
      external_url: 'https://your-site.github.io/',
      attributes: [
        { trait_type: 'Score', value: total },
        { trait_type: 'Governance', value: points.governance },
        { trait_type: 'DeFi', value: points.defi },
        { trait_type: 'Unique Contracts', value: points.unique },
        { trait_type: 'Airdrops', value: points.airdrops },
        { trait_type: 'DEX Swaps', value: points.swaps },
        { trait_type: 'Balance Points', value: points.balance },
        { trait_type: 'ChainId', value: scoredChain }
      ],
      // raw metrics for transparency
      proofdrop_metrics: metrics
    };
    const tokenURI = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(meta))));

    // Ensure we are on the same chain as the NFT contract (user controls network)
    const net = await ethersProvider.getNetwork();
    if (net.chainId !== chainId) {
      // refresh local chainId
      chainId = net.chainId;
    }

    const contract = new ethers.Contract(NFT_MINT.CONTRACT_ADDRESS, NFT_MINT.ABI, signer);
    const fn = contract[NFT_MINT.FUNCTION_NAME];
    if (typeof fn !== 'function') {
      alert('Mint function not found in ABI config.');
      return;
    }

    const tx = await fn(userAddress, tokenURI);
    mintBtn.disabled = true;
    mintBtn.textContent = '⏳ Minting...';
    const receipt = await tx.wait();
    mintBtn.textContent = '✅ Minted';
    console.log('Mint receipt:', receipt);
  } catch (e) {
    console.error('Mint error', e);
    alert('Mint failed or cancelled.');
    mintBtn.disabled = false;
    mintBtn.textContent = '🪙 Mint My Reputation NFT';
  }
}

// ====== Handlers & utils ======
function handleAccountsChanged(accounts) {
  if (!accounts || accounts.length === 0) {
    resetApp();
  } else {
    userAddress = accounts[0];
    walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${getChainName(chainId)} (${chainId})</span>`;
  }
}
function handleChainChanged(_chainId) {
  try {
    chainId = Number(_chainId);
  } catch {
    chainId = parseInt(_chainId, 16);
  }
  walletInfo.innerHTML = `Wallet: <span class="text-light">${shorten(userAddress)}</span> · Network: <span class="text-light">${getChainName(chainId)} (${chainId})</span>`;
  // Require deliberate re-fetch after chain change
  mintBtn.disabled = true;
}

function resetApp() {
  web3Modal.clearCachedProvider && web3Modal.clearCachedProvider();
  externalProvider = null;
  ethersProvider = null;
  signer = null;
  userAddress = null;
  chainId = null;

  walletInfo.textContent = 'Not connected';
  signInfo.textContent = '';
  signedMessageEl.textContent = '';
  signatureEl.textContent = '';
  verifiedEl.textContent = 'No';
  verifiedEl.className = 'badge bg-secondary';
  signatureSection.classList.add('d-none');

  summarySection.classList.add('d-none');
  breakdownSection.classList.add('d-none');
  fetchBtn.disabled = true;
  mintBtn.disabled = true;
  mintBtn.textContent = '🪙 Mint My Reputation NFT';
}

function getChainName(id) {
  return CHAIN_MAP[id]?.name || `Chain ${id}`;
}
function shorten(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}
