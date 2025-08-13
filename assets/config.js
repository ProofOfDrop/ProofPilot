// ====== CONFIG: Replace placeholders before going live ======

// Web3Modal (v1) provider options
const WEB3MODAL_PROVIDER_OPTIONS = {
  walletconnect: {
    package: window.WalletConnectProvider.default,
    options: {
      // Provide RPCs for common testnets so WalletConnect can switch
      rpc: {
        11155111: 'https://rpc.sepolia.org',                 // Sepolia
        80002: 'https://rpc-amoy.polygon.technology',        // Polygon Amoy
        421614: 'https://sepolia-rollup.arbitrum.io/rpc',    // Arbitrum Sepolia
        84532: 'https://sepolia.base.org',                    // Base Sepolia
        1: 'wss://ethereum-rpc.publicnode.com'                //ETH Mainnet
      }
      // infuraId: '...optional...'
    }
  },
  coinbasewallet: {
    package: window.CoinbaseWalletSDK, // Coinbase Wallet SDK
    options: {
      appName: 'ProofDrop',
      rpc: 'https://rpc.sepolia.org', // default; wallet still lets users choose network
      darkMode: true
    }
  }
};

// API keys (these will be public on GitHub Pages; use free/demo keys)
const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjQwMDhkMTc4LWQxNmItNDU4Yy05MTRkLWNlZjU1YzZmMjdiMyIsIm9yZ0lkIjoiNDY0MzAyIiwidXNlcklkIjoiNDc3NjY3IiwidHlwZUlkIjoiYTNhODc2MmUtYWRiNS00MDk1LWFmNmEtNDhmNGQ5ZTA4NDVkIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ4MTI3MjQsImV4cCI6NDkxMDU3MjcyNH0.ssV3d1p5s7iDcYT2rZtosJ8J_z1cuuNvF9bU5X8O2HY';
const COVALENT_API_KEY = 'cqt_rQYkGgFvK3CcfjKw9K4gGBQmxyRK';

// Chain helpers for API routing
const CHAIN_MAP = {
  // connected chainId -> slugs used by APIs
  11155111: { name: 'Ethereum Sepolia', moralis: 'sepolia', covalent: 11155111 },
  80002:    { name: 'Polygon Amoy',     moralis: 'amoy',    covalent: 80002 },
  421614:   { name: 'Arbitrum Sepolia', moralis: 'arbitrum-sepolia', covalent: 421614 },
  84532:    { name: 'Base Sepolia',     moralis: 'base-sepolia',     covalent: 84532 },
  1:        { name: 'Ethereum Mainet',  moralis: 'eth', covalent: 1} 
};

// The Graph subgraphs (examples/placeholders – add your own per chain)
const GRAPH_ENDPOINTS = {
  // governance subgraph (DAO voting) per chain
  governance: {
    11155111: 'YOUR_GRAPH_GOVERNANCE_SUBGRAPH_URL_FOR_SEPOLIA',
    80002:    'YOUR_GRAPH_GOVERNANCE_SUBGRAPH_URL_FOR_AMOY',
    421614:   'YOUR_GRAPH_GOVERNANCE_SUBGRAPH_URL_FOR_ARB_SEPOLIA',
    84532:    'YOUR_GRAPH_GOVERNANCE_SUBGRAPH_URL_FOR_BASE_SEPOLIA'
  },
  // dex swaps subgraph per chain (e.g., Uniswap/Sushi if available on testnets)
  dex: {
    11155111: 'YOUR_GRAPH_DEX_SUBGRAPH_URL_FOR_SEPOLIA',
    80002:    'YOUR_GRAPH_DEX_SUBGRAPH_URL_FOR_AMOY',
    421614:   'YOUR_GRAPH_DEX_SUBGRAPH_URL_FOR_ARB_SEPOLIA',
    84532:    'YOUR_GRAPH_DEX_SUBGRAPH_URL_FOR_BASE_SEPOLIA'
  }
};

// NFT minting target (simple ERC-721 with a mint function that accepts tokenURI)
const NFT_MINT = {
  // Deploy a minimal ERC-721 on a testnet and paste its address here
  CONTRACT_ADDRESS: '0xYourNftContractAddressOnTestnet',
  // ABI must include a mint-like function (choose one you deploy)
  // Option A: function safeMint(address to, string memory uri) public returns (uint256)
  // Option B: function mintTo(address to, string memory uri) public returns (uint256)
  ABI: [
    {
      "inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"string","name":"uri","type":"string"}],
      "name":"safeMint",
      "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
      "stateMutability":"nonpayable","type":"function"
    }
  ],
  FUNCTION_NAME: 'safeMint'
};
